#!/usr/bin/env node
/**
 * OneDuo YouTube Import — Phase 1 (local-only)
 *
 * Paste a YouTube URL, download best-available video (QuickTime-safe by default),
 * save into downloads/oneduo-imports/, print final file path(s).
 *
 * QuickTime-safe = H.264/avc1 video + AAC/mp4a audio + MP4 container.
 * Avoids AV1 / VP9 / Opus. If the wanted height is only offered in AV1/VP9,
 * downloads best available, then auto-creates a QuickTime-safe H.264/AAC copy
 * with ffmpeg. ORIGINAL is kept; a renamed clean copy is also written.
 *
 * NO auto-upload, NO enqueue, NO pipeline changes. Local save only.
 * NO cookies / login bypass. DRM / private / paid videos are NOT bypassed.
 *
 * Usage:
 *   node scripts/yt-import/oneduo-import.mjs <url> [--quality best|1440|1080|720|audio] [--name <basename>]
 *   npm run yt:import -- <url> --quality 1440 --name Genesis-Claude-Day-1-YouTube-1440-QuickTime
 *
 * Default quality: best
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DOWNLOAD_DIR = path.join(PROJECT_ROOT, 'downloads', 'oneduo-imports');

const YT_DLP = '/opt/homebrew/bin/yt-dlp';
const FFMPEG = '/usr/local/bin/ffmpeg';
const FFPROBE = '/usr/local/bin/ffprobe';

const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000; // 30 min hard cap

// ---- format selectors -------------------------------------------------------
// Prefer H.264 (avc1) video + AAC (mp4a) audio in MP4. Fall back to best at the
// height cap (may be AV1/VP9 — handled later by transcode), then absolute best.
function buildFormat(quality) {
  const h = { best: null, 1440: 1440, 1080: 1080, 720: 720 }[quality];
  const cap = h ? `[height<=${h}]` : '';
  // 1) avc1 video + m4a audio  2) any mp4 video + m4a  3) any video+audio  4) best
  return [
    `bv*[vcodec^=avc1]${cap}+ba[acodec^=mp4a]`,
    `bv*[ext=mp4]${cap}+ba[ext=m4a]`,
    `bv*${cap}+ba`,
    `b${cap}`,
    `bv*+ba/b`,
  ].join('/');
}
const VALID_QUALITIES = ['best', '1440', '1080', '720', 'audio'];

// QuickTime-safe codecs
const QT_VIDEO = new Set(['h264', 'avc1']);
const QT_AUDIO = new Set(['aac', 'mp4a']);

// ---- small spawn helper (capture, no live output) ---------------------------
function run(cmd, args) {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (err += d));
    c.on('error', (e) => resolve({ code: -1, out, err: e.message }));
    c.on('close', (code) => resolve({ code, out, err }));
  });
}

async function probeCodecs(file) {
  if (!fs.existsSync(FFPROBE)) return { v: null, a: null };
  const v = await run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', file]);
  const a = await run(FFPROBE, ['-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', file]);
  return { v: v.out.trim().toLowerCase(), a: a.out.trim().toLowerCase() };
}

// ---- arg parsing ------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  let url = null, quality = 'best', name = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--quality' || a === '-q') quality = String(args[++i] || '').toLowerCase();
    else if (a.startsWith('--quality=')) quality = a.split('=')[1].toLowerCase();
    else if (a === '--name' || a === '-n') name = String(args[++i] || '');
    else if (a.startsWith('--name=')) name = a.split('=')[1];
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else if (!a.startsWith('-')) url = a;
  }
  return { url, quality, name };
}

function printHelp() {
  console.log(`
OneDuo YouTube Import (Phase 1 — local save only)

  node scripts/yt-import/oneduo-import.mjs <youtube-url> [--quality <q>] [--name <basename>]

  --quality   best (default) | 1440 | 1080 | 720 | audio
  --name      output basename for QuickTime-safe copy (no extension needed)
  --help      show this

Saves to: downloads/oneduo-imports/
QuickTime-safe by default (H.264/AAC/MP4). Keeps original + clean copy.
No upload, no login bypass.
`);
}

function sanitize(s) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ---- error classification ---------------------------------------------------
function classifyError(stderr) {
  const s = (stderr || '').toLowerCase();
  if (/sign in to confirm your age|age-restricted|inappropriate for some users/.test(s))
    return 'age/login required — needs sign-in. NOT bypassed by design.';
  if (/private video|members-only|join this channel|sign in|login required|cookies/.test(s))
    return 'private/login required — needs an authorized account. NOT bypassed by design.';
  if (/requested format is not available|no video formats found|format is not available/.test(s))
    return 'quality unavailable — chosen quality not offered. Try --quality best.';
  if (/video unavailable|removed|does not exist|not available|terminated|deleted|blocked it in your country/.test(s))
    return 'video unavailable — removed, deleted, region-blocked, or wrong URL.';
  if (/drm|protected/.test(s)) return 'DRM-protected — cannot and will not be bypassed.';
  return null;
}

// ---- QuickTime-safe copy ----------------------------------------------------
// Always produce a clean renamed copy. If original already H.264/AAC -> stream
// copy (fast remux + faststart). Else -> transcode to libx264 + aac.
async function makeQuickTimeCopy(srcPath, outPath, codecs) {
  const safe = QT_VIDEO.has(codecs.v) && QT_AUDIO.has(codecs.a);
  const baseArgs = ['-y', '-i', srcPath];
  let args;
  if (safe) {
    console.log(`\nOriginal already QuickTime-safe (${codecs.v}/${codecs.a}). Remuxing clean copy...`);
    args = [...baseArgs, '-c', 'copy', '-movflags', '+faststart', outPath];
  } else {
    console.log(`\nOriginal is ${codecs.v || '?'}/${codecs.a || '?'} (not QuickTime-safe). Transcoding to H.264/AAC...`);
    args = [...baseArgs,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
      '-preset', 'medium', '-crf', '18',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', outPath];
  }
  const r = await run(FFMPEG, args);
  if (r.code !== 0 || !fs.existsSync(outPath)) {
    throw new Error(`ffmpeg QuickTime copy failed (exit ${r.code}).\n${r.err.split('\n').slice(-8).join('\n')}`);
  }
  return safe;
}

// ---- download ---------------------------------------------------------------
function ytDownload(url, quality) {
  return new Promise((resolve, reject) => {
    const isAudio = quality === 'audio';
    const outTemplate = path.join(DOWNLOAD_DIR, '%(title)s [%(id)s].%(ext)s');

    const ytArgs = [
      '--no-playlist', '--newline', '--progress',
      '--socket-timeout', '30', '--retries', '3', '--no-mtime',
      '--ffmpeg-location', FFMPEG,
      '-o', outTemplate, '--print', 'after_move:filepath', '--no-simulate',
    ];
    if (isAudio) {
      ytArgs.push('-x', '--audio-format', 'm4a');
    } else {
      ytArgs.push('-f', buildFormat(quality), '--merge-output-format', 'mp4', '--remux-video', 'mp4');
    }
    ytArgs.push(url);

    const child = spawn(YT_DLP, ytArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let finalPath = '', stderrBuf = '';

    const timer = setTimeout(() => {
      console.error('\nERROR: timed out — download exceeded 30 min. Killing.');
      child.kill('SIGKILL');
    }, DOWNLOAD_TIMEOUT_MS);

    child.stdout.on('data', (d) => {
      for (const line of d.toString().split('\n')) {
        if (!line.trim()) continue;
        if (line.startsWith(DOWNLOAD_DIR)) finalPath = line.trim();
        process.stdout.write(line + '\n');
      }
    });
    child.stderr.on('data', (d) => { stderrBuf += d; process.stderr.write(d.toString()); });
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(`failed to launch yt-dlp: ${e.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && finalPath && fs.existsSync(finalPath)) return resolve(finalPath);
      const friendly = classifyError(stderrBuf);
      reject(new Error(friendly || `yt-dlp error (exit ${code}) — see output above.`));
    });
  });
}

function mb(file) { return (fs.statSync(file).size / (1024 * 1024)).toFixed(1); }

// ---- main -------------------------------------------------------------------
async function main() {
  const { url, quality, name } = parseArgs(process.argv);

  if (!url) { console.error('ERROR: no YouTube URL given.\n'); printHelp(); process.exit(2); }
  if (!VALID_QUALITIES.includes(quality)) {
    console.error(`ERROR: invalid --quality "${quality}". Use: ${VALID_QUALITIES.join(', ')}`); process.exit(2);
  }
  if (!fs.existsSync(YT_DLP)) {
    console.error(`ERROR: yt-dlp not found at ${YT_DLP}. Install: brew install yt-dlp`); process.exit(2);
  }
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  const isAudio = quality === 'audio';
  console.log(`\nOneDuo YouTube Import`);
  console.log(`  quality : ${quality}${isAudio ? ' (m4a audio)' : ' (QuickTime-safe H.264/AAC/MP4)'}`);
  console.log(`  dest    : ${DOWNLOAD_DIR}`);
  console.log(`  url     : ${url}\n`);

  let original;
  try {
    original = await ytDownload(url, quality);
  } catch (e) {
    console.error(`\n❌ FAILED\n   ${e.message}`);
    process.exit(1);
  }

  console.log(`\n✅ Download OK`);
  console.log(`   original : ${original} (${mb(original)} MB)`);

  // Audio-only: m4a is already QuickTime-safe (AAC). Optionally rename a copy.
  if (isAudio) {
    if (name) {
      const dest = path.join(DOWNLOAD_DIR, sanitize(name).replace(/\.m4a$/i, '') + '.m4a');
      fs.copyFileSync(original, dest);
      console.log(`   clean    : ${dest} (${mb(dest)} MB)`);
    }
    console.log(`\n✅ DONE`);
    process.exit(0);
  }

  // Probe codecs, build clean QuickTime-safe copy.
  const codecs = await probeCodecs(original);
  console.log(`   codecs   : video=${codecs.v || '?'} audio=${codecs.a || '?'}`);

  const baseName = name
    ? sanitize(name).replace(/\.mp4$/i, '')
    : sanitize(path.basename(original, path.extname(original))) + '-QuickTime';
  const cleanPath = path.join(DOWNLOAD_DIR, baseName + '.mp4');

  // Avoid clobbering the original if names would collide.
  if (path.resolve(cleanPath) === path.resolve(original)) {
    console.log(`\n✅ DONE — original already at clean path.`);
    process.exit(0);
  }

  let wasSafe;
  try {
    wasSafe = await makeQuickTimeCopy(original, cleanPath, codecs);
  } catch (e) {
    console.error(`\n❌ QuickTime copy FAILED\n   ${e.message}`);
    console.error(`   Original kept: ${original}`);
    process.exit(1);
  }

  const cleanCodecs = await probeCodecs(cleanPath);
  console.log(`\n✅ DONE`);
  console.log(`   original     : ${original} (${mb(original)} MB)`);
  console.log(`   QuickTime    : ${cleanPath} (${mb(cleanPath)} MB)`);
  console.log(`   clean codecs : video=${cleanCodecs.v || '?'} audio=${cleanCodecs.a || '?'} ${wasSafe ? '(remuxed)' : '(transcoded)'}`);
  process.exit(0);
}

main().catch((e) => { console.error(`ERROR: ${e.message}`); process.exit(1); });
