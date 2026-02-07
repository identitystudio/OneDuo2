import React from 'react';

/**
 * FIG. 5 — Composite / Swarm Governance
 * USPTO-style patent drawing with reference numerals
 */
export const PatentFigure5: React.FC = () => {
  return (
    <svg
      viewBox="0 0 800 600"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto bg-white"
      style={{ maxWidth: '800px' }}
    >
      {/* Title */}
      <text x="400" y="30" textAnchor="middle" fontSize="14" fontFamily="Times New Roman, serif">
        FIG. 5
      </text>

      {/* 500 - Intermediate Artifact A (top left) */}
      <rect x="80" y="80" width="180" height="100" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="95" y="105" fontSize="11" fontFamily="Times New Roman, serif">500</text>
      <text x="170" y="130" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">INTERMEDIATE</text>
      <text x="170" y="145" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">ARTIFACT A</text>

      {/* 502 - Intermediate Artifact B (top right) */}
      <rect x="540" y="80" width="180" height="100" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="555" y="105" fontSize="11" fontFamily="Times New Roman, serif">502</text>
      <text x="630" y="130" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">INTERMEDIATE</text>
      <text x="630" y="145" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">ARTIFACT B</text>

      {/* Arrows converging to 504 */}
      <line x1="170" y1="180" x2="170" y2="240" stroke="black" strokeWidth="1.5" />
      <line x1="170" y1="240" x2="350" y2="280" stroke="black" strokeWidth="1.5" />

      <line x1="630" y1="180" x2="630" y2="240" stroke="black" strokeWidth="1.5" />
      <line x1="630" y1="240" x2="450" y2="280" stroke="black" strokeWidth="1.5" />

      {/* 504 - Composite Behavior */}
      <rect x="300" y="280" width="200" height="80" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="315" y="305" fontSize="11" fontFamily="Times New Roman, serif">504</text>
      <text x="400" y="325" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">COMPOSITE</text>
      <text x="400" y="340" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">BEHAVIOR</text>

      {/* Arrow to 506 */}
      <line x1="400" y1="360" x2="400" y2="400" stroke="black" strokeWidth="1.5" />
      <polygon points="400,400 395,390 405,390" fill="black" />

      {/* 506 - Sovereignty Gate Enforcement */}
      <rect x="280" y="400" width="240" height="80" fill="none" stroke="black" strokeWidth="2.5" />
      <text x="295" y="425" fontSize="11" fontFamily="Times New Roman, serif">506</text>
      <text x="400" y="445" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">SOVEREIGNTY GATE</text>
      <text x="400" y="460" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">ENFORCEMENT</text>

      {/* Gate symbol */}
      <line x1="500" y1="420" x2="500" y2="460" stroke="black" strokeWidth="2" />
      <line x1="495" y1="430" x2="510" y2="430" stroke="black" strokeWidth="1" />
      <line x1="495" y1="450" x2="510" y2="450" stroke="black" strokeWidth="1" />

      {/* Arrow to 508 */}
      <line x1="400" y1="480" x2="400" y2="520" stroke="black" strokeWidth="1.5" />
      <polygon points="400,520 395,510 405,510" fill="black" />
      <text x="420" y="500" fontSize="9" fontFamily="Times New Roman, serif">TRUE</text>

      {/* 508 - Governed Output */}
      <rect x="300" y="520" width="200" height="50" fill="none" stroke="black" strokeWidth="2" />
      <text x="315" y="542" fontSize="11" fontFamily="Times New Roman, serif">508</text>
      <text x="400" y="550" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">GOVERNED OUTPUT</text>

      {/* Additional intermediate artifacts (dotted to show extensibility) */}
      <rect x="310" y="80" width="180" height="100" fill="none" stroke="black" strokeWidth="1" strokeDasharray="5,3" />
      <text x="400" y="130" textAnchor="middle" fontSize="9" fontFamily="Times New Roman, serif">...</text>
      <text x="400" y="145" textAnchor="middle" fontSize="9" fontFamily="Times New Roman, serif">(N artifacts)</text>
      <line x1="400" y1="180" x2="400" y2="280" stroke="black" strokeWidth="1" strokeDasharray="5,3" />

      {/* Caption */}
      <text x="400" y="590" textAnchor="middle" fontSize="11" fontFamily="Times New Roman, serif" fontStyle="italic">
        FIG. 5 illustrates an embodiment of composite governance with multiple artifacts.
      </text>
    </svg>
  );
};

export default PatentFigure5;
