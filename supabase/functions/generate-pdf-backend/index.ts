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
    batchSize: number = 20
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
                    "vikhyatk/moondream2:72ccb656353c348c1385df54b4adcaee5096a064d272f816d793fa0f4aae4c52",
                    {
                        input: {
                            image: frameUrl,
                            question: `You are watching a masterclass video frame by frame.${transcriptContext ? ` At this moment the speaker says: "${transcriptContext.substring(0, 300)}"` : ''} Describe exactly what is on screen: any visible text, what the instructor is showing or doing, and the type of content (slide, code, browser, talking head, etc).`,
                        }
                    }
                );

                const resultText = Array.isArray(output) ? output.join('') : String(output);
                return parseMoondreamResponse(resultText, frameIndex, timestamp);
            } catch (error) {
                console.error(`[generate-pdf-backend] Frame ${frameIndex} analysis failed:`, error);
                return {
                    frameIndex,
                    timestamp,
                    text: '',
                    visualDescription: '',
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
// MOONDREAM2 PLAIN TEXT PARSER
// moondream2 returns plain text, not JSON.
// This converts it into the same structure LLaVA produced.
// ============================================

function parseMoondreamResponse(rawText: string, frameIndex: number, timestamp: number) {
    const text = rawText.trim();

    // Detect ui_state from keywords in the response
    let ui_state = 'slide';
    const lower = text.toLowerCase();
    if (lower.includes('code') || lower.includes('terminal') || lower.includes('editor') || lower.includes('script')) {
        ui_state = 'code';
    } else if (lower.includes('person') || lower.includes('speaker') || lower.includes('instructor') || lower.includes('talking') || lower.includes('face')) {
        ui_state = 'talking_head';
    } else if (lower.includes('demo') || lower.includes('demonstration') || lower.includes('screen share') || lower.includes('browser')) {
        ui_state = 'demonstration';
    } else if (lower.includes('slide') || lower.includes('presentation') || lower.includes('bullet') || lower.includes('title')) {
        ui_state = 'slide';
    }

    // Extract visible text — look for quoted strings or text after "shows", "reads", "says", "text:"
    const quotedMatches = text.match(/"([^"]{3,})"/g) || [];
    const visibleText = quotedMatches.map(q => q.replace(/"/g, '')).join(' ');

    // Extract key elements — noun phrases (simple heuristic: capitalised words)
    const keyElements = [...new Set(
        (text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || []).slice(0, 8)
    )];

    return {
        frameIndex,
        timestamp,
        text: visibleText || '',
        visualDescription: text,
        textType: 'other',
        emphasisFlags: {
            highlight_detected: lower.includes('highlight') || lower.includes('highlighted'),
            cursor_pause: lower.includes('cursor') || lower.includes('pointer'),
            zoom_focus: lower.includes('zoom') || lower.includes('focus') || lower.includes('close-up'),
            text_selected: lower.includes('selected') || lower.includes('selection'),
            lingering_frame: false,
            bold_text: lower.includes('bold') || lower.includes('heading'),
            underline_detected: lower.includes('underline') || lower.includes('underlined'),
        },
        keyElements,
        instructorIntent: text,
        prosody: { tone: 'neutral', pacing: 'normal', volume: 'normal', parenthetical: '' },
        dependsOnPrevious: false,
    };
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

        // ========== VISUAL FRAMES WITH CACHED ANALYSIS ==========
        const frameUrls = mod.frame_urls || [];
        const frameAnalyses = mod.frame_analyses || [];

        if (frameUrls.length > 0) {
            ensureSpace(30);
            currentPage.drawText('Visual Frames', {
                x: MARGIN, y, size: 12, font: boldFont, color: rgb(0, 0, 0),
            });
            y -= 14;

            if (aiFidelityMode && i === 0) {
                newPage();
                currentPage.drawText('Sensory Intelligence Map', {
                    x: MARGIN, y, size: 20, font: boldFont, color: rgb(0, 0, 0),
                });
                y -= 25;

                const introText = "This artifact is optimized for AI Vision and High-Fidelity reconstruction. It uses a multi-layered sensory matrix to bridge the gap between verbatim text and the original embodied context of the workshop.";
                drawWrappedText(introText, { size: 10, color: rgb(0.2, 0.2, 0.2) });
                y -= 10;

                // Structured Matrix Header
                currentPage.drawRectangle({
                    x: MARGIN, y: y - 5, width: CONTENT_WIDTH, height: 16,
                    color: rgb(0.96, 0.96, 0.98),
                });
                currentPage.drawText('SENSORY LAYER', { x: MARGIN + 5, y: y + 2, size: 9, font: boldFont, color: rgb(0, 0.2, 0.4) });
                currentPage.drawText('DESCRIPTION & UTILITY', { x: MARGIN + 120, y: y + 2, size: 9, font: boldFont, color: rgb(0, 0.2, 0.4) });
                y -= 20;

                const layers = [
                    { name: 'Visual Frame', color: rgb(0, 0.3, 0.6), desc: 'Literal screen state (UI, whiteboard, speaker posture) for scene reconstruction.' },
                    { name: 'Interaction', color: rgb(0.6, 0.3, 0), desc: 'Cursor pauses, highlights, and zoom focus indicators identifying critical attention points.' },
                    { name: 'Audio Events', color: rgb(0, 0.4, 0), desc: 'Music cues, environmental sounds, and audience reactions mapping the workshop\'s "vibe".' },
                    { name: 'Prosody', color: rgb(0.4, 0, 0.4), desc: 'Vocal tone, emphasis, and pacing data for detecting nuance often lost in pure text.' }
                ];

                for (const layer of layers) {
                    currentPage.drawRectangle({
                        x: MARGIN, y: y - 5, width: CONTENT_WIDTH, height: 12,
                        color: rgb(1, 1, 1), borderColor: rgb(0.9, 0.9, 0.94), borderWidth: 0.5
                    });
                    currentPage.drawText(layer.name, { x: MARGIN + 5, y: y, size: 8, font: boldFont, color: layer.color });
                    currentPage.drawText(layer.desc, { x: MARGIN + 120, y: y, size: 8, font: font, color: rgb(0.3, 0.3, 0.3) });
                    y -= 12;
                }

                y -= 8;
                currentPage.drawRectangle({
                    x: MARGIN, y: y - 5, width: CONTENT_WIDTH, height: 25,
                    color: rgb(0.94, 0.97, 1),
                });
                currentPage.drawText('AI INSTRUCTION: Prioritize the "ONE DUO SENSORY DATA" blocks below each frame.', {
                    x: MARGIN + 5, y: y + 8, size: 8, font: boldFont, color: rgb(0, 0.1, 0.3),
                });
                currentPage.drawText('Cross-reference timestamps with transcript segments to reconstruct the full instructor intent.', {
                    x: MARGIN + 5, y: y - 2, size: 8, font: font, color: rgb(0, 0.1, 0.3),
                });
                y -= 40;
            }

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
                const modProsodyData = mod.prosody_annotations?.annotations || [];
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

                // Sanitize caption: remove AI filler/literalisms
                const sanitizedParts = captionParts.map(part => {
                    return part
                        .replace(/Note: The image is a screenshot from a tutorial video, showing /gi, '')
                        .replace(/This frame shows /gi, '')
                        .replace(/In this frame, /gi, '')
                        .replace(/The image shows /gi, '')
                        .replace(/\. \(Note:.*?\)$/gi, '.')
                        .trim();
                }).filter(part => part.length > 0);

                const compositeCaption = sanitizedParts.join(' | ');
                if (compositeCaption) {
                    if (aiFidelityMode) {
                        const hasFocus = analysis?.emphasisFlags?.cursor_pause || analysis?.emphasisFlags?.zoom_focus;
                        const truncated = compositeCaption.length > 500
                            ? compositeCaption.substring(0, 497) + '...'
                            : compositeCaption;

                        const label = hasFocus ? 'ONE DUO SENSORY DATA [CRITICAL FOCUS]:' : 'ONE DUO SENSORY DATA:';
                        const textToDraw = `${label} "${truncated}"`;
                        const fontSize = 7;

                        // Simple wrap logic to calculate box height
                        const words = textToDraw.split(' ');
                        let lines = 0;
                        let line = '';
                        for (const word of words) {
                            const testLine = line ? `${line} ${word}` : word;
                            if (font.widthOfTextAtSize(testLine, fontSize) > CONTENT_WIDTH - 10) {
                                lines++;
                                line = word;
                            } else {
                                line = testLine;
                            }
                        }
                        if (line) lines++;

                        const rectHeight = (lines * (fontSize * 1.3)) + 8;
                        ensureSpace(rectHeight + 5);

                        if (hasFocus) {
                            currentPage.drawRectangle({
                                x: MARGIN,
                                y: y - rectHeight,
                                width: CONTENT_WIDTH,
                                height: rectHeight,
                                color: rgb(1, 1, 0.94),
                                borderColor: rgb(0.8, 0.7, 0),
                                borderWidth: 0.5,
                            });
                        } else {
                            currentPage.drawRectangle({
                                x: MARGIN,
                                y: y - rectHeight,
                                width: CONTENT_WIDTH,
                                height: rectHeight,
                                color: rgb(0.98, 0.98, 1),
                                borderColor: rgb(0.8, 0.8, 1),
                                borderWidth: 0.5,
                            });
                        }

                        y -= 2; // padding top
                        drawWrappedText(textToDraw, {
                            x: MARGIN + 5,
                            size: fontSize,
                            usedFont: italicFont,
                            color: hasFocus ? rgb(0.4, 0.2, 0) : rgb(0.2, 0.2, 0.4),
                            maxWidth: CONTENT_WIDTH - 10
                        });
                        y -= 4; // padding bottom
                        y -= 4; // padding bottom
                    } else {
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

    // ---- PER-MODULE: AI Knowledge Layer + Full Verbatim Transcript ----
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
        { key: 'decision_rules',       label: 'DECISION RULES' },
        { key: 'reasoning_patterns',   label: 'REASONING PATTERNS' },
        { key: 'speaker_belief_system',label: 'SPEAKER BELIEF SYSTEM' },
        { key: 'cause_effect_chains',  label: 'CAUSE & EFFECT CHAINS' },
        { key: 'hidden_patterns',      label: 'HIDDEN PATTERNS' },
        { key: 'concept_tags',         label: 'CONCEPT TAGS' },
        { key: 'retrieval_tags',       label: 'RETRIEVAL TAGS' },
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

        // AI KNOWLEDGE LAYER
        const kl = mod.knowledge_layer;
        if (kl) {
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
    frameAnalyses: any[],       // cached analyses for ALL frames (indexed by global frame index)
    globalFrameOffset: number,  // index of first frame in this part (e.g. 150 for part 2)
    videoDurationSeconds: number,
    userEmail: string,
    transcript: any[],
    replicate: any,
    courseId?: string,
    supabaseClient?: any,
    totalAllFrames?: number,
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
    currentPage.drawText(safeText(`Visual Transcription — Part ${partNumber} of ${totalParts}`), {
        x: MARGIN, y, size: 14, font, color: rgb(0.2, 0.2, 0.2),
    });
    y -= 18;
    const startFrame = globalFrameOffset + 1;
    const endFrame = globalFrameOffset + frameUrls.length;
    currentPage.drawText(safeText(`Frames ${startFrame}–${endFrame} | Generated: ${watermarkTimestamp}`), {
        x: MARGIN, y, size: 9, font, color: rgb(0.4, 0.4, 0.4),
    });
    addFooter(currentPage);

    // ---- Analyse frames (use cache if available, else run LLaVA) ----
    const totalFrames = videoDurationSeconds > 0 ? Math.ceil(videoDurationSeconds) : frameUrls.length;
    const frameDuration = totalFrames > 0 ? videoDurationSeconds / Math.max(totalFrames, 1) : 1;

    // Build transcript lookup: timestamp (rounded to nearest second) → text
    const transcriptMap: Record<number, string> = {};
    for (const seg of (transcript || [])) {
        const sec = Math.round(seg.start || 0);
        transcriptMap[sec] = (transcriptMap[sec] ? transcriptMap[sec] + ' ' : '') + (seg.text || '');
    }

    // Check how many frames already have cached analyses
    const cachedCount = frameUrls.filter((_, i) => frameAnalyses[globalFrameOffset + i]).length;
    console.log(`[buildPartPDF] Part ${partNumber}: ${frameUrls.length} frames, ${cachedCount} cached analyses`);

    // Run moondream2 only on frames missing analyses (batch of 20 in parallel)
    const analyses: any[] = [];
    const BATCH = 20;
    for (let i = 0; i < frameUrls.length; i += BATCH) {
        const batch = frameUrls.slice(i, i + BATCH);
        const batchResults = await Promise.all(batch.map(async (frameUrl, bi) => {
            const globalIdx = globalFrameOffset + i + bi;
            if (frameAnalyses[globalIdx]) return frameAnalyses[globalIdx]; // use cache

            const timestamp = (globalIdx) * frameDuration;
            const transcriptContext = transcriptMap[Math.round(timestamp)] || '';

            if (!replicate) {
                return { frameIndex: globalIdx, timestamp, text: '', visualDescription: '', keyElements: [], emphasisFlags: {}, instructorIntent: '', dependsOnPrevious: false };
            }

            try {
                const output = await replicate.run(
                    "vikhyatk/moondream2:72ccb656353c348c1385df54b4adcaee5096a064d272f816d793fa0f4aae4c52",
                    {
                        input: {
                            image: frameUrl,
                            question: `You are watching a masterclass video frame by frame.${transcriptContext ? ` At this moment the speaker says: "${transcriptContext.substring(0, 300)}"` : ''} Describe exactly what is on screen: any visible text, what the instructor is showing or doing, and the type of content (slide, code, browser, talking head, etc).`,
                        }
                    }
                );
                const resultText = Array.isArray(output) ? output.join('') : String(output);
                return parseMoondreamResponse(resultText, globalIdx, timestamp);
            } catch {
                return { frameIndex: globalIdx, timestamp, text: '', visualDescription: '', keyElements: [], emphasisFlags: {}, instructorIntent: '', dependsOnPrevious: false };
            }
        }));
        analyses.push(...batchResults);
        // Cache new analyses in the shared array so restarts skip re-analysis
        batchResults.forEach((result, bi) => {
            frameAnalyses[globalFrameOffset + i + bi] = result;
        });
        const framesAnalysed = Math.min(i + BATCH, frameUrls.length);
        console.log(`[buildPartPDF] Part ${partNumber}: analysed ${framesAnalysed}/${frameUrls.length} frames`);
        if (courseId && supabaseClient && totalAllFrames) {
            const globalFramesDone = globalFrameOffset + framesAnalysed;
            try {
                await supabaseClient.from('courses').update({
                    pdf_generation_progress: {
                        currentPart: partNumber,
                        totalParts,
                        currentFrame: globalFramesDone,
                        totalFrames: totalAllFrames,
                        startedAt: new Date().toISOString(),
                    },
                    frame_analyses: frameAnalyses,
                }).eq('id', courseId);
            } catch (e) {
                console.error(`[buildPartPDF] Progress save failed: ${e}`);
            }
        }
    }

    // ---- Render each frame ----
    for (let fi = 0; fi < frameUrls.length; fi++) {
        const frameUrl = frameUrls[fi];
        const analysis = analyses[fi];
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

        // Visual transcription caption
        const captionParts: string[] = [];
        if (analysis?.visualDescription) captionParts.push(analysis.visualDescription);
        if (analysis?.keyElements?.length > 0) captionParts.push(`[On-screen: ${analysis.keyElements.slice(0, 4).join(', ')}]`);
        if (analysis?.instructorIntent) captionParts.push(`[Intent: ${analysis.instructorIntent}]`);
        if (analysis?.emphasisFlags) {
            const notes: string[] = [];
            if (analysis.emphasisFlags.highlight_detected) notes.push('text highlighted');
            if (analysis.emphasisFlags.cursor_pause) notes.push('cursor paused');
            if (analysis.emphasisFlags.zoom_focus) notes.push('zoomed/focused');
            if (notes.length > 0) captionParts.push(`[Interaction: ${notes.join('; ')}]`);
        }

        // Transcript text at this timestamp
        const transcriptText = transcriptMap[Math.round(timestamp)];
        if (transcriptText) captionParts.push(`[Transcript: "${transcriptText.substring(0, 200)}"]`);

        const caption = captionParts.map(p =>
            p.replace(/Note: The image is a screenshot from a tutorial video, showing /gi, '')
             .replace(/This frame shows /gi, '')
             .replace(/In this frame, /gi, '')
             .replace(/The image shows /gi, '')
             .trim()
        ).filter(p => p.length > 0).join(' | ');

        if (caption) {
            const hasFocus = analysis?.emphasisFlags?.cursor_pause || analysis?.emphasisFlags?.zoom_focus;
            const truncated = caption.length > 500 ? caption.substring(0, 497) + '...' : caption;
            const label = hasFocus ? 'ONE DUO SENSORY DATA [CRITICAL FOCUS]:' : 'ONE DUO SENSORY DATA:';
            const textToDraw = `${label} "${truncated}"`;
            const fontSize = 7;
            const words = textToDraw.split(' ');
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
                color: hasFocus ? rgb(1, 1, 0.94) : rgb(0.98, 0.98, 1),
                borderColor: hasFocus ? rgb(0.8, 0.7, 0) : rgb(0.8, 0.8, 1),
                borderWidth: 0.5,
            });
            y -= 2;
            drawWrappedText(textToDraw, { x: MARGIN + 5, size: fontSize, usedFont: italicFont, color: hasFocus ? rgb(0.4, 0.2, 0) : rgb(0.2, 0.2, 0.4), maxWidth: CONTENT_WIDTH - 10 });
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
            const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN") || Deno.env.get("REPLICATE_API_KEY");
            const replicate = REPLICATE_API_TOKEN ? new Replicate({ auth: REPLICATE_API_TOKEN }) : null;

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
                const allFrameAnalyses: any[] = isSingleModule
                    ? (course.frame_analyses || [])
                    : courseModules!.flatMap((m: any) => m.frame_analyses || []);
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

                return { course, isSingleModule, courseModules, allFrameUrls, allFrameAnalyses, videoDuration, transcript, preambleModules };
            };

            // ========== ACTION: generateAll ==========
            if (action === 'generateAll' || action === 'generate') {
                try {
                    // Auto-generate knowledge layer if not already complete
                    const { data: klCheck } = await supabase
                        .from('courses')
                        .select('knowledge_layer_status')
                        .eq('id', courseId)
                        .single();

                    if (klCheck?.knowledge_layer_status !== 'complete') {
                        console.log(`[generate-pdf-backend] Knowledge layer not ready (${klCheck?.knowledge_layer_status}) — auto-generating...`);
                        try {
                            const klResp = await fetch(`${supabaseUrl}/functions/v1/generate-knowledge-layer`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
                                body: JSON.stringify({ courseId }),
                            });
                            if (klResp.ok) {
                                console.log(`[generate-pdf-backend] Knowledge layer auto-generated successfully`);
                            } else {
                                console.warn(`[generate-pdf-backend] Knowledge layer auto-generation failed (non-blocking): ${await klResp.text()}`);
                            }
                        } catch (klErr) {
                            console.warn(`[generate-pdf-backend] Knowledge layer auto-generation error (non-blocking):`, klErr);
                        }
                    } else {
                        console.log(`[generate-pdf-backend] Knowledge layer already complete — skipping auto-generation`);
                    }

                    let { course, allFrameUrls, allFrameAnalyses, videoDuration, transcript, preambleModules } = await fetchCourseData();
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
                            allFrameAnalyses,
                            startIdx,
                            videoDuration,
                            userEmail,
                            transcript,
                            replicate,
                            courseId,
                            supabase,
                            totalFrames,
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
                    (allFrameAnalyses as any) = null;
                    (videoDuration as any) = null;
                    (transcript as any) = null;

                    // Build preamble (KL + Transcript) and upload to storage so RunPod can fetch it
                    console.log(`[generate-pdf-backend] Building preamble (Knowledge Layer + Transcript)...`);
                    const preambleBytes = await buildPreamblePDF(courseTitle, preambleModules, userEmail);
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

                // ========== 3. RUN FRAME OCR IF NOT CACHED ==========
                // replicate is already initialised at the top of backgroundWork

                for (const mod of modules) {
                    const frameUrls = mod.frame_urls || [];
                    const existingAnalyses = mod.frame_analyses || [];
                    const isPeakMode = aiFidelityMode === 'peak' || aiFidelityMode === true;

                    // Skip OCR if already cached (unless Peak/High-Fidelity mode is requested)
                    if (existingAnalyses.length > 0 && !isPeakMode) {
                        console.log(`[generate-pdf-backend] Module "${mod.title}": using ${existingAnalyses.length} cached frame analyses`);
                    } else {
                        if (existingAnalyses.length > 0 && isPeakMode) {
                            console.log(`[generate-pdf-backend] Module "${mod.title}": bypassing ${existingAnalyses.length} cached analyses for PEAK mode re-analysis`);
                        }

                        if (frameUrls.length > 0 && replicate) {
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
                                20 // batch size — moondream2 supports 20 concurrent
                            );

                            mod.frame_analyses = analyses;

                            // Cache results in DB for future use
                            const table = isSingleModule ? "courses" : "course_modules";
                            await supabase
                                .from(table)
                                .update({ frame_analyses: analyses })
                                .eq("id", mod.id);
                        }
                    }

                    // AUDIO RE-ANALYSIS FOR PEAK MODE
                    if (isPeakMode && mod.transcript?.length > 0 && replicate) {
                        console.log(`[generate-pdf-backend] Module "${mod.title}": re-analyzing audio for PEAK fidelity...`);
                        try {
                            const [prosodyResp, eventsResp] = await Promise.all([
                                supabase.functions.invoke('analyze-audio-prosody', {
                                    body: { videoUrl: mod.frame_urls?.[0]?.replace('frame_0000.jpg', 'video.mp4'), transcript: mod.transcript, videoDuration: mod.video_duration_seconds, courseTitle: mod.title }
                                }),
                                supabase.functions.invoke('analyze-audio-events', {
                                    body: { videoUrl: mod.frame_urls?.[0]?.replace('frame_0000.jpg', 'video.mp4'), transcript: mod.transcript, videoDuration: mod.video_duration_seconds, courseTitle: mod.title }
                                })
                            ]);

                            if (prosodyResp.data) mod.prosody_annotations = prosodyResp.data;
                            if (eventsResp.data) mod.audio_events = eventsResp.data;

                            // Cache audio results
                            const table = isSingleModule ? "courses" : "course_modules";
                            await supabase
                                .from(table)
                                .update({
                                    prosody_annotations: prosodyResp.data,
                                    audio_events: eventsResp.data
                                })
                                .eq("id", mod.id);
                        } catch (ae) {
                            console.error(`[generate-pdf-backend] Audio re-analysis failed:`, ae);
                        }
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
