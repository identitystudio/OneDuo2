import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- PDF Text Sanitization ---
const REPLACEMENTS: Array<[RegExp, string]> = [
    [/\u00A0/g, ' '], // nbsp
    [/\u202F/g, ' '], // narrow nbsp
    [/\u200B/g, ''], // zero width space
    [/\u200C/g, ''],
    [/\u200D/g, ''],
    [/\uFEFF/g, ''], // BOM
    [/\u201C|\u201D/g, '"'], // smart double quotes
    [/\u2018|\u2019/g, "'"], // smart single quotes
    [/\u2014|\u2013/g, '-'], // em/en dash
];

function sanitizePdfText(input: unknown): string {
    if (input === null || input === undefined) return '';
    let s = String(input);
    for (const [re, v] of REPLACEMENTS) s = s.replace(re, v);
    s = s.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
    s = s.replace(/\u0000/g, '');
    return s;
}

const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
};

function sampleFramesEvenly(frames: string[], max: number): string[] {
    if (frames.length <= max) return frames;
    const step = frames.length / max;
    const sampled: string[] = [];
    for (let i = 0; i < max; i++) {
        const idx = Math.floor(i * step);
        sampled.push(frames[idx]);
    }
    return sampled;
}

const LEGAL_FOOTER = `Proprietary Governance Artifact - Not For AI Training or System Replication. Identity Nails LLC / OneDuo - All Rights Reserved.`;

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { courseId, moduleId, userEmail, options = {} } = await req.json();

        if (!courseId && !moduleId) {
            return new Response(
                JSON.stringify({ error: "courseId or moduleId is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Immediate response to client (Job Accepted)
        const response = new Response(
            JSON.stringify({
                success: true,
                message: "Background PDF generation started. You will receive an email once complete."
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

        // Run the generation in the background
        // @ts-ignore: EdgeRuntime is available in Supabase
        EdgeRuntime.waitUntil((async () => {
            try {
                console.log(`[generate-pdf-backend] Background task started for ${moduleId || courseId}`);

                let courseData: any = null;
                let moduleData: any = null;
                let title = "";
                let videoDuration = 0;
                let transcript: any[] = [];
                let frameUrls: string[] = [];

                if (moduleId) {
                    const { data, error } = await supabase
                        .from("course_modules")
                        .select("*, courses(title, email)")
                        .eq("id", moduleId)
                        .single();
                    if (error) throw error;
                    moduleData = data;
                    title = data.title;
                    videoDuration = data.video_duration_seconds || 0;
                    transcript = data.transcript || [];
                    frameUrls = data.frame_urls || [];
                } else {
                    const { data, error } = await supabase
                        .from("courses")
                        .select("*")
                        .eq("id", courseId)
                        .single();
                    if (error) throw error;
                    courseData = data;
                    title = data.title;
                    videoDuration = data.video_duration_seconds || 0;
                    transcript = data.transcript || [];
                    frameUrls = data.frame_urls || [];
                }

                const watermarkEmail = userEmail || moduleData?.courses?.email || courseData?.email || "";
                const watermarkTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

                const pdf = new jsPDF({
                    orientation: 'portrait',
                    unit: 'mm',
                    format: 'a4',
                });

                const pageWidth = pdf.internal.pageSize.getWidth();
                const pageHeight = pdf.internal.pageSize.getHeight();
                const margin = 15;
                const contentWidth = pageWidth - margin * 2;
                let y = margin;
                let currentPage = 1;

                const addWatermark = () => {
                    if (!watermarkEmail) return;
                    const footerY = pageHeight - 10;
                    pdf.setFontSize(7);
                    pdf.setTextColor(150, 150, 150);
                    pdf.text(`Proprietary Intel: OneDuo | Authorized: ${watermarkEmail}`, margin, footerY);
                    pdf.text(`Distilled: ${watermarkTimestamp}`, pageWidth - margin, footerY, { align: 'right' });

                    pdf.setFontSize(6);
                    pdf.text('Proprietary Governance Artifact - Not For AI Training. Unauthorized reproduction prohibited.', pageWidth / 2, footerY + 4, { align: 'center', maxWidth: contentWidth });
                };

                const addPageHeaders = () => {
                    pdf.setFontSize(7);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(100, 100, 100);
                    pdf.text('OneDuo Artifact | VALIDATION REQUIRED', margin, 8);
                    pdf.text(`Page ${currentPage}`, pageWidth - margin, 8, { align: 'right' });
                    addWatermark();
                };

                // --- PAGE 1: TITLE PAGE ---
                addPageHeaders();
                y = margin + 20;
                pdf.setFontSize(24);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(0, 0, 0);
                const titleLines = pdf.splitTextToSize(title || "Untitled Session", contentWidth);
                pdf.text(titleLines, pageWidth / 2, y, { align: 'center' });
                y += 20 + (titleLines.length * 8);

                pdf.setFontSize(12);
                pdf.setFont('helvetica', 'normal');
                pdf.text(`Session Date: ${new Date().toLocaleDateString()}`, pageWidth / 2, y, { align: 'center' });
                y += 15;

                pdf.setFontSize(18);
                pdf.setFont('helvetica', 'bold');
                pdf.text('MASTER PDF FORMAT FOR AI', margin, y);
                y += 12;

                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(50, 50, 50);
                pdf.text('1. Full Verbatim Transcript', margin + 3, y); y += 6;
                pdf.text('2. Layer A: Key Moments Index', margin + 3, y); y += 6;
                pdf.text('3. Layer B: Concepts & Frameworks', margin + 3, y); y += 6;
                pdf.text('4. Layer C: Actionable Steps', margin + 3, y); y += 6;
                pdf.text('5. Forensic Visual Capture (Frames)', margin + 3, y); y += 15;

                pdf.setFontSize(8);
                pdf.setTextColor(150, 150, 150);
                const legalLines = pdf.splitTextToSize(LEGAL_FOOTER, contentWidth);
                pdf.text(legalLines, margin, y);

                // --- TRANSCRIPT ---
                if (transcript.length > 0) {
                    pdf.addPage();
                    currentPage++;
                    addPageHeaders();
                    y = margin + 10;
                    pdf.setFontSize(14);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(0, 0, 0);
                    pdf.text('FULL VERBATIM TRANSCRIPT', margin, y);
                    y += 10;
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(10);

                    for (const seg of transcript) {
                        const ts = formatTime(seg.start || 0);
                        const speaker = seg.speaker || "Speaker";
                        const segmentText = sanitizePdfText(seg.text || "");
                        const line = `[${ts}] ${speaker}: ${segmentText}`;
                        const splitLines = pdf.splitTextToSize(line, contentWidth);

                        for (const textLine of splitLines) {
                            if (y > pageHeight - 20) {
                                pdf.addPage();
                                currentPage++;
                                addPageHeaders();
                                y = margin + 10;
                            }
                            pdf.text(textLine, margin, y);
                            y += 5;
                        }
                        y += 2;
                    }
                }

                // --- INTELLIGENCE LAYERS ---
                const layers = [
                    { title: 'INTELLIGENCE LAYER A: KEY MOMENTS INDEX', data: courseData?.key_moments_index || [] },
                    { title: 'INTELLIGENCE LAYER B: CONCEPTS & FRAMEWORKS', data: courseData?.concepts_frameworks || [] },
                    { title: 'INTELLIGENCE LAYER C: ACTIONABLE STEPS', data: courseData?.implementation_steps || [] },
                    { title: 'INTELLIGENCE LAYER D: HIDDEN PATTERNS', data: courseData?.hidden_patterns || [] },
                ];

                for (const layer of layers) {
                    if (layer.data.length > 0) {
                        pdf.addPage();
                        currentPage++;
                        addPageHeaders();
                        y = margin + 10;
                        pdf.setFontSize(14);
                        pdf.setFont('helvetica', 'bold');
                        pdf.text(layer.title, margin, y);
                        y += 10;
                        pdf.setFontSize(10);
                        pdf.setFont('helvetica', 'normal');

                        for (const item of layer.data) {
                            const itemText = sanitizePdfText(`${item.timestamp ? `[${item.timestamp}] ` : ''}${item.title ? `${item.title}: ` : ''}${item.description}`);
                            const splitLines = pdf.splitTextToSize(itemText, contentWidth - 5);

                            if (y > pageHeight - 20) {
                                pdf.addPage();
                                currentPage++;
                                addPageHeaders();
                                y = margin + 10;
                            }

                            pdf.text('•', margin, y);
                            pdf.text(splitLines, margin + 5, y);
                            y += (splitLines.length * 5) + 3;
                        }
                    }
                }

                // --- FRAMES ---
                const maxFrames = options.maxFrames || 250;
                const sampledFrames = sampleFramesEvenly(frameUrls, maxFrames);

                if (sampledFrames.length > 0) {
                    console.log(`[generate-pdf-backend] Embedding ${sampledFrames.length} frames`);
                    pdf.addPage();
                    currentPage++;
                    addPageHeaders();
                    y = margin + 10;
                    pdf.setFontSize(14);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text('FORENSIC VISUAL CAPTURE', margin, y);
                    y += 10;

                    const frameWidth = (contentWidth - 5) / 2;
                    const frameHeight = (frameWidth * 9) / 16;
                    let x = margin;

                    for (let i = 0; i < sampledFrames.length; i++) {
                        if (y + frameHeight + 10 > pageHeight - 20) {
                            pdf.addPage();
                            currentPage++;
                            addPageHeaders();
                            y = margin + 10;
                            x = margin;
                        }

                        try {
                            const imgUrl = sampledFrames[i];
                            const imgResp = await fetch(imgUrl);
                            const imgBlob = await imgResp.blob();
                            const imgArrayBuffer = await imgBlob.arrayBuffer();
                            const imgUint8 = new Uint8Array(imgArrayBuffer);

                            pdf.addImage(imgUint8, 'JPEG', x, y, frameWidth, frameHeight);

                            const timestamp = formatTime((videoDuration / sampledFrames.length) * i);
                            pdf.setFontSize(8);
                            pdf.text(`Frame ${i + 1} [${timestamp}]`, x, y + frameHeight + 4);

                            if (x === margin) {
                                x = margin + frameWidth + 5;
                            } else {
                                x = margin;
                                y += frameHeight + 15;
                            }
                        } catch (imgErr) {
                            console.warn(`[generate-pdf-backend] Failed to load frame ${i}:`, imgErr);
                        }
                    }
                }

                // --- FINALIZE AND UPLOAD ---
                const pdfOutput = pdf.output('arraybuffer');
                const fileName = `exports/backend-${moduleId || courseId}-${Date.now()}.pdf`;

                const { error: uploadError } = await supabase.storage
                    .from("course-files")
                    .upload(fileName, pdfOutput, {
                        contentType: "application/pdf",
                        upsert: true
                    });

                if (uploadError) throw uploadError;

                console.log(`[generate-pdf-backend] PDF uploaded to ${fileName}`);

                // --- CALL EMAIL FUNCTION ---
                const { error: emailError } = await supabase.functions.invoke('send-pdf-email', {
                    body: {
                        courseId: courseId || moduleData?.course_id,
                        email: watermarkEmail,
                        filePath: fileName,
                        fileName: `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`
                    }
                });

                if (emailError) {
                    console.error(`[generate-pdf-backend] Email trigger failed:`, emailError);
                } else {
                    console.log(`[generate-pdf-backend] Email trigger successful`);
                }

            } catch (err) {
                console.error(`[generate-pdf-backend] Background task FAILED:`, err);
                // We might want to log this to a separate table or just rely on manual retries for now
            }
        })());

        return response;

    } catch (error) {
        console.error("[generate-pdf-backend] Immediate error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
    }
});
