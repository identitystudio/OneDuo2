import runpod
import os
import subprocess
import tempfile
import requests
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image, ImageChops, ImageStat

_raw_url = os.environ.get("SUPABASE_URL", "")
# Ensure SUPABASE_URL always has https:// prefix
SUPABASE_URL = _raw_url if _raw_url.startswith("http") else f"https://{_raw_url}"
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


HANDLER_VERSION = "2026-04-16-v10"


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

    # Scale timeout: allow 2× the video's expected extraction time, minimum 10 min
    # ffprobe is called before this so duration is available via video metadata if needed,
    # but we use a generous fixed floor + frame-count heuristic via -vframes limit.
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)  # 1hr cap

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


def download_from_supabase(storage_path: str, local_path: str, bucket: str = "course-files") -> bool:
    """Download a file from Supabase Storage to a local path."""
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{storage_path}"
    headers = {"Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"}
    try:
        with requests.get(url, headers=headers, stream=True, timeout=300) as r:
            r.raise_for_status()
            with open(local_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8 * 1024 * 1024):
                    f.write(chunk)
        size_mb = os.path.getsize(local_path) / (1024 * 1024)
        log(f"Downloaded {storage_path} ({size_mb:.1f} MB)")
        return True
    except Exception as e:
        log(f"Download failed for {storage_path}: {e}")
        return False


def upload_to_supabase(local_path: str, storage_path: str, bucket: str = "course-files") -> bool:
    """Upload a local file to Supabase Storage."""
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{storage_path}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/pdf",
        "x-upsert": "true",
    }
    try:
        with open(local_path, "rb") as f:
            resp = requests.post(url, headers=headers, data=f, timeout=300)
        if resp.status_code in (200, 201):
            log(f"Uploaded {storage_path}")
            return True
        log(f"Upload failed for {storage_path}: {resp.status_code} {resp.text[:200]}")
        return False
    except Exception as e:
        log(f"Upload exception for {storage_path}: {e}")
        return False


def handle_merge_pdf(job_input: dict, webhook_url: str) -> dict:
    """
    Merge preamble + all part PDFs into one final PDF using pypdf.
    Files are downloaded from Supabase Storage one at a time to keep memory low.
    """
    try:
        from pypdf import PdfWriter, PdfReader
    except ImportError:
        import subprocess
        subprocess.run(["pip", "install", "--quiet", "pypdf"], check=True)
        from pypdf import PdfWriter, PdfReader
    import time

    course_id   = job_input.get("courseId")
    total_parts = int(job_input.get("totalParts", 0))
    course_title = job_input.get("courseTitle", "Course")
    user_email  = job_input.get("userEmail", "")
    total_frames = int(job_input.get("totalFrames", 0))

    if not course_id or not total_parts:
        return {"error": "Missing courseId or totalParts"}

    log(f"merge_pdf: courseId={course_id}, totalParts={total_parts}")

    with tempfile.TemporaryDirectory() as tmpdir:
        writer = PdfWriter()

        # Preamble
        preamble_local = os.path.join(tmpdir, "preamble.pdf")
        if not download_from_supabase(f"exports/{course_id}/preamble.pdf", preamble_local):
            return {"error": "Failed to download preamble"}
        reader = PdfReader(preamble_local)
        for page in reader.pages:
            writer.add_page(page)
        log(f"Added preamble ({len(reader.pages)} pages)")
        os.remove(preamble_local)

        # Parts — download, add, delete immediately to keep disk usage low
        for part in range(1, total_parts + 1):
            part_local = os.path.join(tmpdir, f"part_{part}.pdf")
            part_path  = f"exports/{course_id}/parts/part_{part}_of_{total_parts}.pdf"
            if not download_from_supabase(part_path, part_local):
                return {"error": f"Failed to download part {part}"}
            reader = PdfReader(part_local)
            for page in reader.pages:
                writer.add_page(page)
            log(f"Added part {part}/{total_parts} ({len(reader.pages)} pages)")
            os.remove(part_local)

        # Write merged PDF
        timestamp = int(time.time() * 1000)
        merged_local   = os.path.join(tmpdir, "merged.pdf")
        safe_title     = course_title.replace(" ", "_").replace("/", "-")
        storage_path   = f"exports/{course_id}/{timestamp}_{safe_title}-One_Duo.pdf"
        log("Writing merged PDF...")
        with open(merged_local, "wb") as f:
            writer.write(f)
        merged_size = os.path.getsize(merged_local)
        log(f"Merged PDF: {merged_size / (1024*1024):.1f} MB")

        # Upload
        if not upload_to_supabase(merged_local, storage_path):
            return {"error": "Failed to upload merged PDF"}

        result = {
            "step": "merge_pdf",
            "courseId": course_id,
            "storagePath": storage_path,
            "mergedSize": merged_size,
            "totalParts": total_parts,
            "totalFrames": total_frames,
            "courseTitle": course_title,
            "userEmail": user_email,
        }

        if webhook_url:
            try:
                log(f"Calling webhook: {webhook_url[:80]}")
                requests.post(
                    webhook_url,
                    json={"output": result, "status": "completed", "source": "runpod-ffmpeg"},
                    timeout=30,
                    headers={"Content-Type": "application/json"},
                )
                log("Webhook called successfully")
            except Exception as e:
                log(f"Webhook call failed: {e}")

        return result


def upload_frame_to_supabase(local_path: str, storage_path: str) -> str | None:
    """Upload a single frame to Supabase Storage and return its public URL.
    Retries up to 5 times with exponential backoff to handle 429 rate limits."""
    url = f"{SUPABASE_URL}/storage/v1/object/course-videos/{storage_path}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
    }
    for attempt in range(5):
        try:
            with open(local_path, "rb") as f:
                resp = requests.post(url, headers=headers, data=f, timeout=30)
            if resp.status_code in (200, 201):
                return f"{SUPABASE_URL}/storage/v1/object/public/course-videos/{storage_path}"
            if resp.status_code == 429:
                wait = 2 ** attempt  # 1, 2, 4, 8, 16 seconds
                log(f"Rate limited on {storage_path}, waiting {wait}s (attempt {attempt+1}/5)")
                time.sleep(wait)
                continue
            log(f"Upload failed for {storage_path}: {resp.status_code} {resp.text[:100]}")
            return None
        except Exception as e:
            if attempt < 4:
                time.sleep(2 ** attempt)
                continue
            log(f"Upload exception for {storage_path}: {e}")
            return None
    return None


def compute_pixel_diffs(frame_paths: list, subsample_every: int = 1) -> list:
    """
    Compute pixel diff score between consecutive uploaded frames.
    Score 0.0 = identical, 1.0 = completely different.
    Fast: uses 64x36 grayscale thumbnails — takes ~1ms per frame.
    """
    uploaded = [(i * subsample_every, p) for i, p in enumerate(frame_paths) if i % subsample_every == 0]
    total = len(uploaded)
    log(f"Computing pixel diffs for {total} frames (scene change detection)...")

    THUMB = (64, 36)  # tiny thumbnail — fast to compare
    results = []
    prev_thumb = None

    for pos, (original_idx, path) in enumerate(uploaded):
        try:
            img = Image.open(path).convert('L').resize(THUMB, Image.LANCZOS)
            if prev_thumb is None:
                diff_score = 1.0  # first frame always a scene change
            else:
                diff = ImageChops.difference(img, prev_thumb)
                stat = ImageStat.Stat(diff)
                diff_score = round(stat.mean[0] / 255.0, 4)
            prev_thumb = img

            # Log first 3 frames + every 100th so you can verify it's running
            if pos < 3 or pos % 100 == 0:
                log(f"Pixel diff frame {original_idx}: score={diff_score:.4f} ({'SCENE CHANGE' if diff_score >= 0.08 else 'same'})")

            results.append({
                "frameIndex": original_idx,
                "timestamp": original_idx,
                "pixel_diff_score": diff_score,
                "text": "",
            })
        except Exception as e:
            log(f"Pixel diff frame {original_idx}: ERROR — {e}")
            results.append({"frameIndex": original_idx, "timestamp": original_idx, "pixel_diff_score": 0.0, "text": ""})

    scene_changes = sum(1 for r in results if r["pixel_diff_score"] >= 0.08)
    log(f"Pixel diff complete: {scene_changes}/{total} scene changes detected (threshold=0.08)")
    return results


def save_frame_analyses(table_name: str, record_id: str, analyses: list):
    """Save frame_analyses (pixel diff scores) to Supabase DB."""
    url = f"{SUPABASE_URL}/rest/v1/{table_name}?id=eq.{record_id}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    try:
        resp = requests.patch(url, headers=headers, json={"frame_analyses": analyses}, timeout=30)
        if resp.status_code in (200, 204):
            log(f"Saved {len(analyses)} pixel diff scores to DB")
        else:
            log(f"Failed to save frame analyses: {resp.status_code} {resp.text[:100]}")
    except Exception as e:
        log(f"Exception saving frame analyses: {e}")


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
    action = job_input.get("action", "extract_frames")
    webhook_url = job_input.get("webhookUrl")

    if action == "merge_pdf":
        return handle_merge_pdf(job_input, webhook_url)

    video_url      = job_input.get("videoUrl")
    fps            = int(job_input.get("fps", 1))
    subsample_every = int(job_input.get("subsampleEvery", 1))  # upload every Nth frame (1 = all)
    course_id      = job_input.get("courseId")
    record_id      = job_input.get("recordId") or course_id
    table_name     = job_input.get("tableName", "courses")
    webhook_url    = job_input.get("webhookUrl")

    if not video_url:
        return {"error": "Missing videoUrl"}
    if not course_id:
        return {"error": "Missing courseId"}

    log(f"Handler v{HANDLER_VERSION} | Job input keys: {list(job_input.keys())}")
    log(f"Job start — courseId={course_id}, fps={fps}, table={table_name}, subsampleEvery={subsample_every}")

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
        upload_total = math.ceil(total_frames / subsample_every)
        update_db_progress(table_name, record_id, 40, upload_total)

        # Compute pixel diffs for scene change detection — fast, free, no OCR needed
        analyses = compute_pixel_diffs(frame_paths, subsample_every)
        if analyses:
            save_frame_analyses(table_name, record_id, analyses)

        # 4. Upload frames to Supabase Storage
        # subsample_every > 1 means only upload every Nth frame (quick mode)
        frames_to_upload = [(i, p) for i, p in enumerate(frame_paths) if i % subsample_every == 0]
        upload_total = len(frames_to_upload)
        if subsample_every > 1:
            log(f"Quick mode: uploading {upload_total}/{total_frames} frames (every {subsample_every}th)")
        else:
            log(f"Uploading {upload_total} frames to Supabase Storage (parallel, 20 workers)...")

        frame_urls_map = {}  # idx -> url, preserves order
        failed_count = 0
        completed_count = 0

        def upload_one(args):
            list_idx, local_path = args
            original_idx = list_idx * subsample_every
            storage_path = f"{record_id}/frame_{original_idx:05d}.jpg"
            url = upload_frame_to_supabase(local_path, storage_path)
            return list_idx, url

        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = {executor.submit(upload_one, item): item for item in frames_to_upload}
            for future in as_completed(futures):
                list_idx, url = future.result()
                completed_count += 1
                if url:
                    frame_urls_map[list_idx] = url
                else:
                    failed_count += 1

                if completed_count % 100 == 0:
                    pct = 40 + int((completed_count / upload_total) * 50)
                    update_db_progress(table_name, record_id, min(pct, 89))
                    log(f"Uploaded {completed_count}/{upload_total} frames ({failed_count} failed)")

        # Rebuild ordered list
        frame_urls = [frame_urls_map[i] for i in sorted(frame_urls_map)]
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
