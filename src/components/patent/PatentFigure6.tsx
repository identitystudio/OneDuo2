import React from 'react';

/**
 * FIG. 6 — Violation Watermark Injection and Downstream Detection
 * USPTO-style patent drawing with reference numerals
 */
export const PatentFigure6: React.FC = () => {
  return (
    <svg
      viewBox="0 0 800 650"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto bg-white"
      style={{ maxWidth: '800px' }}
    >
      {/* Title */}
      <text x="400" y="30" textAnchor="middle" fontSize="14" fontFamily="Times New Roman, serif">
        FIG. 6
      </text>

      {/* 600 - Violation Watermark System Container */}
      <rect x="50" y="50" width="700" height="540" fill="none" stroke="black" strokeWidth="2" />
      <text x="70" y="75" fontSize="12" fontFamily="Times New Roman, serif">600</text>

      {/* 108 - External Service (Unauthorized Attempt) */}
      <rect x="80" y="100" width="140" height="70" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="95" y="125" fontSize="11" fontFamily="Times New Roman, serif">108</text>
      <text x="150" y="140" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">EXTERNAL</text>
      <text x="150" y="155" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">SERVICE</text>

      {/* Arrow from 108 to 102 */}
      <line x1="220" y1="135" x2="280" y2="135" stroke="black" strokeWidth="1.5" />
      <polygon points="280,135 270,130 270,140" fill="black" />
      <text x="250" y="125" textAnchor="middle" fontSize="8" fontFamily="Times New Roman, serif">FORCE</text>
      <text x="250" y="115" textAnchor="middle" fontSize="8" fontFamily="Times New Roman, serif">TRANSITION</text>

      {/* 102 - Sovereignty Gate (Decision Diamond) */}
      <polygon points="380,100 450,135 380,170 310,135" fill="none" stroke="black" strokeWidth="2" />
      <text x="325" y="115" fontSize="11" fontFamily="Times New Roman, serif">102</text>
      <text x="380" y="132" textAnchor="middle" fontSize="9" fontFamily="Times New Roman, serif">SOVEREIGNTY</text>
      <text x="380" y="145" textAnchor="middle" fontSize="9" fontFamily="Times New Roman, serif">GATE</text>

      {/* 106 - Approval Conditions Check */}
      <line x1="380" y1="100" x2="380" y2="70" stroke="black" strokeWidth="1" strokeDasharray="3,2" />
      <text x="420" y="80" fontSize="8" fontFamily="Times New Roman, serif">106 VERIFY</text>
      <text x="420" y="90" fontSize="8" fontFamily="Times New Roman, serif">APPROVAL</text>

      {/* Arrow from 102 to 602 (FAIL path) */}
      <line x1="450" y1="135" x2="520" y2="135" stroke="black" strokeWidth="1.5" />
      <polygon points="520,135 510,130 510,140" fill="black" />
      <text x="485" y="125" textAnchor="middle" fontSize="8" fontFamily="Times New Roman, serif">FAIL</text>

      {/* 602 - Watermark Injection Module */}
      <rect x="520" y="100" width="160" height="70" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="535" y="125" fontSize="11" fontFamily="Times New Roman, serif">602</text>
      <text x="600" y="135" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">WATERMARK</text>
      <text x="600" y="150" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">INJECTION MODULE</text>

      {/* Arrow from 602 to 604 */}
      <line x1="600" y1="170" x2="600" y2="220" stroke="black" strokeWidth="1.5" />
      <polygon points="600,220 595,210 605,210" fill="black" />
      <text x="620" y="195" fontSize="8" fontFamily="Times New Roman, serif">COMPUTE</text>

      {/* 604 - Violation Signature */}
      <rect x="520" y="220" width="160" height="70" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="535" y="245" fontSize="11" fontFamily="Times New Roman, serif">604</text>
      <text x="600" y="255" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">VIOLATION</text>
      <text x="600" y="270" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">SIGNATURE</text>

      {/* Signature binding details */}
      <text x="600" y="285" textAnchor="middle" fontSize="7" fontFamily="Times New Roman, serif">(ID + TIMESTAMP + BREACH TYPE)</text>

      {/* Arrow from 604 to 606 */}
      <line x1="600" y1="290" x2="600" y2="330" stroke="black" strokeWidth="1.5" />
      <polygon points="600,330 595,320 605,320" fill="black" />
      <text x="620" y="310" fontSize="8" fontFamily="Times New Roman, serif">INJECT</text>

      {/* 606 - Artifact Metadata Field */}
      <rect x="520" y="330" width="160" height="60" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="535" y="355" fontSize="11" fontFamily="Times New Roman, serif">606</text>
      <text x="600" y="360" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">ARTIFACT METADATA</text>
      <text x="600" y="375" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">FIELD</text>

      {/* Arrow from 606 to 608 */}
      <line x1="600" y1="390" x2="600" y2="430" stroke="black" strokeWidth="1.5" />
      <polygon points="600,430 595,420 605,420" fill="black" />
      <text x="620" y="410" fontSize="8" fontFamily="Times New Roman, serif">PERSIST</text>

      {/* 608 - Violation Watermark (Persistent) - emphasized box */}
      <rect x="520" y="430" width="160" height="60" fill="none" stroke="black" strokeWidth="2.5" />
      <text x="535" y="455" fontSize="11" fontFamily="Times New Roman, serif">608</text>
      <text x="600" y="460" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">VIOLATION</text>
      <text x="600" y="475" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">WATERMARK</text>

      {/* BLOCK indicator */}
      <rect x="350" y="200" width="100" height="40" fill="none" stroke="black" strokeWidth="2" />
      <text x="400" y="225" textAnchor="middle" fontSize="11" fontFamily="Times New Roman, serif" fontWeight="bold">BLOCK</text>
      
      {/* Arrow from 606 area to BLOCK */}
      <line x1="520" y1="360" x2="450" y2="220" stroke="black" strokeWidth="1" strokeDasharray="4,2" />

      {/* Transaction Rollback X symbol */}
      <line x1="385" y1="250" x2="415" y2="280" stroke="black" strokeWidth="2" />
      <line x1="415" y1="250" x2="385" y2="280" stroke="black" strokeWidth="2" />
      <text x="400" y="300" textAnchor="middle" fontSize="8" fontFamily="Times New Roman, serif">TRANSACTION</text>
      <text x="400" y="310" textAnchor="middle" fontSize="8" fontFamily="Times New Roman, serif">ROLLBACK</text>

      {/* Arrow from 608 to 610 */}
      <line x1="600" y1="490" x2="600" y2="520" stroke="black" strokeWidth="1.5" />
      <line x1="600" y1="520" x2="400" y2="520" stroke="black" strokeWidth="1.5" />
      <line x1="400" y1="520" x2="400" y2="540" stroke="black" strokeWidth="1.5" />
      <polygon points="400,540 395,530 405,530" fill="black" />
      <text x="500" y="510" textAnchor="middle" fontSize="8" fontFamily="Times New Roman, serif">DETECT</text>

      {/* 610 - Downstream System */}
      <rect x="320" y="540" width="160" height="40" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="335" y="560" fontSize="11" fontFamily="Times New Roman, serif">610</text>
      <text x="400" y="565" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">DOWNSTREAM SYSTEM</text>

      {/* REJECT arrow from 610 */}
      <line x1="480" y1="560" x2="560" y2="560" stroke="black" strokeWidth="1.5" />
      <polygon points="560,560 550,555 550,565" fill="black" />
      <text x="600" y="565" fontSize="10" fontFamily="Times New Roman, serif" fontWeight="bold">REJECT</text>

      {/* Caption */}
      <text x="400" y="610" textAnchor="middle" fontSize="11" fontFamily="Times New Roman, serif" fontStyle="italic">
        FIG. 6 illustrates an embodiment of violation watermark injection and downstream detection.
      </text>
    </svg>
  );
};

export default PatentFigure6;
