import React from 'react';

/**
 * FIG. 3 — JSON Canonicalization + Signature Validation
 * USPTO-style patent drawing with reference numerals
 */
export const PatentFigure3: React.FC = () => {
  return (
    <svg
      viewBox="0 0 800 600"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto bg-white"
      style={{ maxWidth: '800px' }}
    >
      {/* Title */}
      <text x="400" y="30" textAnchor="middle" fontSize="14" fontFamily="Times New Roman, serif">
        FIG. 3
      </text>

      {/* 300 - External Request Payload (top) */}
      <rect x="300" y="60" width="200" height="70" fill="none" stroke="black" strokeWidth="1.5" strokeDasharray="5,3" />
      <text x="315" y="85" fontSize="11" fontFamily="Times New Roman, serif">300</text>
      <text x="400" y="100" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">EXTERNAL</text>
      <text x="400" y="115" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">REQUEST PAYLOAD</text>

      {/* Arrow from 300 to 302 */}
      <line x1="400" y1="130" x2="400" y2="180" stroke="black" strokeWidth="1.5" />
      <polygon points="400,180 395,170 405,170" fill="black" />

      {/* 302 - Canonicalization Module */}
      <rect x="300" y="180" width="200" height="70" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="315" y="205" fontSize="11" fontFamily="Times New Roman, serif">302</text>
      <text x="400" y="220" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">CANONICALIZATION</text>
      <text x="400" y="235" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">MODULE</text>

      {/* Arrow from 302 to 304 */}
      <line x1="400" y1="250" x2="400" y2="300" stroke="black" strokeWidth="1.5" />
      <polygon points="400,300 395,290 405,290" fill="black" />

      {/* 304 - Signature Verification (diamond decision) */}
      <polygon points="400,300 320,360 400,420 480,360" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="365" y="345" fontSize="11" fontFamily="Times New Roman, serif">304</text>
      <text x="400" y="365" textAnchor="middle" fontSize="9" fontFamily="Times New Roman, serif">SIGNATURE</text>
      <text x="400" y="378" textAnchor="middle" fontSize="9" fontFamily="Times New Roman, serif">VERIFY</text>

      {/* 306 - Rejected Mutated Payload (left branch - FAIL) */}
      <line x1="320" y1="360" x2="150" y2="360" stroke="black" strokeWidth="1.5" />
      <polygon points="150,360 160,355 160,365" fill="black" />
      <text x="235" y="350" fontSize="9" fontFamily="Times New Roman, serif">FAIL</text>

      <rect x="50" y="330" width="100" height="60" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="65" y="350" fontSize="11" fontFamily="Times New Roman, serif">306</text>
      <text x="100" y="365" textAnchor="middle" fontSize="9" fontFamily="Times New Roman, serif">REJECTED</text>
      <text x="100" y="378" textAnchor="middle" fontSize="9" fontFamily="Times New Roman, serif">PAYLOAD</text>


      {/* 308 - Approved Canonical Payload (right branch - PASS) */}
      <line x1="480" y1="360" x2="600" y2="360" stroke="black" strokeWidth="1.5" />
      <polygon points="600,360 590,355 590,365" fill="black" />
      <text x="540" y="350" fontSize="9" fontFamily="Times New Roman, serif">PASS</text>

      <rect x="600" y="320" width="140" height="80" fill="none" stroke="black" strokeWidth="2" />
      <text x="615" y="345" fontSize="11" fontFamily="Times New Roman, serif">308</text>
      <text x="670" y="365" textAnchor="middle" fontSize="9" fontFamily="Times New Roman, serif">CANONICAL</text>
      <text x="670" y="380" textAnchor="middle" fontSize="9" fontFamily="Times New Roman, serif">JSON</text>

      {/* Database write from 308 */}
      <line x1="670" y1="400" x2="670" y2="470" stroke="black" strokeWidth="1.5" />
      <polygon points="670,470 665,460 675,460" fill="black" />

      {/* Database cylinder */}
      <ellipse cx="670" cy="485" rx="40" ry="12" fill="none" stroke="black" strokeWidth="1.5" />
      <line x1="630" y1="485" x2="630" y2="535" stroke="black" strokeWidth="1.5" />
      <line x1="710" y1="485" x2="710" y2="535" stroke="black" strokeWidth="1.5" />
      <ellipse cx="670" cy="535" rx="40" ry="12" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="670" y="518" textAnchor="middle" fontSize="9" fontFamily="Times New Roman, serif">DB</text>

      {/* Caption */}
      <text x="400" y="580" textAnchor="middle" fontSize="11" fontFamily="Times New Roman, serif" fontStyle="italic">
        FIG. 3 illustrates an embodiment of JSON canonicalization and signature validation.
      </text>
    </svg>
  );
};

export default PatentFigure3;
