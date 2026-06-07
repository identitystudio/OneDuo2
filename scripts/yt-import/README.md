# OneDuo YouTube Import — Phase 1 (local-only)

Paste a YouTube URL → download best-available video (**QuickTime-safe by default**:
H.264/avc1 + AAC/mp4a + MP4 container) → save to `downloads/oneduo-imports/` →
print final file path(s).

Avoids AV1 / VP9 / Opus. If the wanted height is only offered in AV1/VP9, downloads
best available, then **auto-creates a QuickTime-safe H.264/AAC copy** with ffmpeg.
The **original is kept**; a renamed clean copy is also written.

**Phase 1 scope: local save only.** No auto-upload, no enqueue, no OneDuo pipeline changes.

## Legal / use

Use only for videos **you own or have permission to download** (including your own
**unlisted** replay links). This tool does **not** bypass DRM, paid, private, or
login/age-gated videos — those return a clean error by design. No cookies/login bypass.

## Requirements

- `yt-dlp` — `brew install yt-dlp` (installed at `/opt/homebrew/bin/yt-dlp`)
- `ffmpeg` — present at `/usr/local/bin/ffmpeg` (used to merge video+audio → mp4)
- Node 18+

## Usage

```bash
# from OneDuo2/
node scripts/yt-import/oneduo-import.mjs <youtube-url>
node scripts/yt-import/oneduo-import.mjs <youtube-url> --quality 1440

# name the clean QuickTime copy
node scripts/yt-import/oneduo-import.mjs <youtube-url> --quality 1440 \
  --name Genesis-Claude-Day-1-YouTube-1440-QuickTime

# or via npm script
npm run yt:import -- <youtube-url> --quality 1080
```

### Output files

- `original` — exactly what YouTube served (kept as-is)
- `QuickTime` — H.264/AAC/MP4 clean copy. If original already H.264/AAC it is a fast
  remux (+faststart); otherwise transcoded with libx264/aac.
- `--name <basename>` sets the clean copy filename (`.mp4` added automatically).
  Default: `<title>-QuickTime.mp4`.

### Quality options

| `--quality` | Result |
|-------------|--------|
| `best` (default) | best available video+audio, merged to mp4 |
| `1440` | up to 1440p, mp4 |
| `1080` | up to 1080p, mp4 |
| `720`  | up to 720p, mp4 |
| `audio` | audio only, m4a |

Each non-audio tier falls back to best-available if the exact height isn't offered.

## Output

- Saved to: `downloads/oneduo-imports/<title> [<id>].mp4`
- Final absolute path printed on success (with size).
- `downloads/oneduo-imports/` is git-ignored — videos never committed.

## Errors (clean messages)

- **timed out** — exceeded 30-min cap
- **quality unavailable** — chosen height not offered (try `--quality best`)
- **video unavailable** — removed / deleted / region-blocked / bad URL
- **private/login/age required** — needs an authorized account; **not bypassed**

## Maintenance

YouTube changes formats periodically. If downloads break:

```bash
brew upgrade yt-dlp   # or: yt-dlp -U
```

## Not in this phase

- Auto-upload to `video-uploads` bucket / `enqueue-video` handoff (Phase 2, separate approval)
- App UI or worker integration
