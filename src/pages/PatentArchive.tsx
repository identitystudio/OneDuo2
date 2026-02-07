import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, CheckCircle, ShieldCheck, AlertTriangle, Package } from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import JSZip from 'jszip';
import PatentFigure1 from '@/components/patent/PatentFigure1';
import PatentFigure2 from '@/components/patent/PatentFigure2';
import PatentFigure3 from '@/components/patent/PatentFigure3';
import PatentFigure4 from '@/components/patent/PatentFigure4';
import PatentFigure5 from '@/components/patent/PatentFigure5';
import PatentFigure6 from '@/components/patent/PatentFigure6';
import { NoIndexMeta } from '@/components/NoIndexMeta';

// Document manifest - Notes/Working Drafts marked INTERNAL ONLY
const FILING_DOCUMENTS = [
  { id: 'provisional-draft', name: 'Provisional Draft', category: 'Core Filing', includeInUSPTO: true },
  { id: 'transmittal-letter', name: 'Transmittal Letter', category: 'Core Filing', includeInUSPTO: true },
  { id: 'exhibit-a-numerals', name: 'Exhibit A — Table of Numerals', category: 'Core Filing', includeInUSPTO: true },
  { id: 'internal-memo-counsel', name: 'Internal Memo for Counsel', category: 'Supporting', includeInUSPTO: true },
  { id: 'claim-stress-test', name: 'Claim Stress-Test', category: 'Supporting', includeInUSPTO: true },
  { id: 'regulatory-positioning', name: 'Regulatory Positioning Memo', category: 'Supporting', includeInUSPTO: true },
  { id: 'competitive-landscape', name: 'Competitive Landscape', category: 'Supporting', includeInUSPTO: true },
  { id: 'attorney-intake', name: 'Attorney Intake Form', category: 'Supporting', includeInUSPTO: true },
  { id: 'notes-working-drafts', name: 'Notes & Working Drafts', category: 'INTERNAL ONLY', includeInUSPTO: false },
];

const REFERENCE_NUMERALS = [
  // FIG. 1 — Sovereignty Gate
  { numeral: '100', description: 'System Overview', figure: 1 },
  { numeral: '102', description: 'Sovereignty Gate', figure: 1 },
  { numeral: '104', description: 'Artifact State Transition Path', figure: 1 },
  { numeral: '106', description: 'Trigger Enforcement Logic', figure: 1 },
  { numeral: '108', description: 'External Service Request', figure: 1 },
  { numeral: '110', description: 'Finalized Artifact', figure: 1 },
  // FIG. 2 — Reasoning Ledger
  { numeral: '200', description: 'Reasoning Ledger System', figure: 2 },
  { numeral: '202', description: 'Reasoning Entry (append-only)', figure: 2 },
  { numeral: '204', description: 'Confidence Score', figure: 2 },
  { numeral: '206', description: 'Intent Frame (sampled at predetermined interval)', figure: 2 },
  { numeral: '208', description: 'Human Approval Record', figure: 2 },
  // FIG. 3 — JSON Canonicalization
  { numeral: '300', description: 'External Request Payload', figure: 3 },
  { numeral: '302', description: 'Canonicalization Module', figure: 3 },
  { numeral: '304', description: 'Signature Verification Gate', figure: 3 },
  { numeral: '306', description: 'Rejected Payload', figure: 3 },
  { numeral: '308', description: 'Canonical JSON (signed)', figure: 3 },
  // FIG. 4 — Forensic Purge
  { numeral: '400', description: 'Source Material (video)', figure: 4 },
  { numeral: '402', description: 'Canonicalization Step', figure: 4 },
  { numeral: '404', description: 'Cryptographic Fingerprint', figure: 4 },
  { numeral: '406', description: 'Deletion Event', figure: 4 },
  { numeral: '408', description: 'Immutable Purge Audit Log', figure: 4 },
  // FIG. 5 — Composite/Swarm Governance
  { numeral: '500', description: 'Intermediate Artifact A', figure: 5 },
  { numeral: '502', description: 'Intermediate Artifact B', figure: 5 },
  { numeral: '504', description: 'Composite Behavior', figure: 5 },
  { numeral: '506', description: 'Sovereignty Gate (Enforcement)', figure: 5 },
  { numeral: '508', description: 'Governed Output', figure: 5 },
  // FIG. 6 — Violation Watermark System
  { numeral: '600', description: 'Violation Watermark System', figure: 6 },
  { numeral: '602', description: 'Watermark Injection Module', figure: 6 },
  { numeral: '604', description: 'Violation Signature', figure: 6 },
  { numeral: '606', description: 'Artifact Metadata Field', figure: 6 },
  { numeral: '608', description: 'Violation Watermark (Persistent)', figure: 6 },
  { numeral: '610', description: 'Downstream System', figure: 6 },
];

const BACKEND_ENFORCEMENT = [
  { 
    name: 'Sovereignty Gate (102)', 
    trigger: 'enforce_finalization_gate_trigger',
    table: 'transformation_artifacts',
    status: 'ACTIVE',
    description: 'Blocks finalization without human_decision = Approved'
  },
  { 
    name: 'Reasoning Ledger (200)', 
    trigger: 'enforce_reasoning_log_immutability_trigger',
    table: 'reasoning_logs',
    status: 'ACTIVE',
    description: 'Append-only: blocks UPDATE/DELETE on reasoning entries'
  },
  { 
    name: 'Forensic Purge (408)', 
    trigger: 'enforce_purge_audit_immutability_trigger',
    table: 'purge_audit_log',
    status: 'ACTIVE',
    description: 'Protects destruction certificates from tampering'
  },
];

const PatentArchive: React.FC = () => {
  const figureRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  const figures = [
    { component: PatentFigure1, title: 'FIG. 1 — Sovereignty Gate (Persistence Enforcement)' },
    { component: PatentFigure2, title: 'FIG. 2 — Trinity Reasoning Ledger + Intent Anchoring' },
    { component: PatentFigure3, title: 'FIG. 3 — JSON Canonicalization + Signature Validation' },
    { component: PatentFigure4, title: 'FIG. 4 — Forensic Purge Certifier' },
    { component: PatentFigure5, title: 'FIG. 5 — Composite / Swarm Governance' },
    { component: PatentFigure6, title: 'FIG. 6 — Violation Watermark Injection + Downstream Detection' },
  ];

  const getSvgFromRef = (index: number): SVGSVGElement | null => {
    const container = figureRefs.current[index];
    if (!container) return null;
    return container.querySelector('svg');
  };

  const svgToBlob = (svg: SVGSVGElement): Blob => {
    const svgData = new XMLSerializer().serializeToString(svg);
    return new Blob([svgData], { type: 'image/svg+xml' });
  };

  const downloadAllAsZip = async () => {
    setIsExporting(true);
    try {
      const zip = new JSZip();
      const figuresFolder = zip.folder('figures');

      for (let i = 0; i < figures.length; i++) {
        const svg = getSvgFromRef(i);
        if (svg && figuresFolder) {
          const svgBlob = svgToBlob(svg);
          figuresFolder.file(`FIG-${i + 1}.svg`, svgBlob);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'OneDuo-USPTO-Figures.zip';
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadCombinedPDF = async () => {
    setIsExporting(true);
    try {
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'in',
        format: 'letter'
      });

      for (let i = 0; i < figures.length; i++) {
        if (i > 0) pdf.addPage();
        
        const svg = getSvgFromRef(i);
        if (svg) {
          const svgClone = svg.cloneNode(true) as SVGSVGElement;
          const imgWidth = 9;
          const imgHeight = imgWidth * 0.75;
          const x = (11 - imgWidth) / 2;
          const y = (8.5 - imgHeight) / 2;

          await pdf.svg(svgClone, {
            x: x,
            y: y,
            width: imgWidth,
            height: imgHeight
          });
        }
      }

      pdf.save('OneDuo-USPTO-Combined-Figures.pdf');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white p-8">
      <NoIndexMeta />
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="border-b-2 border-black pb-4 mb-8">
          <h1 className="text-3xl font-serif text-black mb-1">
            OneDuo™ Provisional Filing Package
          </h1>
          <p className="text-sm text-gray-600 font-serif">
            DATABASE-ENFORCED HUMAN GOVERNANCE SYSTEM FOR AI-GENERATED ARTIFACTS
          </p>
          <p className="text-xs text-gray-500 mt-2 font-mono">
            Identity Nails LLC · Filing Date: 2026-01-03
          </p>
        </div>

        {/* Bulk Download Actions */}
        <div className="flex gap-4 mb-8">
          <Button 
            onClick={downloadAllAsZip} 
            disabled={isExporting}
            className="bg-black text-white hover:bg-gray-800"
          >
            <Package className="w-4 h-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Download All Figures (ZIP)'}
          </Button>
          <Button 
            onClick={downloadCombinedPDF} 
            disabled={isExporting}
            variant="outline"
          >
            <FileText className="w-4 h-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Download Combined PDF'}
          </Button>
        </div>

        {/* Backend Enforcement Status */}
        <section className="mb-10 p-6 border border-green-200 bg-green-50 rounded">
          <h2 className="text-lg font-serif text-black mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-green-600" />
            Backend Enforcement Status
          </h2>
          <div className="space-y-3">
            {BACKEND_ENFORCEMENT.map((item) => (
              <div key={item.trigger} className="flex items-center justify-between p-3 bg-white border border-green-100 rounded">
                <div>
                  <p className="font-mono text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-gray-600">{item.description}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Trigger: <code className="bg-gray-100 px-1 rounded">{item.trigger}</code> on <code className="bg-gray-100 px-1 rounded">{item.table}</code>
                  </p>
                </div>
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
        </section>

        {/* Document Inventory */}
        <section className="mb-10">
          <h2 className="text-lg font-serif text-black mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Document Inventory
          </h2>
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-serif">Document</th>
                  <th className="text-left p-3 font-serif">Category</th>
                  <th className="text-center p-3 font-serif">USPTO Bundle</th>
                </tr>
              </thead>
              <tbody>
                {FILING_DOCUMENTS.map((doc) => (
                  <tr key={doc.id} className={`border-t ${doc.category === 'INTERNAL ONLY' ? 'bg-amber-50' : ''}`}>
                    <td className="p-3 font-mono text-sm">
                      {doc.name}
                      {doc.category === 'INTERNAL ONLY' && (
                        <Badge variant="outline" className="ml-2 text-amber-700 border-amber-400">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          INTERNAL ONLY
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-gray-600">{doc.category}</td>
                    <td className="p-3 text-center">
                      {doc.includeInUSPTO ? (
                        <CheckCircle className="w-4 h-4 text-green-600 inline" />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reference Numeral Cross-Reference */}
        <section className="mb-10">
          <h2 className="text-lg font-serif text-black mb-4">
            Exhibit A — Reference Numeral Cross-Reference
          </h2>
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-serif w-24">Numeral</th>
                  <th className="text-left p-3 font-serif">Description</th>
                  <th className="text-center p-3 font-serif w-24">Figure</th>
                </tr>
              </thead>
              <tbody>
                {REFERENCE_NUMERALS.map((ref) => (
                  <tr key={ref.numeral} className="border-t">
                    <td className="p-3 font-mono font-bold">{ref.numeral}</td>
                    <td className="p-3">{ref.description}</td>
                    <td className="p-3 text-center font-mono">FIG. {ref.figure}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Figures Preview */}
        <section>
          <h2 className="text-lg font-serif text-black mb-4 flex items-center gap-2">
            USPTO Figures
          </h2>
          <div className="space-y-8">
            {figures.map((fig, index) => {
              const FigureComponent = fig.component;
              return (
                <div key={index} className="border border-gray-300 p-4">
                  <h3 className="text-sm font-serif text-black mb-3">{fig.title}</h3>
                  <div 
                    ref={el => figureRefs.current[index] = el}
                    className="border border-gray-200 bg-white"
                  >
                    <FigureComponent />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-gray-200 text-center text-xs text-gray-500">
          <p>OneDuo™ · Identity Nails LLC · Confidential — Do Not Distribute</p>
          <p className="mt-1">Patent Pending · Filing Date: 2026-01-03</p>
        </footer>
      </div>
    </div>
  );
};

export default PatentArchive;
