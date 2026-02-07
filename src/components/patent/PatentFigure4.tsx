import React from 'react';

/**
 * FIG. 4 — Forensic Purge Certifier
 * USPTO-style patent drawing with reference numerals
 */
export const PatentFigure4: React.FC = () => {
  return (
    <svg
      viewBox="0 0 800 600"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto bg-white"
      style={{ maxWidth: '800px' }}
    >
      {/* Title */}
      <text x="400" y="30" textAnchor="middle" fontSize="14" fontFamily="Times New Roman, serif">
        FIG. 4
      </text>

      {/* 400 - Source Material (top left) */}
      <rect x="80" y="80" width="160" height="80" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="95" y="105" fontSize="11" fontFamily="Times New Roman, serif">400</text>
      <text x="160" y="125" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">SOURCE</text>
      <text x="160" y="140" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">MATERIAL</text>

      {/* Arrow from 400 to 402 */}
      <line x1="240" y1="120" x2="300" y2="120" stroke="black" strokeWidth="1.5" />
      <polygon points="300,120 290,115 290,125" fill="black" />

      {/* 402 - Canonicalization Step */}
      <rect x="300" y="80" width="160" height="80" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="315" y="105" fontSize="11" fontFamily="Times New Roman, serif">402</text>
      <text x="380" y="125" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">CANONICALIZE</text>

      {/* Arrow from 402 to 404 */}
      <line x1="460" y1="120" x2="520" y2="120" stroke="black" strokeWidth="1.5" />
      <polygon points="520,120 510,115 510,125" fill="black" />

      {/* 404 - SHA-256 Fingerprint */}
      <rect x="520" y="80" width="180" height="80" fill="none" stroke="black" strokeWidth="2" />
      <text x="535" y="105" fontSize="11" fontFamily="Times New Roman, serif">404</text>
      <text x="610" y="125" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">CRYPTOGRAPHIC</text>
      <text x="610" y="140" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">FINGERPRINT</text>

      {/* Parallel paths from source */}
      {/* Path to 406 - Deletion */}
      <line x1="160" y1="160" x2="160" y2="280" stroke="black" strokeWidth="1.5" />
      <polygon points="160,280 155,270 165,270" fill="black" />

      {/* 406 - Deletion Event */}
      <rect x="80" y="280" width="160" height="80" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="95" y="305" fontSize="11" fontFamily="Times New Roman, serif">406</text>
      <text x="160" y="325" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">DELETION</text>
      <text x="160" y="340" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">EVENT</text>

      {/* Order indicator: fingerprint BEFORE delete */}
      <text x="440" y="190" textAnchor="middle" fontSize="9" fontFamily="Times New Roman, serif">1st</text>
      <text x="130" y="220" textAnchor="middle" fontSize="9" fontFamily="Times New Roman, serif">2nd</text>

      {/* Arrow from 404 to 408 */}
      <line x1="610" y1="160" x2="610" y2="220" stroke="black" strokeWidth="1.5" />
      <polygon points="610,220 605,210 615,210" fill="black" />

      {/* Arrow from 406 to 408 - enters from left side */}
      <line x1="240" y1="320" x2="380" y2="320" stroke="black" strokeWidth="1.5" />
      <polygon points="380,320 370,315 370,325" fill="black" />

      {/* 408 - Immutable Purge Audit Log */}
      <rect x="380" y="220" width="320" height="140" fill="none" stroke="black" strokeWidth="2.5" />
      <text x="395" y="245" fontSize="11" fontFamily="Times New Roman, serif">408</text>
      <text x="540" y="275" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">IMMUTABLE PURGE</text>
      <text x="540" y="290" textAnchor="middle" fontSize="10" fontFamily="Times New Roman, serif">AUDIT LOG</text>

      {/* Log entry lines - moved lower to avoid overlap */}
      <line x1="400" y1="310" x2="680" y2="310" stroke="black" strokeWidth="0.5" />
      <text x="410" y="328" fontSize="8" fontFamily="Times New Roman, serif">artifact_id | file_hash | purged_at</text>
      <line x1="400" y1="340" x2="680" y2="340" stroke="black" strokeWidth="0.5" />
      <text x="410" y="355" fontSize="8" fontFamily="Times New Roman, serif">[bound to artifact]</text>


      {/* Caption */}
      <text x="400" y="420" textAnchor="middle" fontSize="11" fontFamily="Times New Roman, serif" fontStyle="italic">
        FIG. 4 illustrates an embodiment of forensic purge certification with hash-before-delete.
      </text>

    </svg>
  );
};

export default PatentFigure4;
