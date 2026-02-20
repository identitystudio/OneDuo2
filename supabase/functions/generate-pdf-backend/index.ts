import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================
// FRAME OCR ANALYSIS (Replicate - cached)
// ============================================

// Duration sanity check: if DB duration implies < 0.5 FPS, it's likely a stale 300s default
function sanitizeDuration(duration: number, frameCount: number): number {
    if (duration > 0 && frameCount > 0 && duration / frameCount > 2) {
        console.warn(`[generate-pdf-backend] Duration sanity check: ${duration}s for ${frameCount} frames (${(duration / frameCount).toFixed(1)}s/frame). Capping to ${frameCount}s.`);
        return frameCount; // 1 FPS estimate
    }
    return duration;
}

async function analyzeFramesWithReplicate(
    frameUrls: string[],
    videoDuration: number,
    transcriptContext: string,
    replicate: any,
    batchSize: number = 5
): Promise<any[]> {
    const results: any[] = [];
    const safeDuration = sanitizeDuration(videoDuration, frameUrls.length);
    const frameDuration = safeDuration > 0 ? safeDuration / Math.max(frameUrls.length, 1) : 10;

    for (let i = 0; i < frameUrls.length; i += batchSize) {
        const batch = frameUrls.slice(i, i + batchSize);

        const batchResults = await Promise.all(batch.map(async (frameUrl, batchIdx) => {
            const frameIndex = i + batchIdx;
            const timestamp = frameIndex * frameDuration;

            try {
                const output = await replicate.run(
                    "yorickvp/llava-v1.6-vicuna-13b:0603dec596080fa084e26f0ae6d605fc5788ed2b1a0358cd25010619487eae63",
                    {
                        input: {
                            image: frameUrl,
                            prompt: `Analyze this image from a tutorial video.
              
              Extract:
              1. ALL visible text.
              2. Visual description of what's happening.
              3. Type of text (slide, document, ui, code, or other).
              4. Visual emphasis cues (highlights, bold, cursor focus, etc.).
              5. The instructor's intent (what should the user build or do?).
              
              ${transcriptContext ? `Context from transcript: "${transcriptContext.substring(0, 500)}"` : ''}
              
              Return ONLY a JSON object in this format:
              {
                "text": "all text found",
                "visualDescription": "description for caption",
                "textType": "slide|document|ui|code|other",
                "emphasisFlags": {
                  "highlight_detected": boolean,
                  "cursor_pause": boolean,
                  "zoom_focus": boolean,
                  "text_selected": boolean,
                  "lingering_frame": boolean,
                  "bold_text": boolean,
                  "underline_detected": boolean
                },
                "keyElements": ["list", "of", "items"],
                "instructorIntent": "actionable build instruction",
                "prosody": {
                  "tone": "neutral|emphatic|etc",
                  "pacing": "normal|etc",
                  "volume": "normal|etc",
                  "parenthetical": "(note)"
                },
                "dependsOnPrevious": boolean
              }`,
                            max_new_tokens: 1024,
                            history: []
                        }
                    }
                );

                let resultText = Array.isArray(output) ? output.join('') : String(output);

                if (resultText.includes('```json')) {
                    resultText = resultText.split('```json')[1].split('```')[0].trim();
                } else if (resultText.includes('```')) {
                    resultText = resultText.split('```')[1].split('```')[0].trim();
                }

                const parsed = JSON.parse(resultText);

                return {
                    frameIndex,
                    timestamp,
                    text: parsed.text || '',
                    visualDescription: parsed.visualDescription || '',
                    textType: parsed.textType || 'other',
                    emphasisFlags: {
                        highlight_detected: !!parsed.emphasisFlags?.highlight_detected,
                        cursor_pause: !!parsed.emphasisFlags?.cursor_pause,
                        zoom_focus: !!parsed.emphasisFlags?.zoom_focus,
                        text_selected: !!parsed.emphasisFlags?.text_selected,
                        lingering_frame: !!parsed.emphasisFlags?.lingering_frame,
                        bold_text: !!parsed.emphasisFlags?.bold_text,
                        underline_detected: !!parsed.emphasisFlags?.underline_detected,
                    },
                    keyElements: parsed.keyElements || [],
                    instructorIntent: parsed.instructorIntent || '',
                    prosody: parsed.prosody || { tone: 'neutral', pacing: 'normal', volume: 'normal', parenthetical: '' },
                    dependsOnPrevious: !!parsed.dependsOnPrevious
                };
            } catch (error) {
                console.error(`[generate-pdf-backend] Frame ${frameIndex} analysis failed:`, error);
                return {
                    frameIndex,
                    timestamp,
                    text: '[Analysis failed]',
                    visualDescription: 'Error during analysis',
                    textType: 'other',
                    emphasisFlags: { highlight_detected: false, cursor_pause: false, zoom_focus: false, text_selected: false, lingering_frame: false, bold_text: false, underline_detected: false },
                    keyElements: [],
                    instructorIntent: '',
                    prosody: { tone: 'neutral', pacing: 'normal', volume: 'normal', parenthetical: '' },
                    dependsOnPrevious: false
                };
            }
        }));

        results.push(...batchResults);
        console.log(`[generate-pdf-backend] Analyzed ${results.length}/${frameUrls.length} frames`);
    }

    return results;
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

function formatTime(seconds: number): string {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Sample frames evenly across array
function sampleFramesEvenly(frames: string[], maxFrames: number): string[] {
    if (!Array.isArray(frames) || frames.length <= maxFrames) return frames || [];
    const step = frames.length / maxFrames;
    const sampled: string[] = [];
    for (let i = 0; i < maxFrames; i++) {
        sampled.push(frames[Math.floor(i * step)]);
    }
    return sampled;
}

// ============================================
// PDF BUILDER (using pdf-lib)
// ============================================

async function buildPDF(
    courseTitle: string,
    modules: any[],
    userEmail: string,
    supplementalFiles?: any[]
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
                drawWrappedText(line, { size: 9 });
            }
            y -= 10;
        }

        // ========== VISUAL FRAMES WITH CACHED ANALYSIS ==========
        const frameUrls = mod.frame_urls || [];
        const frameAnalyses = mod.frame_analyses || [];

        if (frameUrls.length > 0) {
            ensureSpace(30);
            currentPage.drawText('Visual Frames', {
                x: MARGIN, y, size: 12, font: boldFont, color: rgb(0, 0, 0),
            });
            y -= 14;

            // Sample frames (max 50 for server-side to keep PDF size reasonable)
            const maxServerFrames = 50;
            const sampledFrameUrls = sampleFramesEvenly(frameUrls, maxServerFrames);
            const correctedDuration = sanitizeDuration(mod.video_duration_seconds || 0, frameUrls.length);
            const frameDuration = correctedDuration > 0 ? correctedDuration / Math.max(frameUrls.length, 1) : 10;

            for (let fi = 0; fi < sampledFrameUrls.length; fi++) {
                const frameUrl = sampledFrameUrls[fi];
                const originalIndex = Math.floor(fi * (frameUrls.length / sampledFrameUrls.length));
                const analysis = frameAnalyses[originalIndex];
                const timestamp = analysis?.timestamp || (originalIndex * frameDuration);

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

                // ===== COMPOSITE VISUAL TRANSCRIPTION CAPTION =====
                // Synthesizes ALL OneDuo features: visual, on-screen text, cursor/highlights, audio, tone
                const captionParts: string[] = [];

                // FEATURE 1: Visual description
                if (analysis?.visualDescription) {
                    captionParts.push(analysis.visualDescription);
                }

                // FEATURE 2: On-screen elements
                if (analysis?.keyElements?.length > 0) {
                    captionParts.push(`[On-screen: ${analysis.keyElements.slice(0, 4).join(', ')}]`);
                }

                // FEATURE 3: Cursor & highlight tracking
                if (analysis?.emphasisFlags) {
                    const notes: string[] = [];
                    if (analysis.emphasisFlags.highlight_detected) notes.push('text highlighted');
                    if (analysis.emphasisFlags.text_selected) notes.push('text selected');
                    if (analysis.emphasisFlags.cursor_pause) notes.push('cursor paused here');
                    if (analysis.emphasisFlags.zoom_focus) notes.push('zoomed/focused');
                    if (analysis.emphasisFlags.lingering_frame) notes.push('lingered on this view');
                    if (notes.length > 0) captionParts.push(`[Interaction: ${notes.join('; ')}]`);
                }

                // FEATURE 4: Audio events for this timestamp
                const modAudioEvt = mod.audio_events || {};
                const modProsodyData = mod.prosody_annotations || {};
                const windowS = 5;
                (modAudioEvt.music_cues || []).forEach((cue: any) => {
                    if (timestamp >= cue.start && timestamp <= cue.end && Math.abs(timestamp - cue.start) < windowS) {
                        captionParts.push(`[${cue.mood} music kicks in${cue.genre ? ` - ${cue.genre}` : ''}]`);
                    }
                });
                (modAudioEvt.ambient_sounds || []).forEach((a: any) => {
                    if (Math.abs(a.timestamp - timestamp) < windowS) captionParts.push(`(${a.sound} - ${a.meaning})`);
                });
                (modAudioEvt.reactions || []).forEach((r: any) => {
                    if (Math.abs(r.timestamp - timestamp) < windowS) captionParts.push(`(${r.type} - ${r.context})`);
                });
                (modAudioEvt.meaningful_pauses || []).forEach((p: any) => {
                    if (Math.abs(p.timestamp - timestamp) < windowS) captionParts.push(p.screenplayNote);
                });
                (modProsodyData.annotations || []).forEach((p: any) => {
                    if (Math.abs(p.timestamp - timestamp) < windowS) captionParts.push(p.annotation);
                });

                // FEATURE 5: Vocal tone/emphasis
                if (analysis?.prosody?.parenthetical?.length > 0) {
                    captionParts.push(`(${analysis.prosody.parenthetical})`);
                }

                const compositeCaption = captionParts.join(' | ');
                if (compositeCaption) {
                    const truncated = compositeCaption.length > 300
                        ? compositeCaption.substring(0, 297) + '...'
                        : compositeCaption;
                    drawWrappedText(`Visual Transcription: ${truncated}`, {
                        size: 7, usedFont: italicFont, color: rgb(0.3, 0.3, 0.3),
                    });
                    y -= 5;
                }
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

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { courseId, email } = await req.json();

        if (!courseId) {
            return new Response(
                JSON.stringify({ error: "courseId is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`[generate-pdf-backend] Starting for course ${courseId}, email: ${email}`);

        // Immediately respond to the client so they can close the tab
        const responsePromise = new Response(
            JSON.stringify({ success: true, message: "PDF generation started. You'll receive an email when ready." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

        // Do the heavy work in the background
        const backgroundWork = async () => {
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            try {
                // ========== 1. FETCH COURSE DATA ==========
                console.log(`[generate-pdf-backend] Fetching course data...`);

                const { data: course, error: courseError } = await supabase
                    .from("courses")
                    .select("id, title, email, share_token, share_enabled, course_files, video_duration_seconds, transcript, frame_urls, frame_analyses")
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
              hidden_patterns, implementation_steps
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

                    if ((course as any).transformation_artifact_id) {
                        const { data: artifact } = await supabase
                            .from("transformation_artifacts")
                            .select("key_moments_index, concepts_frameworks, hidden_patterns, implementation_steps")
                            .eq("id", (course as any).transformation_artifact_id)
                            .single();

                        if (artifact) {
                            keyMoments = artifact.key_moments_index;
                            concepts = artifact.concepts_frameworks;
                            patterns = artifact.hidden_patterns;
                            implSteps = artifact.implementation_steps;
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
                        key_moments_index: keyMoments,
                        concepts_frameworks: concepts,
                        hidden_patterns: patterns,
                        implementation_steps: implSteps,
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
                    }));
                }

                console.log(`[generate-pdf-backend] ${modules.length} module(s), single=${isSingleModule}`);

                // ========== 3. RUN FRAME OCR IF NOT CACHED ==========
                const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN") || Deno.env.get("REPLICATE_API_KEY");
                let replicate: any = null;

                if (REPLICATE_API_TOKEN) {
                    replicate = new Replicate({ auth: REPLICATE_API_TOKEN });
                }

                for (const mod of modules) {
                    const frameUrls = mod.frame_urls || [];
                    const existingAnalyses = mod.frame_analyses || [];

                    // Skip OCR if already cached
                    if (existingAnalyses.length > 0) {
                        console.log(`[generate-pdf-backend] Module "${mod.title}": using ${existingAnalyses.length} cached frame analyses`);
                        continue;
                    }

                    if (frameUrls.length === 0 || !replicate) {
                        console.log(`[generate-pdf-backend] Module "${mod.title}": no frames or no Replicate API key, skipping OCR`);
                        continue;
                    }

                    // Sample frames for OCR (max 50 to keep within timeout)
                    const maxOcrFrames = 50;
                    const sampledForOcr = sampleFramesEvenly(frameUrls, maxOcrFrames);

                    const transcriptContext = (mod.transcript || [])
                        .slice(0, 50)
                        .map((t: any) => t.text || '')
                        .join(' ')
                        .substring(0, 2000);

                    console.log(`[generate-pdf-backend] Module "${mod.title}": running OCR on ${sampledForOcr.length} frames...`);

                    const analyses = await analyzeFramesWithReplicate(
                        sampledForOcr,
                        sanitizeDuration(mod.video_duration_seconds || 0, sampledForOcr.length),
                        transcriptContext,
                        replicate,
                        5 // batch size
                    );

                    mod.frame_analyses = analyses;

                    // Cache results in DB for future use
                    const table = isSingleModule ? "courses" : "course_modules";
                    const { error: cacheError } = await supabase
                        .from(table)
                        .update({ frame_analyses: analyses })
                        .eq("id", mod.id);

                    if (cacheError) {
                        console.error(`[generate-pdf-backend] Failed to cache frame analyses:`, cacheError);
                    } else {
                        console.log(`[generate-pdf-backend] Cached ${analyses.length} frame analyses for module "${mod.title}"`);
                    }
                }

                // ========== 4. LOAD SUPPLEMENTAL FILES ==========
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
                    supplementalFiles.length > 0 ? supplementalFiles : undefined
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
