import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import JSZip from "https://esm.sh/jszip@3.10.1";
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Duration sanity check: if DB duration implies < 0.5 FPS, it's likely a stale 300s default
function sanitizeDuration(duration: number, frameCount: number): number {
    if (duration > 0 && frameCount > 0 && duration / frameCount > 2) {
        console.warn(`[generate-pdf-backend] Duration sanity check: ${duration}s for ${frameCount} frames (${(duration / frameCount).toFixed(1)}s/frame). Capping to ${frameCount}s.`);
        return frameCount; // 1 FPS estimate
    }
    return duration;
}

// ============================================
// SAFE TEXT HELPER (pdf-lib uses WinAnsi encoding)
// ============================================

function safeText(text: unknown): string {
    if (text === null || text === undefined) return '';
    let s = String(text);
    // Replace non-WinAnsi characters with ASCII equivalents
    s = s.replace(/[\u2018\u2019\u201A]/g, "'")
        .replace(/[\u201C\u201D\u201E]/g, '"')
        .replace(/\u2026/g, '...')
        .replace(/\u2013/g, '-')
        .replace(/\u2014/g, '--')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u2022\u25CF\u25CB]/g, '*')
        .replace(/[\u2190-\u21FF]/g, '->')  // arrows
        .replace(/[\u2600-\u27BF]/g, '')    // misc symbols
        .replace(/[\uD800-\uDFFF]/g, '')    // surrogate pairs (emoji)
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, ''); // keep only printable Latin-1
    return s;
}

// Audio Intelligence Types
interface MusicCue {
    start: number;
    end: number;
    mood: string;
    genre?: string;
    description: string;
}

interface AmbientSound {
    timestamp: number;
    duration: number;
    sound: string;
    meaning: string;
}

interface AudienceReaction {
    timestamp: number;
    duration: number;
    type: string;
    context: string;
    intensity: string;
}

interface MeaningfulPause {
    timestamp: number;
    duration: number;
    meaning: string;
    screenplayNote: string;
}

interface AudioEvents {
    music_cues?: MusicCue[];
    ambient_sounds?: AmbientSound[];
    reactions?: AudienceReaction[];
    meaningful_pauses?: MeaningfulPause[];
    overall_audio_mood?: string;
}

interface CliffhangerMoment {
    peak_timestamp: number;
    resolution_timestamp: number;
    composite_confidence: number;
    description: string;
    signals?: {
        audio_intensity: boolean;
        visual_stasis: boolean;
        verbal_hint: boolean;
    };
}

interface ProsodyData {
    annotations?: Array<{
        timestamp: number;
        duration: number;
        annotation: string;
        confidence: number;
        type: string;
    }>;
    overall_tone?: string;
    key_moments?: string[];
    cliffhanger_moments?: CliffhangerMoment[];
}

// ============================================
// INTEL PACK TYPES
// ============================================

interface ChatMessage {
    timeStr: string;
    secondsOffset: number;
    speaker: string;
    message: string;
}

interface EnrichedFrame {
    url: string;
    globalIndex: number;
    timestamp: number;
    pixelDiffScore: number;
    reason: string;
    transcriptText: string;
    speakerLabel: string;
    chatExcerpt: string;
}

function formatTime(seconds: number): string {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Compress frame URL using Supabase Storage Image Transform API.
// Swaps /object/ → /render/image/ and appends width + quality params.
// Falls back to the original URL if the URL is not a Supabase storage URL.
function compressFrameUrl(url: string, width = 640, quality = 60): string {
    if (!url || typeof url !== 'string') return url;
    try {
        const transformed = url
            .replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
            .replace('/storage/v1/object/sign/', '/storage/v1/render/image/sign/');
        if (transformed === url) return url; // not a Supabase storage URL
        const sep = transformed.includes('?') ? '&' : '?';
        return `${transformed}${sep}width=${width}&quality=${quality}&resize=contain`;
    } catch {
        return url;
    }
}

// ============================================
// QUICK MODE: SCENE CHANGE DETECTION
// Uses OCR text similarity (Jaccard) to detect slide/content changes.
// Falls back to 1-frame-per-minute if no OCR data, or time-based if video has no text.
// ============================================

// Jaccard similarity between two strings (word-level)
// Returns 0.0 (completely different) to 1.0 (identical)

async function filterToSlideChanges(
    supabase: ReturnType<typeof createClient>,
    courseId: string,
    frameUrls: string[]
): Promise<string[]> {
    if (frameUrls.length === 0) return frameUrls;

    // Pixel diff threshold: frames with score >= this are considered a scene change
    // 0.08 = 8% average pixel difference (ignores minor motion, catches real slide changes)
    const SCENE_CHANGE_THRESHOLD = 0.08;

    const { data: courseRow } = await supabase
        .from('courses')
        .select('frame_analyses, video_duration_seconds')
        .eq('id', courseId)
        .maybeSingle();

    const frameAnalyses: any[] = courseRow?.frame_analyses || [];
    const durationSeconds = courseRow?.video_duration_seconds || 0;
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

    if (frameAnalyses.length === 0) {
        // No pixel diff data yet — fall back to 1 frame per minute
        const stride = Math.max(1, Math.round(frameUrls.length / durationMinutes));
        const filtered: string[] = [];
        for (let i = 0; i < frameUrls.length; i += stride) {
            filtered.push(frameUrls[i]);
        }
        console.log(`[generate-pdf-backend] No frame_analyses — fallback: ${filtered.length}/${frameUrls.length} frames (1/min, stride=${stride})`);
        return filtered.length > 0 ? filtered : frameUrls;
    }

    // Build frameIndex → pixel_diff_score map
    const diffMap = new Map<number, number>();
    for (const analysis of frameAnalyses) {
        const idx = analysis.frameIndex ?? analysis.frame_index;
        const score = analysis.pixel_diff_score ?? null;
        if (idx !== undefined && score !== null) diffMap.set(idx, score);
    }

    // If no pixel_diff_score data found (old OCR data), fall back to 1 frame per minute
    if (diffMap.size === 0) {
        const stride = Math.max(1, Math.round(frameUrls.length / durationMinutes));
        const filtered: string[] = [];
        for (let i = 0; i < frameUrls.length; i += stride) {
            filtered.push(frameUrls[i]);
        }
        console.log(`[generate-pdf-backend] No pixel diff scores — fallback: ${filtered.length}/${frameUrls.length} frames (1/min)`);
        return filtered.length > 0 ? filtered : frameUrls;
    }

    // Pixel diff scene change detection — include frame if its diff score >= threshold
    const filtered: string[] = [];
    for (let i = 0; i < frameUrls.length; i++) {
        const score = diffMap.get(i) ?? SCENE_CHANGE_THRESHOLD; // default: include if unknown
        if (score >= SCENE_CHANGE_THRESHOLD) {
            filtered.push(frameUrls[i]);
        }
    }

    console.log(`[generate-pdf-backend] Pixel diff scene detect: ${filtered.length}/${frameUrls.length} frames (threshold=${SCENE_CHANGE_THRESHOLD})`);
    return filtered.length > 0 ? filtered : frameUrls;
}

// ============================================
// INTEL PACK: CHAT PARSING
// ============================================

function isChatLine(line: string): boolean {
    return /^\d{2}:\d{2}:\d{2}/.test(line.trim());
}

function parseChatFile(content: string): ChatMessage[] {
    const messages: ChatMessage[] = [];
    for (const line of content.split('\n')) {
        if (!isChatLine(line)) continue;
        // Zoom formats:
        // "00:09:17	From Name :	Hello" (tab-delimited with From prefix)
        // "00:09:17	Name	Hello"
        // "[00:09:17] Name: Hello"
        const m =
            line.match(/^(\d{2}:\d{2}:\d{2})\s+From\s+(.+?):\s+(.+)$/) ||
            line.match(/^(\d{2}:\d{2}:\d{2})\t(.+?)\t(.+)$/) ||
            line.match(/^\[?(\d{2}:\d{2}:\d{2})\]?\s+(.+?):\s+(.+)$/);
        if (!m) continue;
        const [, timeStr, speaker, message] = m;
        const [h, mn, s] = timeStr.split(':').map(Number);
        messages.push({
            timeStr,
            secondsOffset: h * 3600 + mn * 60 + s,
            speaker: speaker.replace(/^From\s+/i, '').replace(/:$/, '').trim(),
            message: message.trim(),
        });
    }
    return messages;
}

function detectChatFile(supplementalFiles: any[]): ChatMessage[] {
    if (!supplementalFiles?.length) return [];
    for (const file of supplementalFiles) {
        if (!file.content?.trim()) continue;
        if (!(file.name || '').toLowerCase().endsWith('.txt')) continue;
        const lines = file.content.split('\n').filter((l: string) => l.trim());
        const chatLines = lines.filter((l: string) => isChatLine(l));
        if (chatLines.length >= 5 && chatLines.length / lines.length > 0.35) {
            console.log(`[intel-pack] Chat file detected: ${file.name} (${chatLines.length} messages)`);
            return parseChatFile(file.content);
        }
    }
    return [];
}

// ============================================
// INTEL PACK: FRAME ENRICHMENT
// ============================================

function classifyFrameReason(
    pixelDiffScore: number,
    isFirst: boolean,
    transcriptText: string,
    chatNearby: number,
): string {
    if (isFirst) return 'Session start';
    const t = transcriptText.toLowerCase();
    if (/https?:|\.com|password|passcode|pw:|download|template|resource/.test(t)) return 'Resource shown';
    if (/click|go to|type here|step \d|let me show|watch this|open|navigate/.test(t)) return 'Instructor demonstrating';
    if (chatNearby >= 5) return 'High chat activity';
    if (chatNearby >= 2) return 'Chat questions present';
    if (pixelDiffScore >= 0.4) return 'Major screen change';
    if (pixelDiffScore >= 0.15) return 'New screen or app opened';
    if (pixelDiffScore >= 0.08) return 'Significant content change';
    return 'Teaching state change';
}

function enrichFrames(
    filteredUrls: string[],
    allFrameUrls: string[],
    frameAnalyses: any[],
    videoDuration: number,
    transcript: any[],
    chatMessages: ChatMessage[],
): EnrichedFrame[] {
    const fps = videoDuration > 0 && allFrameUrls.length > 0 ? allFrameUrls.length / videoDuration : 1;
    const analysisMap = new Map<number, any>();
    for (const a of frameAnalyses) {
        const idx = a.frameIndex ?? a.frame_index;
        if (idx !== undefined) analysisMap.set(idx, a);
    }

    return filteredUrls.map((url, fi) => {
        const globalIndex = allFrameUrls.indexOf(url);
        const effectiveIndex = globalIndex >= 0 ? globalIndex : fi;
        const timestamp = effectiveIndex / Math.max(fps, 0.001);
        const analysis = analysisMap.get(effectiveIndex) || {};
        const pixelDiffScore = analysis.pixel_diff_score ?? 0.08;

        const seg = (transcript || []).find((s: any) => timestamp >= (s.start || 0) && timestamp <= (s.end || (s.start || 0) + 30))
            || (transcript || []).reduce((closest: any, s: any) => {
                if (!closest) return s;
                return Math.abs((s.start || 0) - timestamp) < Math.abs((closest.start || 0) - timestamp) ? s : closest;
            }, null);

        const transcriptText = seg?.text || '';
        const speakerLabel = seg?.speaker || '';
        const nearby = chatMessages.filter(c => Math.abs(c.secondsOffset - timestamp) <= 30);
        const chatExcerpt = nearby.slice(0, 3).map(c => `${c.timeStr} ${c.speaker}: ${c.message}`).join(' | ');
        const reason = classifyFrameReason(pixelDiffScore, fi === 0, transcriptText, nearby.length);

        return { url, globalIndex: effectiveIndex, timestamp, pixelDiffScore, reason, transcriptText, speakerLabel, chatExcerpt };
    });
}

// ============================================
// INTEL PACK: TEXT FILE BUILDERS
// ============================================

function buildFullTranscriptText(transcript: any[], courseTitle: string): string {
    const lines = [
        'FULL TRANSCRIPT',
        `Course: ${courseTitle}`,
        `Generated: ${new Date().toISOString()}`,
        `Segments: ${transcript.length}`,
        '',
        '='.repeat(60),
        '',
    ];
    for (const seg of transcript) {
        const start = formatTime(seg.start || 0);
        const end = seg.end ? ` -> ${formatTime(seg.end)}` : '';
        const speaker = seg.speaker ? `[${seg.speaker}] ` : '';
        lines.push(`[${start}${end}] ${speaker}${seg.text || ''}`);
        lines.push('');
    }
    return lines.join('\n');
}

function buildChatGoldText(chatMessages: ChatMessage[], courseTitle: string, transcript: any[]): string {
    if (chatMessages.length === 0) {
        return `CHAT INTELLIGENCE LOG\nCourse: ${courseTitle}\n\nChat unavailable for this session.\n`;
    }
    const lines = [
        'CHAT INTELLIGENCE LOG',
        `Course: ${courseTitle}`,
        `Generated: ${new Date().toISOString()}`,
        `Total messages: ${chatMessages.length}`,
        '',
        '='.repeat(60),
        '',
    ];

    const buckets = new Map<number, ChatMessage[]>();
    for (const msg of chatMessages) {
        const b = Math.floor(msg.secondsOffset / 300);
        if (!buckets.has(b)) buckets.set(b, []);
        buckets.get(b)!.push(msg);
    }

    for (const [bucket, msgs] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
        const startMin = bucket * 5;
        const endMin = startMin + 5;
        const bucketStart = bucket * 300;
        const bucketEnd = bucketStart + 300;
        const instructorVoice = (transcript || [])
            .filter((s: any) => (s.start || 0) >= bucketStart && (s.start || 0) < bucketEnd)
            .map((s: any) => s.text || '')
            .join(' ')
            .substring(0, 200);

        lines.push(`-- SECTION ${startMin}:00 - ${endMin}:00 --`);
        if (instructorVoice) lines.push(`Instructor: "${instructorVoice}${instructorVoice.length >= 200 ? '...' : ''}"`);
        lines.push('');
        for (const msg of msgs) lines.push(`  ${msg.timeStr}  ${msg.speaker}: ${msg.message}`);

        const confusion = msgs.filter(m => /confused|don.t understand|lost|what does|how do|why is/i.test(m.message));
        const questions = msgs.filter(m => m.message.includes('?'));
        if (confusion.length >= 2) lines.push(`  [Teaching flag: ${confusion.length} signs of confusion]`);
        else if (questions.length >= 2) lines.push(`  [${questions.length} questions raised]`);
        lines.push('');
    }
    return lines.join('\n');
}

function buildTimestampIndexText(enrichedFrames: EnrichedFrame[], courseTitle: string): string {
    const lines = [
        'TIMESTAMP INDEX',
        `Course: ${courseTitle}`,
        `Generated: ${new Date().toISOString()}`,
        `Frames: ${enrichedFrames.length}`,
        '',
        `${'Timestamp'.padEnd(10)} | ${'Topic'.padEnd(42)} | ${'Why kept'.padEnd(28)} | Chat`,
        `${'-'.repeat(10)}-+-${'-'.repeat(42)}-+-${'-'.repeat(28)}-+-${'-'.repeat(38)}`,
    ];
    for (const f of enrichedFrames) {
        const ts = formatTime(f.timestamp).padEnd(10);
        const topic = (f.transcriptText || '').replace(/\n/g, ' ').substring(0, 40).padEnd(42);
        const reason = f.reason.substring(0, 26).padEnd(28);
        const chat = f.chatExcerpt ? f.chatExcerpt.substring(0, 36) : '';
        lines.push(`${ts} | ${topic} | ${reason} | ${chat}`);
    }
    lines.push('');
    return lines.join('\n');
}

function buildResourcesSeenText(transcript: any[], chatMessages: ChatMessage[], frameAnalyses: any[], courseTitle: string): string {
    const allText = [
        ...transcript.map((s: any) => s.text || ''),
        ...chatMessages.map(c => c.message),
        ...frameAnalyses.map((a: any) => a.text || ''),
    ].join('\n');

    const urls = [...new Set((allText.match(/https?:\/\/[^\s\)\]"'<>\n]+/g) || []))];
    const passcodes = [...new Set((allText.match(/(?:password|passcode|pw|access code)[:\s]+([^\s\n,]{3,30})/gi) || []))];
    const toolKeywords = ['ChatGPT', 'Claude', 'Notion', 'Figma', 'Canva', 'Slack', 'Loom', 'Miro', 'Airtable',
        'HubSpot', 'Zapier', 'Make.com', 'Google Sheets', 'Google Docs', 'Google Drive', 'Dropbox',
        'GitHub', 'Cursor', 'OpenAI', 'Anthropic', 'Perplexity', 'Midjourney', 'Adobe', 'LinkedIn', 'YouTube'];
    const toolsFound = toolKeywords.filter(t => new RegExp(t, 'i').test(allText));
    const downloads = [...new Set((allText.match(/(?:download|template|resource|handout)[s]?[:\s]+([^\n.!?]{5,60})/gi) || []).map(d => d.trim()))].slice(0, 20);

    const lines = [
        'RESOURCES SEEN',
        `Course: ${courseTitle}`,
        `Generated: ${new Date().toISOString()}`,
        '',
        '='.repeat(60),
        '',
        `-- URLS (${urls.length}) --`,
        ...(urls.length > 0 ? urls.map(u => `  ${u}`) : ['  None detected.']),
        '',
        `-- PASSCODES / PASSWORDS (${passcodes.length}) --`,
        ...(passcodes.length > 0 ? passcodes.map(p => `  ${p}`) : ['  None detected.']),
        '',
        `-- TOOLS & APPS (${toolsFound.length}) --`,
        toolsFound.length > 0 ? `  ${toolsFound.join(', ')}` : '  None detected.',
        '',
        `-- DOWNLOADS & TEMPLATES (${downloads.length}) --`,
        ...(downloads.length > 0 ? downloads.map(d => `  ${d}`) : ['  None detected.']),
        '',
    ];
    return lines.join('\n');
}

function buildReadmeText(courseTitle: string, chatSource: string, frameCount: number, transcriptSegments: number): string {
    return [
        'TRAINING INTELLIGENCE PACK',
        `Course: ${courseTitle}`,
        `Generated: ${new Date().toISOString()}`,
        '',
        'This pack contains 5 files:',
        '',
        '01_full_transcript.txt',
        '  Complete timestamped transcript with speaker labels.',
        '  Use for: keyword search, AI analysis, quote sourcing.',
        '',
        '02_visual_training_spine.pdf',
        `  ${frameCount} meaningful teaching moments (screenshots).`,
        '  Each page: timestamp + screenshot + spoken words + why this frame was kept.',
        '  Use for: curriculum design, slide rebuilding, visual documentation.',
        '',
        '03_chat_gold.txt',
        `  Chat questions analyzed by section. Source: ${chatSource === 'file' ? 'Zoom chat export' : 'unavailable'}.`,
        '  Use for: FAQ development, confusion mapping, student pain points.',
        '',
        '04_timestamp_index.txt',
        '  Compact timeline: timestamp | topic | why kept | chat.',
        '  Use for: quick navigation, AI indexing, course mapping.',
        '',
        '05_resources_seen.txt',
        '  All URLs, tools, passcodes, downloads extracted from transcript + chat + OCR.',
        '  Use for: resource list building, link verification, toolkit documentation.',
        '',
        '-'.repeat(45),
        `Stats: ${transcriptSegments} transcript segments | ${frameCount} visual frames | chat: ${chatSource}`,
        '',
        'Generated by OneDuo Intelligence System.',
        'For authorized educational use only.',
    ].join('\n');
}

// ============================================
// INTEL PACK: VISUAL TRAINING SPINE PDF (02)
// ============================================

async function buildVisualTrainingSpinePDF(
    courseTitle: string,
    enrichedFrames: EnrichedFrame[],
    userEmail: string,
): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;
    const MARGIN = 42;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
    const FOOTER_Y = 30;
    const watermarkTs = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    const addFooter = (page: any) => {
        if (!userEmail) return;
        page.drawText(`OneDuo Training Intelligence | ${userEmail} | ${watermarkTs}`, {
            x: MARGIN, y: FOOTER_Y, size: 6, font, color: rgb(0.6, 0.6, 0.6),
        });
    };

    const newPage = () => {
        addFooter(currentPage);
        currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
    };

    const ensureSpace = (needed: number) => {
        if (y - needed < FOOTER_Y + 20) newPage();
    };

    const drawWrappedText = (text: string, opts: { x?: number; size?: number; usedFont?: any; color?: any; maxWidth?: number } = {}) => {
        const { x = MARGIN, size = 9, usedFont = font, color = rgb(0, 0, 0), maxWidth = CONTENT_WIDTH } = opts;
        const safe = safeText(text);
        if (!safe) return;
        const lineH = size * 1.3;
        const words = safe.split(' ');
        let line = '';
        for (const word of words) {
            const test = line ? `${line} ${word}` : word;
            if (usedFont.widthOfTextAtSize(test, size) > maxWidth && line) {
                ensureSpace(lineH);
                currentPage.drawText(line, { x, y, size, font: usedFont, color });
                y -= lineH;
                line = word;
            } else {
                line = test;
            }
        }
        if (line) {
            ensureSpace(lineH);
            currentPage.drawText(line, { x, y, size, font: usedFont, color });
            y -= lineH;
        }
    };

    // Cover page
    y = PAGE_HEIGHT - 120;
    currentPage.drawText(safeText(courseTitle), { x: MARGIN, y, size: 22, font: boldFont, color: rgb(0, 0, 0) });
    y -= 35;
    currentPage.drawText('02 -- VISUAL TRAINING SPINE', { x: MARGIN, y, size: 14, font, color: rgb(0.2, 0.2, 0.6) });
    y -= 18;
    currentPage.drawText(safeText(`${enrichedFrames.length} teaching moments | ${watermarkTs}`), {
        x: MARGIN, y, size: 9, font, color: rgb(0.4, 0.4, 0.4),
    });
    y -= 16;
    currentPage.drawText('Only meaningful visual moments. Each page = one teaching state.', {
        x: MARGIN, y, size: 8, font: italicFont, color: rgb(0.4, 0.4, 0.4),
    });
    addFooter(currentPage);

    for (let fi = 0; fi < enrichedFrames.length; fi++) {
        const frame = enrichedFrames[fi];
        newPage();

        // Header
        currentPage.drawText(safeText(`${formatTime(frame.timestamp)}  |  Frame ${frame.globalIndex + 1}  |  ${frame.reason}`), {
            x: MARGIN, y, size: 7, font: boldFont, color: rgb(0.2, 0.2, 0.5),
        });
        y -= 10;

        // Screenshot
        try {
            const resp = await fetch(compressFrameUrl(frame.url), { signal: AbortSignal.timeout(10000) });
            if (resp.ok) {
                const imgBytes = new Uint8Array(await resp.arrayBuffer());
                const ct = resp.headers.get('content-type') || '';
                const image = ct.includes('png') || frame.url.includes('.png')
                    ? await pdfDoc.embedPng(imgBytes)
                    : await pdfDoc.embedJpg(imgBytes);
                const imgW = Math.min(CONTENT_WIDTH, 420);
                const imgH = imgW * (image.height / image.width);
                ensureSpace(imgH + 5);
                currentPage.drawImage(image, { x: MARGIN, y: y - imgH, width: imgW, height: imgH });
                y -= imgH + 4;
            }
        } catch {
            currentPage.drawText('[Frame unavailable]', { x: MARGIN, y, size: 7, font: italicFont, color: rgb(0.7, 0.3, 0.3) });
            y -= 12;
        }

        // Transcript caption
        if (frame.transcriptText) {
            const speaker = frame.speakerLabel ? `${frame.speakerLabel}: ` : '';
            const caption = `"${speaker}${frame.transcriptText}"`.substring(0, 350);
            ensureSpace(24);
            currentPage.drawRectangle({
                x: MARGIN, y: y - 3, width: CONTENT_WIDTH, height: 1.5,
                color: rgb(0.8, 0.8, 0.8),
            });
            y -= 6;
            drawWrappedText(caption, { size: 8, usedFont: italicFont, color: rgb(0.15, 0.15, 0.15) });
        }

        // Chat excerpt
        if (frame.chatExcerpt) {
            ensureSpace(14);
            drawWrappedText(`Chat: ${frame.chatExcerpt}`, { size: 7, color: rgb(0.15, 0.4, 0.15) });
        }
    }

    addFooter(currentPage);
    return pdfDoc.save();
}

// ============================================
// PDF BUILDER (using pdf-lib)
// ============================================

async function buildPDF(
    courseTitle: string,
    modules: any[],
    userEmail: string,
    supplementalFiles?: any[],
    aiFidelityMode: boolean = false
): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const PAGE_WIDTH = 595.28;  // A4
    const PAGE_HEIGHT = 841.89;
    const MARGIN = 42;          // ~15mm
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
    const FOOTER_Y = 30;

    let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;
    let pageCount = 1;

    const watermarkTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    // Add watermark/footer to current page
    const addFooter = (page: any) => {
        if (!userEmail) return;
        page.drawText(`Proprietary Intel: OneDuo Thinking Layer | ${userEmail} | ${watermarkTimestamp}`, {
            x: MARGIN, y: FOOTER_Y, size: 6, font: font, color: rgb(0.6, 0.6, 0.6),
        });
        page.drawText('This artifact is for private authorized educational use only.', {
            x: PAGE_WIDTH / 2 - 120, y: FOOTER_Y - 8, size: 5, font: font, color: rgb(0.5, 0.5, 0.5),
        });
    };

    // Helper: new page
    const newPage = () => {
        addFooter(currentPage);
        currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        pageCount++;
        y = PAGE_HEIGHT - MARGIN;
        return currentPage;
    };

    // Helper: check space, add new page if needed
    const ensureSpace = (needed: number) => {
        if (y - needed < FOOTER_Y + 20) {
            newPage();
        }
    };

    // Helper: draw wrapped text and return new y
    const drawWrappedText = (text: string, options: {
        x?: number, size?: number, usedFont?: any, color?: any, maxWidth?: number, lineSpacing?: number
    } = {}) => {
        const { x = MARGIN, size = 9, usedFont = font, color = rgb(0, 0, 0), maxWidth = CONTENT_WIDTH, lineSpacing = size * 1.3 } = options;
        const safeT = safeText(text);
        if (!safeT) return;

        // Simple word-wrap
        const words = safeT.split(' ');
        let line = '';
        for (const word of words) {
            const testLine = line ? `${line} ${word}` : word;
            const testWidth = usedFont.widthOfTextAtSize(testLine, size);
            if (testWidth > maxWidth && line) {
                ensureSpace(lineSpacing);
                currentPage.drawText(line, { x, y, size, font: usedFont, color });
                y -= lineSpacing;
                line = word;
            } else {
                line = testLine;
            }
        }
        if (line) {
            ensureSpace(lineSpacing);
            currentPage.drawText(line, { x, y, size, font: usedFont, color });
            y -= lineSpacing;
        }
    };

    // ========== COVER PAGE ==========
    y = PAGE_HEIGHT - 120;

    currentPage.drawText(safeText(courseTitle), {
        x: MARGIN, y, size: 24, font: boldFont, color: rgb(0, 0, 0), maxWidth: CONTENT_WIDTH,
    });
    y -= 40;

    currentPage.drawText('MASTER COURSE ORIGIN LOG - ONE DUO ORIGIN', {
        x: MARGIN, y, size: 12, font: font, color: rgb(0.3, 0.3, 0.3),
    });
    y -= 20;

    const totalDuration = modules.reduce((sum: number, m: any) => {
        const dur = m.video_duration_seconds || 0;
        const frames = (m.frame_urls || []).length;
        return sum + sanitizeDuration(dur, frames);
    }, 0);
    currentPage.drawText(safeText(`${modules.length} Chapters | Total Duration: ${formatTime(totalDuration)}`), {
        x: MARGIN, y, size: 10, font: font, color: rgb(0.4, 0.4, 0.4),
    });
    y -= 15;

    currentPage.drawText(safeText(`Generated: ${watermarkTimestamp}`), {
        x: MARGIN, y, size: 9, font: font, color: rgb(0.4, 0.4, 0.4),
    });

    addFooter(currentPage);

    // ========== TABLE OF CONTENTS ==========
    newPage();
    currentPage.drawText('Table of Contents', {
        x: MARGIN, y, size: 20, font: boldFont, color: rgb(0, 0, 0),
    });
    y -= 25;

    // We'll update TOC entries after generating chapters (store page numbers)
    const tocPage = currentPage;
    const tocStartY = y;
    const chapterPages: { title: string; moduleNumber: number; pageIndex: number }[] = [];

    // ========== CHAPTERS ==========
    for (let i = 0; i < modules.length; i++) {
        const mod = modules[i];
        newPage();
        const chapterStartPageIndex = pdfDoc.getPageCount(); // 1-based

        chapterPages.push({
            title: mod.title || `Module ${i + 1}`,
            moduleNumber: mod.moduleNumber || mod.module_number || (i + 1),
            pageIndex: chapterStartPageIndex,
        });

        // Chapter header with background
        currentPage.drawRectangle({
            x: MARGIN, y: y - 5, width: CONTENT_WIDTH, height: 22,
            color: rgb(0, 0.7, 1),
        });

        currentPage.drawText(safeText(`Chapter ${mod.moduleNumber || mod.module_number || i + 1}: ${mod.title || `Module ${i + 1}`}`), {
            x: MARGIN + 5, y: y + 2, size: 14, font: boldFont, color: rgb(1, 1, 1),
        });
        y -= 32;

        // Duration (with sanity check)
        const correctedModDuration = sanitizeDuration(mod.video_duration_seconds || 0, (mod.frame_urls || []).length);
        if (correctedModDuration > 0) {
            currentPage.drawText(safeText(`Duration: ${formatTime(correctedModDuration)}`), {
                x: MARGIN, y, size: 9, font: font, color: rgb(0.4, 0.4, 0.4),
            });
            y -= 15;
        }

        // ========== INTELLIGENCE LAYERS ==========

        // Layer A: Key Moments
        const keyMoments = mod.key_moments_index || [];
        if (keyMoments.length > 0) {
            ensureSpace(30);
            currentPage.drawText('Layer A: Key Moments Index', {
                x: MARGIN, y, size: 12, font: boldFont, color: rgb(0, 0, 0),
            });
            y -= 14;

            for (const m of keyMoments) {
                ensureSpace(12);
                drawWrappedText(`[${m.timestamp || '--:--'}] - ${m.description}`, { x: MARGIN + 5, size: 8 });
            }
            y -= 8;
        }

        // Layer B: Concepts
        const concepts = mod.concepts_frameworks || [];
        if (concepts.length > 0) {
            ensureSpace(30);
            currentPage.drawText('Layer B: Concepts & Frameworks', {
                x: MARGIN, y, size: 12, font: boldFont, color: rgb(0, 0, 0),
            });
            y -= 14;

            for (const c of concepts) {
                ensureSpace(18);
                drawWrappedText(`* ${c.title || 'Concept'}`, { x: MARGIN + 5, size: 9, usedFont: boldFont });
                if (c.description) {
                    drawWrappedText(c.description, { x: MARGIN + 10, size: 8 });
                }
                y -= 4;
            }
            y -= 8;
        }

        // Layer C: Actionable Steps
        const steps = mod.implementation_steps || [];
        if (steps.length > 0) {
            ensureSpace(30);
            currentPage.drawText('Layer C: Actionable Steps', {
                x: MARGIN, y, size: 12, font: boldFont, color: rgb(0, 0, 0),
            });
            y -= 14;

            for (let si = 0; si < steps.length; si++) {
                const s = steps[si];
                ensureSpace(12);
                drawWrappedText(`${s.step_number || si + 1}. ${s.step_title || s.description}`, { x: MARGIN + 5, size: 8 });
            }
            y -= 8;
        }

        // Layer D: Hidden Patterns
        const patterns = mod.hidden_patterns || [];
        if (patterns.length > 0) {
            ensureSpace(30);
            currentPage.drawText('Layer D: Hidden Patterns & Insights', {
                x: MARGIN, y, size: 12, font: boldFont, color: rgb(0, 0, 0),
            });
            y -= 14;

            for (const p of patterns) {
                ensureSpace(18);
                drawWrappedText(`* ${p.title || 'Pattern'}`, { x: MARGIN + 5, size: 9, usedFont: boldFont });
                if (p.description) {
                    drawWrappedText(p.description, { x: MARGIN + 10, size: 8 });
                }
                y -= 4;
            }
            y -= 8;
        }

        // Layer E: Internal Self-Diagnostic Report (Award-Grade Cognition)
        const qualityReport = mod.quality_report || {};
        if (qualityReport.quality_score !== undefined) {
            ensureSpace(50);
            currentPage.drawRectangle({
                x: MARGIN, y: y - 60, width: CONTENT_WIDTH, height: 55,
                color: rgb(0.95, 0.95, 0.95),
                borderColor: rgb(0.8, 0.2, 0.2),
                borderWidth: 1
            });

            currentPage.drawText('Layer E: Internal Self-Diagnostic Report', {
                x: MARGIN + 5, y: y - 10, size: 10, font: boldFont, color: rgb(0.6, 0.1, 0.1)
            });

            const scoreText = `Quality Score: ${qualityReport.quality_score}/100 | OCR Coverage: ${(qualityReport.ocr_coverage * 100).toFixed(0)}% | Visual Clarity: ${(qualityReport.visual_clarity * 100).toFixed(0)}%`;
            currentPage.drawText(scoreText, { x: MARGIN + 10, y: y - 22, size: 8, font: boldFont, color: rgb(0, 0, 0) });

            if (qualityReport.gaps && qualityReport.gaps.length > 0) {
                const gapsText = `Identified Gaps: ${qualityReport.gaps.join(', ')}`;
                drawWrappedText(gapsText, { x: MARGIN + 10, size: 7, color: rgb(0.4, 0.4, 0.4) });
            }
            y -= 65;
        }

        // Action SOPs
        const sops = mod.action_sops || [];
        if (sops.length > 0) {
            ensureSpace(30);
            currentPage.drawText('Action SOPs (Repeatable Procedures)', {
                x: MARGIN, y, size: 12, font: boldFont, color: rgb(0, 0.4, 0),
            });
            y -= 14;

            for (const sop of sops) {
                ensureSpace(18);
                drawWrappedText(`[SOP] ${sop.title}`, { x: MARGIN + 5, size: 9, usedFont: boldFont, color: rgb(0, 0.3, 0) });
                if (sop.procedure) {
                    for (const pStep of sop.procedure) {
                        drawWrappedText(`- ${pStep}`, { x: MARGIN + 15, size: 8 });
                    }
                }
                y -= 4;
            }
            y -= 10;
        }

        // ========== TRANSCRIPT ==========
        const transcript = mod.transcript || [];
        if (transcript.length > 0) {
            ensureSpace(30);
            currentPage.drawText('Full Verbatim Transcript', {
                x: MARGIN, y, size: 12, font: boldFont, color: rgb(0, 0, 0),
            });
            y -= 14;

            for (const segment of transcript) {
                const speaker = segment.speaker ? `${segment.speaker}: ` : '';
                const line = `[${formatTime(segment.start || 0)}] ${speaker}${segment.text || ''}`;

                ensureSpace(30);
                drawWrappedText(line, { size: 9 });

                // ========== AUDIO PROFILE BLOCK ==========
                // Find matching prosody annotation for this segment timestamp
                const prosody = (mod.prosody_annotations?.annotations || []).find((a: any) =>
                    Math.abs(a.timestamp - (segment.start || 0)) < 2
                );

                if (prosody && prosody.profile) {
                    const p = prosody.profile;
                    ensureSpace(50);

                    // Profile Box
                    currentPage.drawRectangle({
                        x: MARGIN + 10, y: y - 45, width: CONTENT_WIDTH - 20, height: 42,
                        color: rgb(0.98, 0.98, 1),
                        borderColor: rgb(0, 0.4, 0.8),
                        borderWidth: 0.5
                    });

                    currentPage.drawText('[AUDIO PROFILE]', { x: MARGIN + 15, y: y - 10, size: 7, font: boldFont, color: rgb(0, 0.3, 0.6) });

                    const leftCol = `Speaking Rate: ${p.speaking_rate || 'N/A'}\nEnergy Trend: ${p.energy_trend || 'Stable'}`;
                    const rightCol = `Volume Variance: ${p.volume_variance || 'Normal'}\nPitch Variance: ${p.pitch_variance || 'Normal'}\nTone: ${p.tone_classification || 'Neutral'}`;

                    currentPage.drawText(leftCol, { x: MARGIN + 20, y: y - 22, size: 7, font: font, color: rgb(0.2, 0.2, 0.2), lineBias: 10 });
                    currentPage.drawText(rightCol, { x: MARGIN + 150, y: y - 22, size: 7, font: font, color: rgb(0.2, 0.2, 0.2), lineBias: 10 });

                    y -= 52;
                } else if (!prosody && !segment.text) {
                    ensureSpace(20);
                    currentPage.drawText('[AUDIO PROFILE] No vocal signal detected in this segment.', {
                        x: MARGIN + 15, y: y - 10, size: 7, font: font, color: rgb(0.5, 0.5, 0.5)
                    });
                    y -= 15;
                }
            }
            y -= 10;
        }

        // ========== VISUAL FRAMES ==========
        const frameUrls = mod.frame_urls || [];

        if (frameUrls.length > 0) {
            ensureSpace(30);
            currentPage.drawText('Visual Frames', {
                x: MARGIN, y, size: 12, font: boldFont, color: rgb(0, 0, 0),
            });
            y -= 14;

            const correctedDuration = sanitizeDuration(mod.video_duration_seconds || 0, frameUrls.length);
            const frameDuration = correctedDuration > 0 ? correctedDuration / Math.max(frameUrls.length, 1) : 10;
            console.log(`[buildPDF] ${correctedDuration}s video → embedding all ${frameUrls.length} frames`);

            for (let fi = 0; fi < frameUrls.length; fi++) {
                const frameUrl = compressFrameUrl(frameUrls[fi]);
                const timestamp = fi * frameDuration;

                ensureSpace(80);

                // Frame header
                currentPage.drawText(safeText(`Frame ${fi + 1} | ${formatTime(timestamp)}`), {
                    x: MARGIN, y, size: 7, font: boldFont, color: rgb(0.4, 0.4, 0.4),
                });
                y -= 10;

                // Try to embed frame image
                try {
                    const response = await fetch(frameUrl, { signal: AbortSignal.timeout(10000) });
                    if (response.ok) {
                        const imageBytes = new Uint8Array(await response.arrayBuffer());
                        let image;

                        const contentType = response.headers.get('content-type') || '';
                        if (contentType.includes('png') || frameUrl.includes('.png')) {
                            image = await pdfDoc.embedPng(imageBytes);
                        } else {
                            image = await pdfDoc.embedJpg(imageBytes);
                        }

                        const imgWidth = Math.min(CONTENT_WIDTH, 400);
                        const imgHeight = imgWidth * (image.height / image.width);

                        ensureSpace(imgHeight + 20);
                        currentPage.drawImage(image, {
                            x: MARGIN, y: y - imgHeight, width: imgWidth, height: imgHeight,
                        });
                        y -= imgHeight + 5;
                    }
                } catch (imgErr) {
                    currentPage.drawText('[Frame could not be loaded]', {
                        x: MARGIN, y, size: 7, font: italicFont, color: rgb(0.7, 0.3, 0.3),
                    });
                    y -= 12;
                }

                // ===== ASSEMBLY AI TRANSCRIPT CAPTION =====
                const transcriptSegment = transcript.find((seg: any) =>
                    timestamp >= (seg.start || 0) && timestamp <= (seg.end || seg.start || 0)
                ) || transcript.reduce((closest: any, seg: any) => {
                    if (!closest) return seg;
                    return Math.abs((seg.start || 0) - timestamp) < Math.abs((closest.start || 0) - timestamp) ? seg : closest;
                }, null);
                const spokenText: string = transcriptSegment?.text || '';
                if (spokenText) {
                    const fontSize = 8;
                    const truncated = spokenText.length > 400 ? spokenText.substring(0, 397) + '...' : spokenText;
                    const words = truncated.split(' ');
                    let lines = 0, line = '';
                    for (const word of words) {
                        const testLine = line ? `${line} ${word}` : word;
                        if (font.widthOfTextAtSize(testLine, fontSize) > CONTENT_WIDTH - 10) { lines++; line = word; }
                        else line = testLine;
                    }
                    if (line) lines++;
                    const rectHeight = (lines * (fontSize * 1.3)) + 8;
                    ensureSpace(rectHeight + 5);
                    currentPage.drawRectangle({
                        x: MARGIN, y: y - rectHeight, width: CONTENT_WIDTH, height: rectHeight,
                        color: rgb(0.95, 0.95, 0.95),
                        borderColor: rgb(0.75, 0.75, 0.75),
                        borderWidth: 0.5,
                    });
                    y -= 2;
                    drawWrappedText(`"${truncated}"`, {
                        x: MARGIN + 5, size: fontSize, usedFont: italicFont,
                        color: rgb(0.15, 0.15, 0.15), maxWidth: CONTENT_WIDTH - 10,
                    });
                    y -= 4;
                }
            }
        }

        // ========== AUDIO INTELLIGENCE TIMELINE ==========
        const audioEvents: AudioEvents = mod.audio_events || {};
        const prosodyData: ProsodyData[] = mod.prosody_annotations?.annotations || [];
        const musicCues = audioEvents.music_cues || [];
        const ambientSounds = audioEvents.ambient_sounds || [];
        const reactions = audioEvents.reactions || [];
        const pauses = audioEvents.meaningful_pauses || [];
        const annotations = prosodyData.annotations || [];
        const cliffhangers = prosodyData.cliffhanger_moments || [];

        const hasAudioData = musicCues.length > 0 || ambientSounds.length > 0 ||
            reactions.length > 0 || pauses.length > 0 ||
            annotations.length > 0 || cliffhangers.length > 0 ||
            audioEvents.overall_audio_mood || prosodyData.overall_tone;

        if (hasAudioData) {
            newPage();
            currentPage.drawText('Audio Events Timeline', {
                x: MARGIN, y, size: 18, font: boldFont, color: rgb(0, 0, 0),
            });
            y -= 25;

            // Summary Box
            if (audioEvents.overall_audio_mood || prosodyData.overall_tone) {
                const moodTextStr = audioEvents.overall_audio_mood ? `Mood: ${audioEvents.overall_audio_mood}` : '';
                const toneTextStr = prosodyData.overall_tone ? `Tone: ${prosodyData.overall_tone}` : '';
                const combinedMeta = [moodTextStr, toneTextStr].filter(Boolean).join(' | ');

                ensureSpace(40);
                currentPage.drawRectangle({
                    x: MARGIN, y: y - 25, width: CONTENT_WIDTH, height: 30,
                    color: rgb(0.94, 0.97, 1),
                    borderColor: rgb(0.4, 0.6, 0.8),
                    borderWidth: 0.5
                });
                currentPage.drawText('Audio Intelligence Summary:', { x: MARGIN + 5, y: y - 8, size: 9, font: boldFont, color: rgb(0.2, 0.4, 0.6) });
                currentPage.drawText(safeText(combinedMeta), { x: MARGIN + 5, y: y - 20, size: 8, font: italicFont, color: rgb(0.3, 0.3, 0.3) });
                y -= 40;
            }

            // Music
            if (musicCues.length > 0) {
                ensureSpace(60);
                currentPage.drawText('[MUSIC CUES]', { x: MARGIN, y, size: 10, font: boldFont, color: rgb(0.6, 0.4, 0) });
                y -= 12;
                for (const cue of musicCues.slice(0, 8)) {
                    drawWrappedText(`[${formatTime(cue.start)}-${formatTime(cue.end)}] ${cue.mood.toUpperCase()}: ${cue.description}`, { size: 8, color: rgb(0.4, 0.3, 0.1) });
                }
                y -= 10;
            }

            // Ambient
            if (ambientSounds.length > 0) {
                ensureSpace(60);
                currentPage.drawText('[AMBIENT / ENVIRONMENTAL]', { x: MARGIN, y, size: 10, font: boldFont, color: rgb(0.1, 0.4, 0.1) });
                y -= 12;
                for (const sound of ambientSounds.slice(0, 8)) {
                    drawWrappedText(`[${formatTime(sound.timestamp)}] ${sound.sound} - ${sound.meaning}`, { size: 8, color: rgb(0.1, 0.3, 0.1) });
                }
                y -= 10;
            }

            // Reactions
            if (reactions.length > 0) {
                ensureSpace(60);
                currentPage.drawText('[REACTIONS]', { x: MARGIN, y, size: 10, font: boldFont, color: rgb(0.6, 0.2, 0.4) });
                y -= 12;
                for (const r of reactions.slice(0, 8)) {
                    const intensity = r.intensity === 'strong' ? '!!!' : r.intensity === 'moderate' ? '!!' : '!';
                    drawWrappedText(`[${formatTime(r.timestamp)}] (${r.type}${intensity}) ${r.context}`, { size: 8, color: rgb(0.4, 0.2, 0.3) });
                }
                y -= 10;
            }

            // Prosody
            if (annotations.length > 0) {
                ensureSpace(60);
                currentPage.drawText('[SCREENPLAY PARENTHETICALS / PROSODY]', { x: MARGIN, y, size: 10, font: boldFont, color: rgb(0.2, 0.2, 0.5) });
                y -= 12;
                for (const ann of annotations.slice(0, 10)) {
                    drawWrappedText(`[${formatTime(ann.timestamp)}] (${ann.annotation})`, { size: 8, usedFont: italicFont, color: rgb(0.2, 0.2, 0.4) });
                }
                y -= 10;
            }

            // Pauses
            if (pauses.length > 0) {
                ensureSpace(60);
                currentPage.drawText('[MEANINGFUL PAUSES]', { x: MARGIN, y, size: 10, font: boldFont, color: rgb(0.3, 0.2, 0.5) });
                y -= 12;
                for (const p of pauses.slice(0, 10)) {
                    drawWrappedText(`[${formatTime(p.timestamp)}] ${p.screenplayNote} - ${p.meaning}`, { size: 8, color: rgb(0.2, 0.2, 0.4) });
                }
                y -= 10;
            }

            // Cliffhangers
            if (cliffhangers.length > 0) {
                ensureSpace(60);
                currentPage.drawText('[CLIFFHANGER MOMENTS]', { x: MARGIN, y, size: 10, font: boldFont, color: rgb(0.7, 0, 0) });
                y -= 12;
                for (const c of cliffhangers.slice(0, 5)) {
                    drawWrappedText(`[${formatTime(c.peak_timestamp)}] ${c.description}`, { size: 8, color: rgb(0.5, 0, 0) });
                }
                y -= 10;
            }
        }

        // Chapter separator
        if (i < modules.length - 1) {
            ensureSpace(10);
            currentPage.drawLine({
                start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y },
                color: rgb(0.8, 0.8, 0.8),
            });
            y -= 10;
        }

        addFooter(currentPage);
    }

    // ========== SUPPLEMENTARY DOCUMENTS ==========
    if (supplementalFiles && supplementalFiles.length > 0) {
        newPage();
        currentPage.drawText('SUPPLEMENTARY TRAINING DOCUMENTS', {
            x: MARGIN, y, size: 16, font: boldFont, color: rgb(0, 0, 0),
        });
        y -= 20;

        drawWrappedText(
            `The course creator uploaded ${supplementalFiles.length} additional document(s) to enhance this training.`,
            { size: 9, color: rgb(0.3, 0.3, 0.3) }
        );
        y -= 10;

        for (let fi = 0; fi < supplementalFiles.length; fi++) {
            const file = supplementalFiles[fi];
            ensureSpace(30);

            // File header
            currentPage.drawRectangle({
                x: MARGIN, y: y - 3, width: CONTENT_WIDTH, height: 14,
                color: rgb(0.94, 0.97, 1),
                borderColor: rgb(0.4, 0.6, 0.9),
                borderWidth: 0.5,
            });
            currentPage.drawText(safeText(`[${fi + 1}/${supplementalFiles.length}] ${file.name}`), {
                x: MARGIN + 3, y: y + 2, size: 9, font: boldFont, color: rgb(0.1, 0.1, 0.4),
            });
            y -= 18;

            if (file.content?.trim()) {
                const contentToShow = file.content.length > 8000
                    ? file.content.substring(0, 8000) + `\n\n[... Content truncated. Full: ${file.content.length} chars ...]`
                    : file.content;
                drawWrappedText(contentToShow, { size: 8, x: MARGIN + 4 });
            } else {
                drawWrappedText('[No text content could be extracted from this file]', {
                    size: 8, usedFont: italicFont, color: rgb(0.5, 0.5, 0.5),
                });
            }
            y -= 10;
        }

        addFooter(currentPage);
    }

    // ========== UPDATE TOC ==========
    let tocY = tocStartY;
    for (const ch of chapterPages) {
        const title = safeText(`Chapter ${ch.moduleNumber}: ${ch.title}`);
        const truncTitle = title.length > 60 ? title.substring(0, 57) + '...' : title;

        tocPage.drawText(truncTitle, {
            x: MARGIN, y: tocY, size: 10, font: font, color: rgb(0, 0, 0),
        });
        tocPage.drawText(`p.${ch.pageIndex}`, {
            x: PAGE_WIDTH - MARGIN - 30, y: tocY, size: 10, font: boldFont, color: rgb(0, 0, 0),
        });
        tocY -= 15;
    }

    addFooter(tocPage);

    return pdfDoc.save();
}

// ============================================
// MAIN HANDLER
// ============================================

// ============================================
// PART PDF BUILDER (visual transcription only)
// ============================================

// ============================================
// PREAMBLE PDF (Cover + AI Knowledge Layer + Full Verbatim Transcript)
// ============================================

async function buildPreamblePDF(
    courseTitle: string,
    modules: any[],
    userEmail: string,
    contentType: string = 'course',
): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;
    const MARGIN = 42;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
    const FOOTER_Y = 30;

    let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;
    const watermarkTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    const addFooter = (page: any) => {
        page.drawText(`Proprietary Intel: OneDuo Thinking Layer | Authorized User: ${safeText(userEmail)} | Distilled: ${watermarkTimestamp}`, {
            x: MARGIN, y: FOOTER_Y, size: 6, font, color: rgb(0.6, 0.6, 0.6),
        });
        page.drawText('This artifact is for private authorized educational use only.', {
            x: PAGE_WIDTH / 2 - 120, y: FOOTER_Y - 8, size: 5, font, color: rgb(0.5, 0.5, 0.5),
        });
    };

    const newPage = () => {
        addFooter(currentPage);
        currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
        return currentPage;
    };

    const ensureSpace = (needed: number) => {
        if (y - needed < FOOTER_Y + 20) newPage();
    };

    const drawWrappedText = (text: string, opts: { x?: number; size?: number; usedFont?: any; color?: any; maxWidth?: number } = {}) => {
        const { x = MARGIN, size = 9, usedFont = font, color = rgb(0, 0, 0), maxWidth = CONTENT_WIDTH } = opts;
        const t = safeText(text);
        if (!t) return;
        const words = t.split(' ');
        let line = '';
        for (const word of words) {
            const testLine = line ? `${line} ${word}` : word;
            if (usedFont.widthOfTextAtSize(testLine, size) > maxWidth && line) {
                ensureSpace(size * 1.4);
                currentPage.drawText(line, { x, y, size, font: usedFont, color });
                y -= size * 1.4;
                line = word;
            } else {
                line = testLine;
            }
        }
        if (line) {
            ensureSpace(size * 1.4);
            currentPage.drawText(line, { x, y, size, font: usedFont, color });
            y -= size * 1.4;
        }
    };

    // ---- COVER PAGE ----
    y = PAGE_HEIGHT - 120;
    currentPage.drawText(safeText(courseTitle), { x: MARGIN, y, size: 28, font: boldFont, color: rgb(0, 0, 0) });
    y -= 50;
    currentPage.drawText('MASTER COURSE ORIGIN LOG - ONE DUO ORIGIN', { x: MARGIN, y, size: 12, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 20;
    const totalDuration = modules.reduce((sum: number, m: any) => sum + sanitizeDuration(m.video_duration_seconds || 0, (m.frame_urls || []).length), 0);
    currentPage.drawText(safeText(`${modules.length} Chapters (Modules) | Verbatim Transcripts Included`), { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 14;
    currentPage.drawText(safeText(`Total Duration: ${formatTime(totalDuration)}`), { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    addFooter(currentPage);

    // ---- TABLE OF CONTENTS ----
    newPage();
    currentPage.drawText('Table of Contents', { x: MARGIN, y, size: 20, font: boldFont, color: rgb(0, 0, 0) });
    y -= 25;
    for (let i = 0; i < modules.length; i++) {
        const mod = modules[i];
        currentPage.drawText(safeText(`Chapter ${mod.module_number || i + 1}: ${mod.title || `Module ${i + 1}`}`), { x: MARGIN, y, size: 11, font, color: rgb(0, 0, 0) });
        y -= 16;
    }

    // ---- PER-MODULE: AI Knowledge Layer + Reasoning Layer + Full Verbatim Transcript ----
    const klSections = [
        { key: 'primary_topic',        label: 'PRIMARY TOPIC' },
        { key: 'outcome',              label: 'OUTCOME' },
        { key: 'executive_summary',    label: 'EXECUTIVE SUMMARY' },
        { key: 'core_concepts',        label: 'CORE CONCEPTS' },
        { key: 'frameworks',           label: 'FRAMEWORKS / MODELS' },
        { key: 'visual_segments',      label: 'VISUAL SEGMENTS' },
        { key: 'key_claims',           label: 'KEY CLAIMS / THESIS' },
        { key: 'questions',            label: 'QUESTIONS THIS MODULE ANSWERS' },
        { key: 'actionable_takeaways', label: 'ACTIONABLE TAKEAWAYS' },
        { key: 'cross_module_links',   label: 'CROSS-MODULE LINK OPPORTUNITIES' },
        { key: 'important_quotes',     label: 'IMPORTANT QUOTES' },
        { key: 'prompt_starters',      label: 'PROMPT STARTERS FOR AI' },
        { key: 'concept_tags',         label: 'CONCEPT TAGS' },
        { key: 'retrieval_tags',       label: 'RETRIEVAL TAGS' },
    ];

    const reasoningSections = [
        { key: 'decision_rules',       label: 'DECISION RULES' },
        { key: 'reasoning_patterns',   label: 'REASONING PATTERNS' },
        { key: 'speaker_belief_system',label: 'SPEAKER BELIEF SYSTEM' },
        { key: 'cause_effect_chains',  label: 'CAUSE & EFFECT CHAINS' },
        { key: 'hidden_patterns',      label: 'HIDDEN PATTERNS' },
    ];

    for (let i = 0; i < modules.length; i++) {
        const mod = modules[i];
        newPage();

        // Chapter header bar
        currentPage.drawRectangle({ x: MARGIN, y: y - 5, width: CONTENT_WIDTH, height: 22, color: rgb(0, 0.7, 1) });
        currentPage.drawText(safeText(`Chapter ${mod.module_number || i + 1}: ${mod.title || `Module ${i + 1}`}`), {
            x: MARGIN + 5, y: y + 2, size: 14, font: boldFont, color: rgb(1, 1, 1),
        });
        y -= 32;

        const correctedDur = sanitizeDuration(mod.video_duration_seconds || 0, (mod.frame_urls || []).length);
        if (correctedDur > 0) {
            currentPage.drawText(safeText(`Duration: ${formatTime(correctedDur)}`), { x: MARGIN, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
            y -= 18;
        }

        // KNOWLEDGE / STORY INTELLIGENCE LAYER
        const kl = mod.knowledge_layer;
        if (kl) {
            const isFilm = contentType === 'film';

            // ── Film: Story Intelligence Layer ───────────────────────────────
            if (isFilm) {
                const filmSections = [
                    { key: 'genre_tone',          label: 'GENRE & TONE' },
                    { key: 'logline',             label: 'LOGLINE' },
                    { key: 'thematic_dna',        label: 'THEMATIC DNA' },
                    { key: 'story_structure',     label: 'STORY STRUCTURE' },
                    { key: 'character_profiles',  label: 'CHARACTER PROFILES' },
                    { key: 'protagonist_arc',     label: 'PROTAGONIST TRANSFORMATION ARC' },
                    { key: 'antagonist_function', label: 'ANTAGONIST FUNCTION' },
                    { key: 'power_dynamics',      label: 'POWER DYNAMICS' },
                    { key: 'scene_breakdown',     label: 'SCENE-BY-SCENE BREAKDOWN' },
                    { key: 'world_building',      label: 'WORLD-BUILDING & DOMAIN LAYER' },
                    { key: 'subplot_structure',   label: 'SUBPLOT & B-STORY STRUCTURE' },
                    { key: 'tone_map',            label: 'TONE MAP' },
                    { key: 'signature_set_pieces',label: 'SIGNATURE SET PIECES' },
                    { key: 'dialogue_style',      label: 'DIALOGUE STYLE PROFILE' },
                    { key: 'emotional_architecture', label: 'EMOTIONAL ARCHITECTURE' },
                    { key: 'audio_energy_timeline',  label: 'AUDIO ENERGY TIMELINE' },
                    { key: 'adaptation_blueprint',   label: 'ADAPTATION BLUEPRINT' },
                    { key: 'retrieval_tags',      label: 'RETRIEVAL TAGS' },
                ];

                ensureSpace(30);
                currentPage.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_WIDTH, y }, thickness: 0.5, color: rgb(0, 0, 0) });
                y -= 10;
                currentPage.drawText('STORY INTELLIGENCE LAYER', { x: MARGIN, y, size: 13, font: boldFont, color: rgb(0, 0, 0) });
                y -= 14;

                for (const { key, label } of filmSections) {
                    const rawVal = (kl as any)[key];
                    if (!rawVal) continue;
                    const val = Array.isArray(rawVal) ? rawVal.join('\n') : String(rawVal);
                    if (!val.trim()) continue;

                    ensureSpace(20);
                    currentPage.drawText(label, { x: MARGIN, y, size: 11, font: boldFont, color: rgb(0, 0, 0) });
                    y -= 12;
                    drawWrappedText(val, { x: MARGIN + 3, size: 9, color: rgb(0.1, 0.1, 0.1) });
                    y -= 6;
                }
                y -= 6;

            } else {
                // ── Course: AI Knowledge Layer + Reasoning Layer ─────────────
                ensureSpace(30);
                currentPage.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_WIDTH, y }, thickness: 0.5, color: rgb(0, 0, 0) });
                y -= 10;
                currentPage.drawText('AI KNOWLEDGE LAYER', { x: MARGIN, y, size: 13, font: boldFont, color: rgb(0, 0, 0) });
                y -= 14;

                for (const { key, label } of klSections) {
                    const rawVal = (kl as any)[key];
                    if (!rawVal) continue;
                    const val = Array.isArray(rawVal) ? rawVal.join('\n') : String(rawVal);
                    if (!val.trim()) continue;

                    ensureSpace(20);
                    currentPage.drawText(label, { x: MARGIN, y, size: 11, font: boldFont, color: rgb(0, 0, 0) });
                    y -= 12;
                    drawWrappedText(val, { x: MARGIN + 3, size: 9, color: rgb(0.1, 0.1, 0.1) });
                    y -= 6;
                }
                y -= 6;

                // REASONING LAYER
                const hasReasoning = reasoningSections.some(({ key }) => {
                    const v = (kl as any)[key];
                    return v && String(v).trim();
                });
                if (hasReasoning) {
                    ensureSpace(30);
                    currentPage.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_WIDTH, y }, thickness: 0.5, color: rgb(0, 0, 0) });
                    y -= 10;
                    currentPage.drawText('REASONING LAYER', { x: MARGIN, y, size: 13, font: boldFont, color: rgb(0, 0, 0) });
                    y -= 14;

                    for (const { key, label } of reasoningSections) {
                        const rawVal = (kl as any)[key];
                        if (!rawVal) continue;
                        const val = Array.isArray(rawVal) ? rawVal.join('\n') : String(rawVal);
                        if (!val.trim()) continue;

                        ensureSpace(20);
                        currentPage.drawText(label, { x: MARGIN, y, size: 11, font: boldFont, color: rgb(0, 0, 0) });
                        y -= 12;
                        drawWrappedText(val, { x: MARGIN + 3, size: 9, color: rgb(0.1, 0.1, 0.1) });
                        y -= 6;
                    }
                    y -= 6;
                }
            }

            // Divider before transcript
            ensureSpace(10);
            currentPage.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_WIDTH, y }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });
            y -= 8;
        }

        // FULL VERBATIM TRANSCRIPT
        const transcript = mod.transcript || [];
        if (transcript.length > 0) {
            ensureSpace(30);
            currentPage.drawText('Full Verbatim Transcript', { x: MARGIN, y, size: 14, font: boldFont, color: rgb(0, 0, 0) });
            y -= 16;
            for (const seg of transcript) {
                const ts = formatTime(seg.start || 0);
                const speaker = seg.speaker ? `${seg.speaker}: ` : '';
                drawWrappedText(`[${ts}] ${speaker}${seg.text || ''}`, { x: MARGIN, size: 8, color: rgb(0.1, 0.1, 0.1) });
                y -= 2;
            }
        }
    }

    addFooter(currentPage);
    return pdfDoc.save();
}

async function buildPartPDF(
    courseTitle: string,
    partNumber: number,
    totalParts: number,
    frameUrls: string[],        // already sliced to this part's frames
    globalFrameOffset: number,  // index of first frame in this part (e.g. 150 for part 2)
    videoDurationSeconds: number,
    userEmail: string,
    transcript: any[],
): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;
    const MARGIN = 42;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
    const FOOTER_Y = 30;

    const watermarkTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    const addFooter = (page: any) => {
        if (!userEmail) return;
        page.drawText(`Proprietary Intel: OneDuo Thinking Layer | ${userEmail} | ${watermarkTimestamp}`, {
            x: MARGIN, y: FOOTER_Y, size: 6, font, color: rgb(0.6, 0.6, 0.6),
        });
        page.drawText('This artifact is for private authorized educational use only.', {
            x: PAGE_WIDTH / 2 - 120, y: FOOTER_Y - 8, size: 5, font, color: rgb(0.5, 0.5, 0.5),
        });
    };

    const newPage = () => {
        addFooter(currentPage);
        currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
    };

    const ensureSpace = (needed: number) => {
        if (y - needed < FOOTER_Y + 20) newPage();
    };

    const drawWrappedText = (text: string, options: { x?: number; size?: number; usedFont?: any; color?: any; maxWidth?: number } = {}) => {
        const { x = MARGIN, size = 9, usedFont = font, color = rgb(0, 0, 0), maxWidth = CONTENT_WIDTH } = options;
        const safeT = safeText(text);
        if (!safeT) return;
        const lineSpacing = size * 1.3;
        const words = safeT.split(' ');
        let line = '';
        for (const word of words) {
            const testLine = line ? `${line} ${word}` : word;
            if (usedFont.widthOfTextAtSize(testLine, size) > maxWidth && line) {
                ensureSpace(lineSpacing);
                currentPage.drawText(line, { x, y, size, font: usedFont, color });
                y -= lineSpacing;
                line = word;
            } else {
                line = testLine;
            }
        }
        if (line) {
            ensureSpace(lineSpacing);
            currentPage.drawText(line, { x, y, size, font: usedFont, color });
            y -= lineSpacing;
        }
    };

    // ---- Cover page for this part ----
    y = PAGE_HEIGHT - 120;
    currentPage.drawText(safeText(courseTitle), { x: MARGIN, y, size: 20, font: boldFont, color: rgb(0, 0, 0) });
    y -= 30;
    currentPage.drawText(safeText(`OneDuo — Part ${partNumber} of ${totalParts}`), {
        x: MARGIN, y, size: 14, font, color: rgb(0.2, 0.2, 0.2),
    });
    y -= 18;
    const startFrame = globalFrameOffset + 1;
    const endFrame = globalFrameOffset + frameUrls.length;
    currentPage.drawText(safeText(`Frames ${startFrame}–${endFrame} | Generated: ${watermarkTimestamp}`), {
        x: MARGIN, y, size: 9, font, color: rgb(0.4, 0.4, 0.4),
    });
    addFooter(currentPage);

    const frameDuration = videoDurationSeconds > 0 ? videoDurationSeconds / Math.max(frameUrls.length, 1) : 1;
    console.log(`[buildPartPDF] Part ${partNumber}: rendering ${frameUrls.length} frames`);

    // ---- Render each frame ----
    for (let fi = 0; fi < frameUrls.length; fi++) {
        const frameUrl = compressFrameUrl(frameUrls[fi]);
        const globalIdx = globalFrameOffset + fi;
        const timestamp = globalIdx * frameDuration;

        newPage();

        // Frame header
        currentPage.drawText(safeText(`Frame ${globalIdx + 1} | ${formatTime(timestamp)}`), {
            x: MARGIN, y, size: 7, font: boldFont, color: rgb(0.4, 0.4, 0.4),
        });
        y -= 10;

        // Embed image
        try {
            const response = await fetch(frameUrl, { signal: AbortSignal.timeout(10000) });
            if (response.ok) {
                const imageBytes = new Uint8Array(await response.arrayBuffer());
                const contentType = response.headers.get('content-type') || '';
                const image = contentType.includes('png') || frameUrl.includes('.png')
                    ? await pdfDoc.embedPng(imageBytes)
                    : await pdfDoc.embedJpg(imageBytes);
                const imgWidth = Math.min(CONTENT_WIDTH, 400);
                const imgHeight = imgWidth * (image.height / image.width);
                ensureSpace(imgHeight + 20);
                currentPage.drawImage(image, { x: MARGIN, y: y - imgHeight, width: imgWidth, height: imgHeight });
                y -= imgHeight + 5;
            }
        } catch {
            currentPage.drawText('[Frame could not be loaded]', { x: MARGIN, y, size: 7, font: italicFont, color: rgb(0.7, 0.3, 0.3) });
            y -= 12;
        }

        // ===== ASSEMBLY AI TRANSCRIPT CAPTION =====
        const transcriptSegment = (transcript || []).find((seg: any) =>
            timestamp >= (seg.start || 0) && timestamp <= (seg.end || seg.start || 0)
        ) || (transcript || []).reduce((closest: any, seg: any) => {
            if (!closest) return seg;
            return Math.abs((seg.start || 0) - timestamp) < Math.abs((closest.start || 0) - timestamp) ? seg : closest;
        }, null);
        const spokenText: string = transcriptSegment?.text || '';
        if (spokenText) {
            const fontSize = 8;
            const truncated = spokenText.length > 400 ? spokenText.substring(0, 397) + '...' : spokenText;
            const words = truncated.split(' ');
            let lines = 0, line = '';
            for (const word of words) {
                const testLine = line ? `${line} ${word}` : word;
                if (font.widthOfTextAtSize(testLine, fontSize) > CONTENT_WIDTH - 10) { lines++; line = word; }
                else line = testLine;
            }
            if (line) lines++;
            const rectHeight = (lines * (fontSize * 1.3)) + 8;
            ensureSpace(rectHeight + 5);
            currentPage.drawRectangle({
                x: MARGIN, y: y - rectHeight, width: CONTENT_WIDTH, height: rectHeight,
                color: rgb(0.95, 0.95, 0.95),
                borderColor: rgb(0.75, 0.75, 0.75),
                borderWidth: 0.5,
            });
            y -= 2;
            drawWrappedText(`"${truncated}"`, {
                x: MARGIN + 5, size: fontSize, usedFont: italicFont,
                color: rgb(0.15, 0.15, 0.15), maxWidth: CONTENT_WIDTH - 10,
            });
            y -= 4;
        }
    }

    addFooter(currentPage);
    return pdfDoc.save();
}

// ============================================
// PDF MERGE (combine all parts into one)
// ============================================

// Merge PDFs one at a time to avoid holding all parts in memory simultaneously.
// partSupplier yields each part's bytes in order; each is loaded, copied, then released.
// After save(), mergedDoc is explicitly nulled and we yield to the event loop so the GC
// can collect the internal pdf-lib state before the caller uploads the result.
async function mergePartPDFs(partSupplier: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
    let mergedDoc: PDFDocument | null = await PDFDocument.create();
    for await (const partBytes of partSupplier) {
        const partDoc = await PDFDocument.load(partBytes);
        const pages = await mergedDoc!.copyPages(partDoc, partDoc.getPageIndices());
        for (const page of pages) mergedDoc!.addPage(page);
    }
    const result = await mergedDoc!.save();
    (mergedDoc as any) = null; // release internal pdf-lib state before caller upload
    await new Promise<void>(resolve => setTimeout(resolve, 0)); // yield to event loop → GC opportunity
    return result;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { courseId, email, aiFidelityMode = false, action = 'generate', framesPerPart = 150, partNumber } = await req.json();

        if (!courseId) {
            return new Response(
                JSON.stringify({ error: "courseId is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`[generate-pdf-backend] action=${action} course=${courseId} framesPerPart=${framesPerPart}`);

        // Immediately respond to the client so they can close the tab
        const responsePromise = new Response(
            JSON.stringify({ success: true, message: "PDF generation started. You'll receive an email when ready." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

        // Do the heavy work in the background
        const backgroundWork = async () => {
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            // ========== SHARED: FETCH COURSE + MODULES ==========
            const fetchCourseData = async () => {
                const { data: course, error: courseError } = await supabase
                    .from("courses")
                    .select("id, title, email, share_token, share_enabled, course_files, video_duration_seconds, transcript, frame_urls, frame_analyses, audio_events, prosody_annotations, knowledge_layer")
                    .eq("id", courseId)
                    .single();
                if (courseError || !course) throw new Error("Course not found");

                const { data: courseModules } = await supabase
                    .from("course_modules")
                    .select(`id, title, module_number, video_duration_seconds, transcript, frame_urls, frame_analyses, audio_events, prosody_annotations, knowledge_layer,
                        transformation_artifacts(key_moments_index, concepts_frameworks, hidden_patterns, implementation_steps, quality_report, action_sops)`)
                    .eq("course_id", courseId)
                    .order("module_number");

                const isSingleModule = !courseModules || courseModules.length === 0;
                const allFrameUrls: string[] = isSingleModule
                    ? (course.frame_urls || [])
                    : courseModules!.flatMap((m: any) => m.frame_urls || []);
                const videoDuration: number = isSingleModule
                    ? sanitizeDuration(course.video_duration_seconds || 0, allFrameUrls.length)
                    : courseModules!.reduce((sum: number, m: any) => sum + sanitizeDuration(m.video_duration_seconds || 0, (m.frame_urls || []).length), 0);
                const transcript: any[] = isSingleModule
                    ? (course.transcript || [])
                    : courseModules!.flatMap((m: any) => m.transcript || []);

                // Build modules array for preamble (cover + KL + transcript)
                const preambleModules: any[] = isSingleModule
                    ? [{ ...course, module_number: 1 }]
                    : courseModules!.map((m: any) => ({ ...m, knowledge_layer: m.knowledge_layer || null }));

                return { course, isSingleModule, courseModules, allFrameUrls, videoDuration, transcript, preambleModules };
            };

            // ========== ACTION: generateAll ==========
            if (action === 'generateAll' || action === 'generate') {
                try {
                    // Auto-generate knowledge layer if not already complete
                    const { data: klCheck } = await supabase
                        .from('courses')
                        .select('knowledge_layer_status, content_type, processing_mode')
                        .eq('id', courseId)
                        .single();

                    // Quick + course: skip knowledge layer (fast delivery)
                    // Quick + film: still generate — story intelligence is the core value
                    if (klCheck?.processing_mode === 'quick' && klCheck?.content_type !== 'film') {
                        console.log(`[generate-pdf-backend] Quick mode (course) — skipping knowledge layer for course ${courseId}`);
                    } else if (klCheck?.knowledge_layer_status !== 'complete') {
                        // If not already running, trigger generation
                        if (klCheck?.knowledge_layer_status !== 'generating') {
                            console.log(`[generate-pdf-backend] Knowledge layer not ready (${klCheck?.knowledge_layer_status}) — triggering generation...`);
                            try {
                                await fetch(`${supabaseUrl}/functions/v1/generate-knowledge-layer`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
                                    body: JSON.stringify({ courseId, contentType: klCheck?.content_type || 'course' }),
                                });
                            } catch (klErr) {
                                console.warn(`[generate-pdf-backend] Knowledge layer trigger error:`, klErr);
                            }
                        } else {
                            console.log(`[generate-pdf-backend] Knowledge layer already generating — waiting for it to complete...`);
                        }

                        // Poll until complete or timeout (3 minutes)
                        const maxWaitMs = 3 * 60 * 1000;
                        const pollInterval = 5000;
                        const startWait = Date.now();
                        let klStatus = klCheck?.knowledge_layer_status;
                        while (klStatus !== 'complete' && Date.now() - startWait < maxWaitMs) {
                            await new Promise(r => setTimeout(r, pollInterval));
                            const { data: klPoll } = await supabase.from('courses').select('knowledge_layer_status').eq('id', courseId).single();
                            klStatus = klPoll?.knowledge_layer_status;
                            console.log(`[generate-pdf-backend] Knowledge layer status: ${klStatus} (${Math.round((Date.now() - startWait) / 1000)}s elapsed)`);
                        }
                        if (klStatus === 'complete') {
                            console.log(`[generate-pdf-backend] Knowledge layer complete — proceeding with PDF generation`);
                        } else {
                            console.warn(`[generate-pdf-backend] Knowledge layer did not complete within 3 minutes — proceeding anyway`);
                        }
                    } else {
                        console.log(`[generate-pdf-backend] Knowledge layer already complete — skipping auto-generation`);
                    }

                    let { course, allFrameUrls, videoDuration, transcript, preambleModules } = await fetchCourseData();

                    // Quick mode + course: filter to slide changes via OCR diff
                    if (klCheck?.processing_mode === 'quick' && klCheck?.content_type === 'course') {
                        allFrameUrls = await filterToSlideChanges(supabase, courseId, allFrameUrls);
                    }

                    // Quick mode + film: subsample to 1 frame per 10 seconds
                    if (klCheck?.processing_mode === 'quick' && klCheck?.content_type === 'film') {
                        const before = allFrameUrls.length;
                        const step = 10; // 1 FPS extraction → every 10 frames = 10 seconds
                        allFrameUrls = allFrameUrls.filter((_, i) => i % step === 0);
                        console.log(`[generate-pdf-backend] Quick film: ${before} → ${allFrameUrls.length} frames (1 per 10s)`);
                    }

                    const userEmail = email || course.email || '';
                    const totalFrames = allFrameUrls.length;
                    const totalParts = Math.ceil(totalFrames / framesPerPart);

                    console.log(`[generate-pdf-backend] generateAll: ${totalFrames} frames → ${totalParts} parts × ${framesPerPart} frames`);

                    // ---- Resume: lightweight list() to detect completed parts (no downloads yet) ----
                    const completedPartsSet = new Set<number>();

                    console.log(`[generate-pdf-backend] Checking storage for already-completed parts...`);
                    const { data: existingPartFiles } = await supabase.storage
                        .from('course-files')
                        .list(`exports/${courseId}/parts`);

                    if (existingPartFiles) {
                        for (let p = 1; p <= totalParts; p++) {
                            const expectedName = `part_${p}_of_${totalParts}.pdf`;
                            if (existingPartFiles.some((f: any) => f.name === expectedName)) {
                                completedPartsSet.add(p);
                                console.log(`[generate-pdf-backend] Part ${p}/${totalParts} found in storage — will download at merge time.`);
                            }
                        }
                    }

                    const firstPendingPart = [...Array(totalParts).keys()]
                        .map(i => i + 1)
                        .find(p => !completedPartsSet.has(p)) ?? (totalParts + 1);

                    // Mark as generating (or resuming)
                    if (completedPartsSet.size > 0) {
                        const resumeFrame = Math.min(completedPartsSet.size * framesPerPart, totalFrames);
                        console.log(`[generate-pdf-backend] Resuming from part ${firstPendingPart} (${completedPartsSet.size}/${totalParts} parts already done)`);
                        await supabase.from('courses').update({
                            pdf_generation_status: 'generating',
                            pdf_generation_progress: { currentPart: completedPartsSet.size, totalParts, currentFrame: resumeFrame, totalFrames, resumedAt: new Date().toISOString() },
                        }).eq('id', courseId);
                    } else {
                        await supabase.from('courses').update({
                            pdf_generation_status: 'generating',
                            pdf_generation_progress: { currentPart: 0, totalParts, currentFrame: 0, totalFrames, startedAt: new Date().toISOString() },
                        }).eq('id', courseId);
                    }

                    // Build any missing parts first (storage uploads happen inline so retries can resume)
                    for (let part = 1; part <= totalParts; part++) {
                        // Check if generation was cancelled via SQL between parts
                        const { data: statusCheck } = await supabase
                            .from('courses')
                            .select('pdf_generation_status')
                            .eq('id', courseId)
                            .single();
                        if (statusCheck?.pdf_generation_status === 'cancelled' || statusCheck?.pdf_generation_status === 'failed') {
                            console.log(`[generate-pdf-backend] Generation stopped (status: ${statusCheck.pdf_generation_status}) — exiting at part ${part}`);
                            return;
                        }

                        if (completedPartsSet.has(part)) {
                            console.log(`[generate-pdf-backend] Part ${part}/${totalParts} already completed — skipping build.`);
                            continue;
                        }

                        const startIdx = (part - 1) * framesPerPart;
                        const endIdx = Math.min(startIdx + framesPerPart, totalFrames);
                        const partFrameUrls = allFrameUrls.slice(startIdx, endIdx);

                        console.log(`[generate-pdf-backend] Generating part ${part}/${totalParts} (frames ${startIdx + 1}–${endIdx})`);

                        await supabase.from('courses').update({
                            pdf_generation_progress: { currentPart: part, totalParts, currentFrame: startIdx, totalFrames, startedAt: new Date().toISOString() },
                        }).eq('id', courseId);

                        const partBytes = await buildPartPDF(
                            course.title,
                            part,
                            totalParts,
                            partFrameUrls,
                            startIdx,
                            videoDuration,
                            userEmail,
                            transcript,
                        );

                        const partStoragePath = `exports/${courseId}/parts/part_${part}_of_${totalParts}.pdf`;
                        const { error: partUploadErr } = await supabase.storage
                            .from('course-files')
                            .upload(partStoragePath, partBytes, { contentType: 'application/pdf', upsert: true });
                        if (partUploadErr) {
                            console.error(`[generate-pdf-backend] Failed to save part ${part} to storage:`, partUploadErr);
                            throw partUploadErr;
                        }
                        console.log(`[generate-pdf-backend] Part ${part} saved to storage (${partBytes.length} bytes).`);
                        completedPartsSet.add(part);

                        await supabase.from('courses').update({
                            pdf_generation_progress: { currentPart: part, totalParts, currentFrame: endIdx, totalFrames, startedAt: new Date().toISOString() },
                        }).eq('id', courseId);
                    }

                    // Free large data before preamble build
                    const courseTitle = course.title;
                    for (const key of ['frame_urls', 'frame_analyses', 'transcript', 'audio_events', 'prosody_annotations', 'knowledge_layer'] as const) {
                        (course as any)[key] = null;
                    }
                    (course as any) = null;
                    (allFrameUrls as any) = null;
                    (videoDuration as any) = null;
                    (transcript as any) = null;

                    // Build preamble (KL + Transcript) and upload to storage so RunPod can fetch it
                    console.log(`[generate-pdf-backend] Building preamble (Knowledge Layer + Transcript)...`);
                    const preambleBytes = await buildPreamblePDF(courseTitle, preambleModules, userEmail, klCheck?.content_type || 'course');
                    (preambleModules as any) = null;

                    const preambleStoragePath = `exports/${courseId}/preamble.pdf`;
                    const { error: preambleUploadErr } = await supabase.storage
                        .from('course-files')
                        .upload(preambleStoragePath, preambleBytes, { contentType: 'application/pdf', upsert: true });
                    if (preambleUploadErr) throw new Error(`Preamble upload failed: ${preambleUploadErr.message}`);
                    console.log(`[generate-pdf-backend] Preamble uploaded — handing merge off to RunPod`);

                    // Submit merge job to RunPod — no memory constraint there
                    const RUNPOD_API_KEY = Deno.env.get('RUNPOD_API_KEY');
                    const RUNPOD_ENDPOINT_ID = Deno.env.get('RUNPOD_ENDPOINT_ID') || '5d33e66s2crcer';
                    const webhookUrl = `${supabaseUrl}/functions/v1/runpod-webhook`;

                    const runpodResp = await fetch(`https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/run`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RUNPOD_API_KEY}` },
                        body: JSON.stringify({
                            input: {
                                action: 'merge_pdf',
                                courseId,
                                totalParts,
                                totalFrames,
                                courseTitle,
                                userEmail,
                                webhookUrl,
                            },
                        }),
                    });

                    if (!runpodResp.ok) {
                        const errText = await runpodResp.text();
                        throw new Error(`RunPod submit failed: ${runpodResp.status} ${errText}`);
                    }

                    const runpodJob = await runpodResp.json();
                    console.log(`[generate-pdf-backend] RunPod merge job submitted: ${runpodJob.id}`);

                    await supabase.from('courses').update({
                        pdf_generation_status: 'generating',
                        pdf_generation_progress: { currentPart: totalParts, totalParts, currentFrame: totalFrames, totalFrames, mergingViaRunpod: true, runpodJobId: runpodJob.id, submittedAt: new Date().toISOString() },
                    }).eq('id', courseId);

                    console.log(`[generate-pdf-backend] Merge handed off to RunPod — webhook will complete when done`);
                } catch (error) {
                    console.error("[generate-pdf-backend] generateAll failed:", error);
                    // Fetch current progress so we can preserve how far we got (completed parts remain in storage)
                    const { data: progressRow } = await supabase
                        .from('courses')
                        .select('pdf_generation_progress')
                        .eq('id', courseId)
                        .single();
                    await supabase.from('courses').update({
                        pdf_generation_status: 'failed',
                        pdf_generation_progress: {
                            ...(progressRow?.pdf_generation_progress || {}),
                            failedAt: new Date().toISOString(),
                            error: error instanceof Error ? error.message : String(error),
                        },
                    }).eq('id', courseId);
                }
                return;
            }

            // ========== ACTION: generateIntelPack ==========
            if (action === 'generateIntelPack') {
                try {
                    await supabase.from('courses').update({
                        pdf_generation_status: 'generating',
                        pdf_generation_progress: { startedAt: new Date().toISOString(), step: 'starting' },
                    }).eq('id', courseId);

                    const { course, allFrameUrls, videoDuration, transcript } = await fetchCourseData();
                    const userEmail = email || course.email || '';
                    const frameAnalyses: any[] = (course as any).frame_analyses || [];

                    // Supplemental files from course_files — only those with extracted text content
                    const supplementalFiles = ((course.course_files as any[]) || []).filter((f: any) => f.content);

                    // Chat tier 1: detect separate chat file by timestamp pattern
                    let chatMessages: ChatMessage[] = detectChatFile(supplementalFiles);
                    const chatSource = chatMessages.length > 0 ? 'file' : 'none';
                    // Chat tier 2: frame OCR extraction is low-signal for chat; skip — tier 3 fallback already handled in buildChatGoldText

                    await supabase.from('courses').update({
                        pdf_generation_progress: { step: 'filtering_frames', chatSource },
                    }).eq('id', courseId);

                    // Filter to scene-change frames only
                    const filteredUrls = await filterToSlideChanges(supabase, courseId, allFrameUrls);
                    console.log(`[intel-pack] Scene-change filter: ${allFrameUrls.length} -> ${filteredUrls.length} frames`);

                    await supabase.from('courses').update({
                        pdf_generation_progress: { step: 'enriching_frames', frameCount: filteredUrls.length },
                    }).eq('id', courseId);

                    const enrichedFrames = enrichFrames(filteredUrls, allFrameUrls, frameAnalyses, videoDuration, transcript, chatMessages);

                    await supabase.from('courses').update({
                        pdf_generation_progress: { step: 'building_files' },
                    }).eq('id', courseId);

                    // Build the PDF (serial — large async operation) then the text files
                    const spineBytes = await buildVisualTrainingSpinePDF(course.title, enrichedFrames, userEmail);

                    const transcriptText = buildFullTranscriptText(transcript, course.title);
                    const chatGoldText = buildChatGoldText(chatMessages, course.title, transcript);
                    const timestampIndexText = buildTimestampIndexText(enrichedFrames, course.title);
                    const resourcesText = buildResourcesSeenText(transcript, chatMessages, frameAnalyses, course.title);
                    const readmeText = buildReadmeText(course.title, chatSource, enrichedFrames.length, transcript.length);

                    await supabase.from('courses').update({
                        pdf_generation_progress: { step: 'zipping' },
                    }).eq('id', courseId);

                    // Bundle into zip
                    const zip = new JSZip();
                    const dateStr = new Date().toISOString().split('T')[0];
                    const safeTitle = (course.title || 'course').replace(/[^a-zA-Z0-9 -]/g, '').replace(/\s+/g, '-').substring(0, 40);

                    zip.file('01_full_transcript.txt', transcriptText);
                    zip.file('02_visual_training_spine.pdf', spineBytes);
                    zip.file('03_chat_gold.txt', chatGoldText);
                    zip.file('04_timestamp_index.txt', timestampIndexText);
                    zip.file('05_resources_seen.txt', resourcesText);
                    zip.file('README.txt', readmeText);

                    const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });

                    // Upload zip
                    const ts = Date.now();
                    const zipStoragePath = `exports/${courseId}/${ts}_training-intelligence-pack.zip`;
                    const zipFilename = `training-intelligence-pack-${safeTitle}-${dateStr}.zip`;

                    const { error: zipUploadErr } = await supabase.storage
                        .from('course-files')
                        .upload(zipStoragePath, zipBytes, { contentType: 'application/zip', upsert: true });
                    if (zipUploadErr) throw new Error(`Zip upload failed: ${zipUploadErr.message}`);

                    // Register in course_files
                    const existingFiles = ((course.course_files as any[]) || []).filter((f: any) => f?.type !== 'intel_pack');
                    await supabase.from('courses').update({
                        course_files: [
                            ...existingFiles,
                            {
                                type: 'intel_pack',
                                name: zipFilename,
                                filename: zipFilename,
                                storagePath: zipStoragePath,
                                storage_path: `course-files/${zipStoragePath}`,
                                size: zipBytes.length,
                                uploaded_at: new Date().toISOString(),
                                generated_by: 'backend',
                                chatSource,
                                frameCount: enrichedFrames.length,
                            },
                        ],
                        pdf_generation_status: 'complete',
                        pdf_generation_progress: {
                            step: 'complete',
                            zipStoragePath,
                            frameCount: enrichedFrames.length,
                            chatSource,
                            completedAt: new Date().toISOString(),
                        },
                    }).eq('id', courseId);

                    // Email with 7-day signed download link
                    if (userEmail) {
                        const { data: signedData } = await supabase.storage
                            .from('course-files')
                            .createSignedUrl(zipStoragePath, 60 * 60 * 24 * 7);
                        if (signedData?.signedUrl) {
                            try {
                                await fetch(`${supabaseUrl}/functions/v1/send-pdf-email`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
                                    body: JSON.stringify({
                                        email: userEmail,
                                        courseTitle: course.title,
                                        downloadUrl: signedData.signedUrl,
                                        courseId,
                                        subject: `Your Training Intelligence Pack is ready: ${course.title}`,
                                    }),
                                });
                            } catch (emailErr) {
                                console.warn(`[intel-pack] Email failed:`, emailErr);
                            }
                        }
                    }

                    console.log(`[intel-pack] Complete: ${courseId} | ${enrichedFrames.length} frames | ${zipBytes.length} bytes | chat: ${chatSource}`);
                } catch (error) {
                    console.error('[intel-pack] generateIntelPack failed:', error);
                    await supabase.from('courses').update({
                        pdf_generation_status: 'failed',
                        pdf_generation_progress: {
                            failedAt: new Date().toISOString(),
                            error: error instanceof Error ? error.message : String(error),
                        },
                    }).eq('id', courseId);
                }
                return;
            }

            // ========== LEGACY: original full PDF generation (kept intact) ==========

            try {
                // ========== 1. FETCH COURSE DATA ==========
                console.log(`[generate-pdf-backend] Fetching course data...`);

                const { data: course, error: courseError } = await supabase
                    .from("courses")
                    .select("id, title, email, share_token, share_enabled, course_files, video_duration_seconds, transcript, frame_urls, frame_analyses, audio_events, prosody_annotations")
                    .eq("id", courseId)
                    .single();

                if (courseError || !course) {
                    console.error("[generate-pdf-backend] Course not found:", courseError);
                    return;
                }

                // ========== 2. FETCH MODULES ==========
                const { data: courseModules, error: modulesError } = await supabase
                    .from("course_modules")
                    .select(`
            id, title, module_number, video_duration_seconds, transcript, 
            frame_urls, frame_analyses, audio_events, prosody_annotations,
            transformation_artifact_id,
            transformation_artifacts(
              key_moments_index, concepts_frameworks,
              hidden_patterns, implementation_steps,
              quality_report, action_sops
            )
          `)
                    .eq("course_id", courseId)
                    .order("module_number");

                // Determine if single-module or multi-module
                const isSingleModule = !courseModules || courseModules.length === 0;

                let modules: any[] = [];

                if (isSingleModule) {
                    // Single-module: use course data directly
                    // Fetch transformation_artifacts for the course
                    let keyMoments: any = null, concepts: any = null, patterns: any = null, implSteps: any = null;
                    let qualityReport: any = null, actionSops: any = null;

                    if ((course as any).transformation_artifact_id) {
                        const { data: artifact } = await supabase
                            .from("transformation_artifacts")
                            .select("key_moments_index, concepts_frameworks, hidden_patterns, implementation_steps, quality_report, action_sops")
                            .eq("id", (course as any).transformation_artifact_id)
                            .single();

                        if (artifact) {
                            keyMoments = artifact.key_moments_index;
                            concepts = artifact.concepts_frameworks;
                            patterns = artifact.hidden_patterns;
                            implSteps = artifact.implementation_steps;
                            qualityReport = artifact.quality_report;
                            actionSops = artifact.action_sops;
                        }
                    }

                    modules = [{
                        id: course.id,
                        title: course.title,
                        moduleNumber: 1,
                        module_number: 1,
                        video_duration_seconds: course.video_duration_seconds,
                        transcript: course.transcript,
                        frame_urls: course.frame_urls || [],
                        frame_analyses: course.frame_analyses || [],
                        audio_events: (course as any).audio_events,
                        prosody_annotations: (course as any).prosody_annotations,
                        key_moments_index: keyMoments,
                        concepts_frameworks: concepts,
                        hidden_patterns: patterns,
                        implementation_steps: implSteps,
                        quality_report: qualityReport,
                        action_sops: actionSops,
                    }];
                } else {
                    // Multi-module
                    modules = courseModules!.map((m: any) => ({
                        id: m.id,
                        title: m.title,
                        moduleNumber: m.module_number,
                        module_number: m.module_number,
                        video_duration_seconds: m.video_duration_seconds,
                        transcript: m.transcript,
                        frame_urls: m.frame_urls || [],
                        frame_analyses: m.frame_analyses || [],
                        key_moments_index: (m.transformation_artifacts as any)?.key_moments_index,
                        concepts_frameworks: (m.transformation_artifacts as any)?.concepts_frameworks,
                        hidden_patterns: (m.transformation_artifacts as any)?.hidden_patterns,
                        implementation_steps: (m.transformation_artifacts as any)?.implementation_steps,
                        quality_report: (m.transformation_artifacts as any)?.quality_report,
                        action_sops: (m.transformation_artifacts as any)?.action_sops,
                    }));
                }

                console.log(`[generate-pdf-backend] ${modules.length} module(s), single=${isSingleModule}`);

                // ========== 3. LOAD SUPPLEMENTAL FILES ==========
                let supplementalFiles: any[] = [];
                const courseFiles = (course.course_files as any[]) || [];
                const textFiles = courseFiles.filter((f: any) => {
                    if (!f?.name && !f?.filename) return false;
                    const name = (f.name || f.filename || '').toLowerCase();
                    const binaryExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.zip', '.rar', '.7z', '.exe', '.dll', '.bin', '.pdf'];
                    return !binaryExts.some(ext => name.endsWith(ext)) && f.type !== 'pdf';
                });

                for (const file of textFiles.slice(0, 50)) { // Limit to 50 files
                    try {
                        const storagePath = file.storagePath || file.storage_path || '';
                        if (!storagePath) continue;

                        // Normalize path: remove bucket prefix if present
                        const cleanPath = storagePath.replace(/^course-files\//, '');

                        const { data: fileData, error: dlError } = await supabase.storage
                            .from('course-files')
                            .download(cleanPath);

                        if (dlError || !fileData) continue;

                        const text = await fileData.text();
                        supplementalFiles.push({
                            name: file.name || file.filename || 'Unnamed',
                            content: text.substring(0, 10000), // Cap at 10K chars
                        });
                    } catch (e) {
                        console.error(`[generate-pdf-backend] Failed to load file:`, e);
                    }
                }

                console.log(`[generate-pdf-backend] Loaded ${supplementalFiles.length} supplemental files`);

                // ========== 5. BUILD PDF ==========
                console.log(`[generate-pdf-backend] Building PDF...`);
                const userEmail = email || course.email || '';
                const pdfBytes = await buildPDF(
                    course.title,
                    modules,
                    userEmail,
                    supplementalFiles.length > 0 ? supplementalFiles : undefined,
                    aiFidelityMode
                );

                console.log(`[generate-pdf-backend] PDF built: ${pdfBytes.length} bytes`);

                // ========== 6. UPLOAD ==========
                const timestamp = Date.now();
                const storagePath = `exports/${courseId}/${timestamp}_oneduo.pdf`;
                const filename = `${course.title} - OneDuo.pdf`;

                const { error: uploadError } = await supabase.storage
                    .from('course-files')
                    .upload(storagePath, pdfBytes, {
                        contentType: 'application/pdf',
                        upsert: true,
                    });

                if (uploadError) {
                    console.error("[generate-pdf-backend] Upload failed:", uploadError);
                    return;
                }

                console.log(`[generate-pdf-backend] PDF uploaded to ${storagePath}`);

                // ========== 7. UPDATE DB ==========
                const existingFiles = (course.course_files as any[]) || [];
                const updatedFiles = [
                    ...existingFiles.filter((f: any) => f?.type !== 'pdf'),
                    {
                        type: 'pdf',
                        name: filename,
                        filename: filename,
                        storagePath: storagePath,
                        storage_path: `course-files/${storagePath}`,
                        size: pdfBytes.length,
                        uploaded_at: new Date().toISOString(),
                        is_combined: true,
                        generated_by: 'backend'
                    }
                ];

                await supabase
                    .from('courses')
                    .update({
                        course_files: updatedFiles,
                        pdf_revision_pending: false,
                        share_enabled: true,
                    })
                    .eq('id', courseId);

                // ========== 8. SEND EMAIL ==========
                if (userEmail) {
                    const functionsUrl = supabaseUrl.replace('.supabase.co', '.functions.supabase.co');
                    const shareToken = course.share_token;
                    const downloadUrl = `${functionsUrl}/track-download?courseId=${courseId}&source=email${shareToken ? `&token=${shareToken}` : ''}`;

                    try {
                        await fetch(`${supabaseUrl}/functions/v1/send-pdf-email`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${supabaseServiceKey}`,
                            },
                            body: JSON.stringify({
                                email: userEmail,
                                courseTitle: course.title,
                                downloadUrl,
                                courseId,
                            }),
                        });
                        console.log(`[generate-pdf-backend] Email sent to ${userEmail}`);
                    } catch (emailError) {
                        console.error("[generate-pdf-backend] Email failed:", emailError);
                    }
                }

                console.log(`[generate-pdf-backend] COMPLETE for course ${courseId}`);

            } catch (error) {
                console.error("[generate-pdf-backend] Background work failed:", error);
            }
        };

        // Use EdgeRuntime.waitUntil to run in background after response
        // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
        if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
            // @ts-ignore
            EdgeRuntime.waitUntil(backgroundWork());
        } else {
            // Fallback: run inline (blocks response but completes)
            await backgroundWork();
            return new Response(
                JSON.stringify({ success: true, message: "PDF generated and emailed." }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return responsePromise;

    } catch (error) {
        console.error("[generate-pdf-backend] Error:", error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
