import runpod
import os
import subprocess
import tempfile
import requests
import json
import math

_raw_url = os.environ.get("SUPABASE_URL", "")
# Ensure SUPABASE_URL always has https:// prefix
SUPABASE_URL = _raw_url if _raw_url.startswith("http") else f"https://{_raw_url}"
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def log(msg):
    print(f"[runpod-ffmpeg] {msg}", flush=True)


def download_video(video_url: str, output_path: str) -> bool:
    """Download video from URL to local path."""
    log(f"Downloading video from {video_url[:80]}...")
    try:
        with requests.get(video_url, stream=True, timeout=300) as r:
            r.raise_for_status()
            with open(output_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8 * 1024 * 1024):
                    f.write(chunk)
        size_mb = os.path.getsize(output_path) / (1024 * 1024)
        log(f"Downloaded {size_mb:.1f} MB")
        return True
    except Exception as e:
        log(f"Download failed: {e}")
        return False


def get_video_duration(video_path: str) -> float:
    """Get video duration in seconds using ffprobe."""
    try:
        result = subprocess.run([
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            video_path
        ], capture_output=True, text=True, timeout=30)
        data = json.loads(result.stdout)
        return float(data["format"]["duration"])
    except Exception as e:
        log(f"ffprobe failed: {e}")
        return 0.0


def extract_frames(video_path: str, frames_dir: str, fps: int) -> list:
    """Extract frames using FFmpeg at target FPS."""
    log(f"Extracting frames at {fps} FPS...")
    output_pattern = os.path.join(frames_dir, "frame_%05d.jpg")

    cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", f"fps={fps}",
        "-q:v", "3",          # JPEG quality (1=best, 31=worst), 3 is good balance
        "-vframes", "99999",  # no artificial cap
        output_pattern,
        "-y"
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

    if result.returncode != 0:
        log(f"FFmpeg error: {result.stderr[-500:]}")
        return []

    frames = sorted([
        os.path.join(frames_dir, f)
        for f in os.listdir(frames_dir)
        if f.endswith(".jpg")
    ])
    log(f"Extracted {len(frames)} frames")
    return frames


def upload_frame_to_supabase(local_path: str, storage_path: str) -> str | None:
    """Upload a single frame to Supabase Storage and return its public URL."""
    url = f"{SUPABASE_URL}/storage/v1/object/course-frames/{storage_path}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
    }
    try:
        with open(local_path, "rb") as f:
            resp = requests.post(url, headers=headers, data=f, timeout=30)
        if resp.status_code in (200, 201):
            return f"{SUPABASE_URL}/storage/v1/object/public/course-frames/{storage_path}"
        else:
            log(f"Upload failed for {storage_path}: {resp.status_code} {resp.text[:100]}")
            return None
    except Exception as e:
        log(f"Upload exception for {storage_path}: {e}")
        return None


def update_db_progress(table_name: str, record_id: str, progress: int, total_frames: int = None):
    """Update course/module progress in Supabase DB."""
    url = f"{SUPABASE_URL}/rest/v1/{table_name}?id=eq.{record_id}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    payload = {"progress": progress}
    if total_frames is not None:
        payload["total_frames"] = total_frames
    try:
        requests.patch(url, headers=headers, json=payload, timeout=10)
    except Exception as e:
        log(f"DB update failed: {e}")


def handler(job):
    """
    RunPod handler for FFmpeg frame extraction.

    Expected input:
    {
        "videoUrl": "https://...",
        "fps": 1,
        "courseId": "uuid",
        "recordId": "uuid",         # same as courseId for single-module courses
        "tableName": "courses",     # or "course_modules"
        "webhookUrl": "https://..."  # optional: Supabase webhook to call on completion
    }
    """
    job_input = job.get("input", {})

    video_url  = job_input.get("videoUrl")
    fps        = int(job_input.get("fps", 1))
    course_id  = job_input.get("courseId")
    record_id  = job_input.get("recordId") or course_id
    table_name = job_input.get("tableName", "courses")
    webhook_url = job_input.get("webhookUrl")

    if not video_url:
        return {"error": "Missing videoUrl"}
    if not course_id:
        return {"error": "Missing courseId"}

    log(f"Job start — courseId={course_id}, fps={fps}, table={table_name}")

    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, "input_video.mp4")
        frames_dir = os.path.join(tmpdir, "frames")
        os.makedirs(frames_dir, exist_ok=True)

        # 1. Download video
        if not download_video(video_url, video_path):
            return {"error": "Failed to download video"}

        # 2. Get duration
        duration = get_video_duration(video_path)
        log(f"Video duration: {duration:.1f}s")

        # 3. Extract frames
        frame_paths = extract_frames(video_path, frames_dir, fps)
        if not frame_paths:
            return {"error": "FFmpeg frame extraction failed"}

        total_frames = len(frame_paths)
        update_db_progress(table_name, record_id, 40, total_frames)

        # 4. Upload frames to Supabase Storage
        log(f"Uploading {total_frames} frames to Supabase Storage...")
        frame_urls = []
        failed_count = 0

        for i, local_path in enumerate(frame_paths):
            storage_path = f"{record_id}/frame_{i:05d}.jpg"
            public_url = upload_frame_to_supabase(local_path, storage_path)

            if public_url:
                frame_urls.append(public_url)
            else:
                failed_count += 1

            # Log progress every 100 frames
            if (i + 1) % 100 == 0:
                pct = 40 + int(((i + 1) / total_frames) * 50)
                update_db_progress(table_name, record_id, min(pct, 89))
                log(f"Uploaded {i + 1}/{total_frames} frames ({failed_count} failed)")

        log(f"Upload complete: {len(frame_urls)} succeeded, {failed_count} failed")

        # 5. Call webhook if provided
        result = {
            "frameUrls": frame_urls,
            "frameCount": len(frame_urls),
            "duration": duration,
            "courseId": course_id,
            "recordId": record_id,
            "tableName": table_name,
        }

        if webhook_url:
            try:
                log(f"Calling webhook: {webhook_url[:80]}")
                requests.post(
                    webhook_url,
                    json={
                        "output": result,
                        "status": "completed",
                        "source": "runpod-ffmpeg",
                    },
                    timeout=30,
                    headers={"Content-Type": "application/json"},
                )
                log("Webhook called successfully")
            except Exception as e:
                log(f"Webhook call failed: {e}")

        return result


runpod.serverless.start({"handler": handler})
