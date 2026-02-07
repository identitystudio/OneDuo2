import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import PatentFigure1 from '@/components/patent/PatentFigure1';
import PatentFigure2 from '@/components/patent/PatentFigure2';
import PatentFigure3 from '@/components/patent/PatentFigure3';
import PatentFigure4 from '@/components/patent/PatentFigure4';
import PatentFigure5 from '@/components/patent/PatentFigure5';
import PatentFigure6 from '@/components/patent/PatentFigure6';
import { NoIndexMeta } from '@/components/NoIndexMeta';

const PatentFigures: React.FC = () => {
  const figureRefs = useRef<(HTMLDivElement | null)[]>([]);

  const downloadSVG = (index: number) => {
    const container = figureRefs.current[index];
    if (!container) return;
    
    const svg = container.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `FIG-${index + 1}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const svgToDataUrl = (svg: SVGSVGElement, scale: number): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve('');

      canvas.width = 800 * scale;
      canvas.height = 600 * scale;

      const svgData = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      
      img.onload = () => {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };

      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    });
  };

  const downloadPNG = async (index: number) => {
    const container = figureRefs.current[index];
    if (!container) return;
    
    const svg = container.querySelector('svg');
    if (!svg) return;

    const dataUrl = await svgToDataUrl(svg, 3);
    if (!dataUrl) return;

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `FIG-${index + 1}.png`;
    link.click();
  };

  const downloadPDF = async (index: number, pdfName: string) => {
    const container = figureRefs.current[index];
    if (!container) return;
    
    const svg = container.querySelector('svg');
    if (!svg) return;

    // USPTO standard: 8.5 x 11 inches, landscape for figures
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'in',
      format: 'letter'
    });

    // Clone SVG to avoid modifying the original
    const svgClone = svg.cloneNode(true) as SVGSVGElement;
    
    // Calculate centered position (11 x 8.5 landscape)
    const imgWidth = 9;
    const imgHeight = imgWidth * 0.75; // 800x600 ratio
    const x = (11 - imgWidth) / 2;
    const y = (8.5 - imgHeight) / 2;

    // Use jsPDF's svg() method for true vector embedding
    await pdf.svg(svgClone, {
      x: x,
      y: y,
      width: imgWidth,
      height: imgHeight
    });

    pdf.save(`${pdfName}.pdf`);
  };

  const figures = [
    { component: PatentFigure1, title: 'FIG. 1 — Sovereignty Gate (Persistence Enforcement)', pdfName: '02_FIG_1_Sovereignty_Gate' },
    { component: PatentFigure2, title: 'FIG. 2 — Trinity Reasoning Ledger + Intent Anchoring', pdfName: '03_FIG_2_Reasoning_Ledger' },
    { component: PatentFigure3, title: 'FIG. 3 — JSON Canonicalization + Signature Validation', pdfName: '04_FIG_3_JSON_Canonicalization' },
    { component: PatentFigure4, title: 'FIG. 4 — Forensic Purge Certifier', pdfName: '05_FIG_4_Forensic_Purge' },
    { component: PatentFigure5, title: 'FIG. 5 — Composite / Swarm Governance', pdfName: '06_FIG_5_Composite_Governance' },
    { component: PatentFigure6, title: 'FIG. 6 — Violation Watermark Injection + Downstream Detection', pdfName: '07_FIG_6_Violation_Watermark' },
  ];

  return (
    <div className="min-h-screen bg-white p-8">
      <NoIndexMeta />
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-serif text-black mb-2">
          USPTO Patent Figures
        </h1>
        <p className="text-sm text-gray-600 mb-8 font-serif">
          DATABASE-ENFORCED HUMAN GOVERNANCE SYSTEM FOR AI-GENERATED ARTIFACTS
        </p>

        <div className="space-y-12">
          {figures.map((fig, index) => {
            const FigureComponent = fig.component;
            return (
              <div key={index} className="border border-gray-300 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-serif text-black">{fig.title}</h2>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadSVG(index)}
                      className="text-xs"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      SVG
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadPNG(index)}
                      className="text-xs"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      PNG
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadPDF(index, fig.pdfName)}
                      className="text-xs"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      PDF
                    </Button>
                  </div>
                </div>
                <div 
                  ref={el => figureRefs.current[index] = el}
                  className="border border-gray-200"
                >
                  <FigureComponent />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 p-6 border border-gray-300 bg-gray-50">
          <h3 className="font-serif text-lg mb-4">Reference Numeral Key</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm font-mono">
            <div>100 — System overview</div>
            <div>102 — Sovereignty Gate</div>
            <div>104 — Artifact state transition</div>
            <div>106 — Trigger enforcement</div>
            <div>108 — External service request</div>
            <div>110 — Finalized artifact</div>
            <div>200 — Reasoning Ledger</div>
            <div>202 — Reasoning entry</div>
            <div>204 — Confidence score</div>
            <div>206 — Intent frame (sampled)</div>
            <div>208 — Human approval record</div>
            <div>300 — External request payload</div>
            <div>302 — Canonicalization module</div>
            <div>304 — Signature verification</div>
            <div>306 — Rejected payload</div>
            <div>308 — Canonical JSON</div>
            <div>400 — Source material</div>
            <div>402 — Canonicalization step</div>
            <div>404 — Cryptographic fingerprint</div>
            <div>406 — Deletion event</div>
            <div>408 — Immutable purge log</div>
            <div>500 — Intermediate artifact A</div>
            <div>502 — Intermediate artifact B</div>
            <div>504 — Composite behavior</div>
            <div>506 — Sovereignty Gate enforcement</div>
            <div>508 — Governed output</div>
            <div>600 — Violation Watermark System</div>
            <div>602 — Watermark Injection Module</div>
            <div>604 — Violation Signature</div>
            <div>606 — Artifact Metadata Field</div>
            <div>608 — Violation Watermark</div>
            <div>610 — Downstream System</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatentFigures;
