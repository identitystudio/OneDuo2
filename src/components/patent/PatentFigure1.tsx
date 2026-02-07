import React from 'react';

/**
 * FIG. 1 — Sovereignty Gate (Persistence Enforcement)
 * USPTO-style patent drawing with reference numerals
 */
export const PatentFigure1: React.FC = () => {
  return (
    <svg
      viewBox="0 0 800 600"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto bg-white"
      style={{ maxWidth: '800px' }}
    >
      {/* Title */}
      <text x="400" y="30" textAnchor="middle" fontSize="14" fontFamily="Times New Roman, serif">
        FIG. 1
      </text>

      {/* 100 - System Overview Box */}
      <rect x="50" y="60" width="700" height="480" fill="none" stroke="black" strokeWidth="2" />
      <text x="70" y="85" fontSize="12" fontFamily="Times New Roman, serif">100</text>

      {/* 104 - Artifact State Transition Path (left side) */}
      <rect x="100" y="120" width="180" height="80" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="115" y="145" fontSize="11" fontFamily="Times New Roman, serif">104</text>
      <text x="190" y="165" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">ARTIFACT</text>
      <text x="190" y="180" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">STATE</text>

      {/* Arrow from 104 to 106 */}
      <line x1="280" y1="160" x2="350" y2="160" stroke="black" strokeWidth="1.5" />
      <polygon points="350,160 340,155 340,165" fill="black" />

      {/* 106 - Trigger Enforcement Logic (diamond) */}
      <polygon points="450,160 400,200 450,240 500,200" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="450" y="205" textAnchor="middle" fontSize="11" fontFamily="Times New Roman, serif">106</text>

      {/* 102 - Sovereignty Gate (database constraint) - prominent center */}
      <rect x="350" y="280" width="200" height="100" fill="none" stroke="black" strokeWidth="2.5" />
      <text x="365" y="305" fontSize="11" fontFamily="Times New Roman, serif">102</text>
      <text x="450" y="330" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">SOVEREIGNTY</text>
      <text x="450" y="345" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">GATE</text>
      <text x="450" y="365" textAnchor="middle" fontSize="9" fontFamily="Times New Roman, serif">(BOOLEAN)</text>

      {/* Arrow from 106 to 102 */}
      <line x1="450" y1="240" x2="450" y2="280" stroke="black" strokeWidth="1.5" />
      <polygon points="450,280 445,270 455,270" fill="black" />

      {/* 108 - External Service Request (right side) */}
      <rect x="580" y="120" width="140" height="80" fill="none" stroke="black" strokeWidth="1.5" strokeDasharray="5,3" />
      <text x="595" y="145" fontSize="11" fontFamily="Times New Roman, serif">108</text>
      <text x="650" y="165" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">EXTERNAL</text>
      <text x="650" y="180" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">SERVICE</text>

      {/* Arrow from 102 to 108 with gate symbol */}
      <line x1="550" y1="330" x2="620" y2="330" stroke="black" strokeWidth="1.5" />
      <line x1="620" y1="330" x2="650" y2="200" stroke="black" strokeWidth="1.5" />
      <polygon points="650,200 645,210 655,210" fill="black" />

      {/* Gate symbol (blocked unless TRUE) */}
      <line x1="580" y1="310" x2="580" y2="350" stroke="black" strokeWidth="2" />
      <line x1="575" y1="320" x2="590" y2="320" stroke="black" strokeWidth="1" />
      <line x1="575" y1="340" x2="590" y2="340" stroke="black" strokeWidth="1" />

      {/* Database cylinder symbol near 102 */}
      <ellipse cx="320" cy="330" rx="25" ry="10" fill="none" stroke="black" strokeWidth="1" />
      <line x1="295" y1="330" x2="295" y2="360" stroke="black" strokeWidth="1" />
      <line x1="345" y1="330" x2="345" y2="360" stroke="black" strokeWidth="1" />
      <ellipse cx="320" cy="360" rx="25" ry="10" fill="none" stroke="black" strokeWidth="1" />

      {/* 110 - Finalized Artifact (bottom) */}
      <rect x="350" y="440" width="200" height="60" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="365" y="465" fontSize="11" fontFamily="Times New Roman, serif">110</text>
      <text x="450" y="468" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">FINALIZED</text>
      <text x="450" y="482" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">ARTIFACT</text>

      {/* Arrow from 102 to output */}
      <line x1="450" y1="380" x2="450" y2="440" stroke="black" strokeWidth="1.5" />
      <polygon points="450,440 445,430 455,430" fill="black" />

      {/* TRUE label on arrow */}
      <text x="465" y="410" fontSize="9" fontFamily="Times New Roman, serif">TRUE</text>

      {/* Caption */}
      <text x="400" y="570" textAnchor="middle" fontSize="11" fontFamily="Times New Roman, serif" fontStyle="italic">
        FIG. 1 illustrates an embodiment of database-enforced sovereignty gate.
      </text>
    </svg>
  );
};

export default PatentFigure1;
