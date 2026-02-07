/**
 * jsPDF (built-in fonts) is not fully Unicode-safe. Certain characters (smart quotes,
 * em-dashes, zero-width spaces, non-breaking spaces) can cause encoding issues.
 *
 * We sanitize text to a conservative ASCII subset to prevent PDF generation crashes.
 */

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

export function sanitizePdfText(input: unknown): string {
  if (input === null || input === undefined) return '';
  let s = String(input);

  for (const [re, v] of REPLACEMENTS) s = s.replace(re, v);

  // Keep printable ASCII + newlines/tabs. Drop everything else.
  s = s.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
  // Remove any remaining nulls
  s = s.replace(/\u0000/g, '');

  return s;
}
