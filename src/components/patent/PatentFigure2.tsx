import React from 'react';

/**
 * FIG. 2 — Trinity Reasoning Ledger + Intent Anchoring
 * USPTO-style patent drawing with reference numerals
 */
export const PatentFigure2: React.FC = () => {
  return (
    <svg
      viewBox="0 0 800 600"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto bg-white"
      style={{ maxWidth: '800px' }}
    >
      {/* Title */}
      <text x="400" y="30" textAnchor="middle" fontSize="14" fontFamily="Times New Roman, serif">
        FIG. 2
      </text>

      {/* 200 - Reasoning Ledger Container */}
      <rect x="50" y="60" width="700" height="420" fill="none" stroke="black" strokeWidth="2" />
      <text x="70" y="85" fontSize="12" fontFamily="Times New Roman, serif">200</text>

      {/* 206 - Intent Frame (3 FPS) - Left side */}
      <rect x="80" y="120" width="140" height="100" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="95" y="145" fontSize="11" fontFamily="Times New Roman, serif">206</text>
      <text x="150" y="170" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">INTENT</text>
      <text x="150" y="185" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">FRAME</text>
      <text x="150" y="205" textAnchor="middle" fontSize="9" fontFamily="Times New Roman, serif">(SAMPLED)</text>

      {/* Arrow from 206 to 204 */}
      <line x1="220" y1="170" x2="280" y2="170" stroke="black" strokeWidth="1.5" />
      <polygon points="280,170 270,165 270,175" fill="black" />

      {/* 204 - Confidence Score */}
      <rect x="280" y="130" width="120" height="80" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="295" y="155" fontSize="11" fontFamily="Times New Roman, serif">204</text>
      <text x="340" y="175" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">CONFIDENCE</text>
      <text x="340" y="190" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">SCORE</text>

      {/* Arrow from 204 to 202 */}
      <line x1="340" y1="210" x2="340" y2="260" stroke="black" strokeWidth="1.5" />
      <polygon points="340,260 335,250 345,250" fill="black" />

      {/* 202 - Reasoning Entry (main ledger rows) */}
      <rect x="100" y="260" width="500" height="40" fill="none" stroke="black" strokeWidth="1" />
      <text x="115" y="285" fontSize="11" fontFamily="Times New Roman, serif">202</text>
      <text x="350" y="285" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">REASONING ENTRY (APPEND-ONLY)</text>

      <rect x="100" y="300" width="500" height="40" fill="none" stroke="black" strokeWidth="1" />
      <text x="350" y="325" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">REASONING ENTRY</text>

      <rect x="100" y="340" width="500" height="40" fill="none" stroke="black" strokeWidth="1" />
      <text x="350" y="365" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">REASONING ENTRY</text>

      {/* Append-only indicator (downward arrows) */}
      <line x1="620" y1="280" x2="620" y2="360" stroke="black" strokeWidth="1" />
      <polygon points="620,360 615,350 625,350" fill="black" />
      <text x="640" y="320" fontSize="8" fontFamily="Times New Roman, serif" writingMode="vertical-rl">APPEND</text>

      {/* Arrow from 202 to 208 */}
      <line x1="350" y1="380" x2="350" y2="420" stroke="black" strokeWidth="1.5" />
      <polygon points="350,420 345,410 355,410" fill="black" />

      {/* 208 - Human Approval Record */}
      <rect x="250" y="420" width="200" height="50" fill="none" stroke="black" strokeWidth="2" />
      <text x="265" y="445" fontSize="11" fontFamily="Times New Roman, serif">208</text>
      <text x="350" y="450" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">HUMAN APPROVAL</text>


      {/* Causal chain indicator lines */}
      <line x1="150" y1="220" x2="150" y2="260" stroke="black" strokeWidth="1" strokeDasharray="4,2" />
      <line x1="150" y1="260" x2="100" y2="260" stroke="black" strokeWidth="1" strokeDasharray="4,2" />

      {/* Caption */}
      <text x="400" y="520" textAnchor="middle" fontSize="11" fontFamily="Times New Roman, serif" fontStyle="italic">
        FIG. 2 illustrates an embodiment of append-only reasoning ledger with intent anchoring.
      </text>
    </svg>
  );
};

export default PatentFigure2;
