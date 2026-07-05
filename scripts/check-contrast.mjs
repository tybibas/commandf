#!/usr/bin/env node
/**
 * W0.5 Contrast Gate — WCAG 2.1 relative-luminance checker
 * Dependency-free. Hardcodes semantic text/surface pairings from DESIGN.md §2
 * for both light (default) and dark (.theme-quantifire) themes.
 * Exit 1 if any normal-text pairing < 4.5:1.
 */

// ── Primitive hex values (DESIGN.md §1) ──────────────────────────────────────
const P = {
  // Paper ramp
  paper0:   '#FFFFFF',
  paper50:  '#FEFDFA',
  paper100: '#F7F4F3',
  paper200: '#EFEBE4',
  paper300: '#E2DDD4',
  // Ink ramp
  ink900: '#282828',
  ink700: '#595959',
  ink500: '#6E6960',
  ink300: '#A49B8A',
  // Brand
  plum700:   '#2F1D34',
  plum500:   '#52345B',
  orange500: '#EB5E28',
  orange700: '#A8430F',
  orange400: '#F0764A',
  blue500:   '#2C5985',
  blue400:   '#32759A',  /* light theme only; dark overrides */
  blue400d:  '#4090BA',  /* dark theme lifted blue-400 */
  green500:  '#3D7D69',  /* darkened from #40826D for AA on paper-50 */
  green500d: '#52A086',  /* dark theme lifted green */
  // Dark ramp
  dark900:    '#0B0A0E',
  dark800:    '#121017',
  dark700:    '#1C1923',
  dark600:    '#191622',
  darkInk100: '#EAE8EC',
  darkInk300: '#A8A4B0',
  darkInk500: '#8D8899',
  // Error
  errorLight: '#C63D2F',
  errorDark:  '#E05748',
  // Structure ink
  white: '#FFFFFF',
};

// ── WCAG relative luminance ───────────────────────────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

function linearize(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── Pairings (label, text hex, surface hex) ───────────────────────────────────
// DESIGN.md §2: text-primary / text-secondary / text-muted on all 4 surfaces,
// both themes. Plus accent-ink, structure-ink, source, error/success/warning on paper.

const pairs = [
  // ── Light theme ──────────────────────────────────────────────────────────
  // text-primary (#282828) on surfaces
  ['LIGHT: text-primary on bg-primary (paper-50)',    P.ink900, P.paper50],
  ['LIGHT: text-primary on bg-secondary (paper-100)', P.ink900, P.paper100],
  ['LIGHT: text-primary on bg-tertiary (paper-200)',  P.ink900, P.paper200],
  ['LIGHT: text-primary on bg-elevated (paper-0)',    P.ink900, P.paper0],
  // text-secondary (#595959)
  ['LIGHT: text-secondary on bg-primary',    P.ink700, P.paper50],
  ['LIGHT: text-secondary on bg-secondary',  P.ink700, P.paper100],
  ['LIGHT: text-secondary on bg-tertiary',   P.ink700, P.paper200],
  ['LIGHT: text-secondary on bg-elevated',   P.ink700, P.paper0],
  // text-muted (#6E6960) — must hit 4.5:1 on worst surface (paper-200 is darkest bg)
  ['LIGHT: text-muted on bg-primary',    P.ink500, P.paper50],
  ['LIGHT: text-muted on bg-secondary',  P.ink500, P.paper100],
  ['LIGHT: text-muted on bg-tertiary (worst surface)', P.ink500, P.paper200],
  ['LIGHT: text-muted on bg-elevated',   P.ink500, P.paper0],
  // accent-ink (#A8430F) — orange as text on paper surfaces
  ['LIGHT: accent-ink on bg-primary',   P.orange700, P.paper50],
  ['LIGHT: accent-ink on bg-secondary', P.orange700, P.paper100],
  ['LIGHT: accent-ink on bg-elevated',  P.orange700, P.paper0],
  // structure-ink (white) on structure fill (plum-700)
  ['LIGHT: structure-ink on structure (plum-700)', P.white, P.plum700],
  // source (#2C5985) on paper — citation text
  ['LIGHT: source on bg-primary',  P.blue500, P.paper50],
  ['LIGHT: source on bg-elevated', P.blue500, P.paper0],
  // error on paper
  ['LIGHT: error on bg-primary',  P.errorLight, P.paper50],
  ['LIGHT: error on bg-elevated', P.errorLight, P.paper0],
  // success (#3D7D69 adjusted) on paper
  ['LIGHT: success on bg-primary',  P.green500, P.paper50],
  ['LIGHT: success on bg-elevated', P.green500, P.paper0],
  // warning = accent-ink (#A8430F) on paper
  ['LIGHT: warning on bg-primary',  P.orange700, P.paper50],

  // ── Dark theme (.theme-quantifire) ───────────────────────────────────────
  // text-primary (dark-ink-100 #EAE8EC)
  ['DARK: text-primary on bg-primary (dark-900)',    P.darkInk100, P.dark900],
  ['DARK: text-primary on bg-secondary (dark-800)',  P.darkInk100, P.dark800],
  ['DARK: text-primary on bg-tertiary (dark-700)',   P.darkInk100, P.dark700],
  ['DARK: text-primary on bg-elevated (dark-600)',   P.darkInk100, P.dark600],
  // text-secondary (dark-ink-300 #A8A4B0)
  ['DARK: text-secondary on bg-primary',    P.darkInk300, P.dark900],
  ['DARK: text-secondary on bg-secondary',  P.darkInk300, P.dark800],
  ['DARK: text-secondary on bg-tertiary',   P.darkInk300, P.dark700],
  ['DARK: text-secondary on bg-elevated',   P.darkInk300, P.dark600],
  // text-muted (dark-ink-500 #8D8899) — must hit 4.5:1 on dark-800 (worst)
  ['DARK: text-muted on bg-primary',   P.darkInk500, P.dark900],
  ['DARK: text-muted on bg-secondary (dark-800, worst)', P.darkInk500, P.dark800],
  ['DARK: text-muted on bg-tertiary',  P.darkInk500, P.dark700],
  ['DARK: text-muted on bg-elevated',  P.darkInk500, P.dark600],
  // accent-ink = orange-400 (#F0764A) on dark surfaces
  ['DARK: accent-ink (orange-400) on bg-primary',   P.orange400, P.dark900],
  ['DARK: accent-ink (orange-400) on bg-secondary', P.orange400, P.dark800],
  ['DARK: accent-ink (orange-400) on bg-elevated',  P.orange400, P.dark600],
  // structure-ink (white) on structure fill (plum-500)
  ['DARK: structure-ink on structure (plum-500)', P.white, P.plum500],
  // source (blue-400d #4090BA — dark-lifted) on dark bg
  ['DARK: source on bg-primary',  P.blue400d, P.dark900],
  ['DARK: source on bg-secondary', P.blue400d, P.dark800],
  // error dark on bg
  ['DARK: error on bg-primary',   P.errorDark, P.dark900],
  ['DARK: error on bg-secondary', P.errorDark, P.dark800],
  // success (green500d #52A086 — dark-lifted) on dark bg
  ['DARK: success on bg-primary',  P.green500d, P.dark900],
  ['DARK: success on bg-secondary', P.green500d, P.dark800],
];

// ── Run checks ───────────────────────────────────────────────────────────────
const NORMAL_TEXT_THRESHOLD = 4.5;
let failures = 0;
const rows = [];

const colW = 60;
const hdr = `${'Pairing'.padEnd(colW)} ${'Ratio'.padStart(6)}  Status`;
console.log('\nWave 0 Contrast Gate — WCAG 2.1 (4.5:1 normal text)\n');
console.log(hdr);
console.log('─'.repeat(hdr.length));

for (const [label, fg, bg] of pairs) {
  const ratio = contrast(fg, bg);
  const pass  = ratio >= NORMAL_TEXT_THRESHOLD;
  const status = pass ? 'PASS' : 'FAIL';
  if (!pass) failures++;
  const ratioStr = ratio.toFixed(2) + ':1';
  rows.push({ label, fg, bg, ratio, pass });
  console.log(`${label.slice(0, colW).padEnd(colW)} ${ratioStr.padStart(8)}  ${status}`);
}

console.log('\n' + '─'.repeat(hdr.length));
console.log(`\nResult: ${pairs.length - failures}/${pairs.length} passed.`);
if (failures > 0) {
  console.log(`\nFAILED ${failures} pairing(s) — adjust primitive values until all reach 4.5:1.\n`);
  process.exit(1);
} else {
  console.log('\nAll pairings PASS 4.5:1. Wave 0 contrast gate GREEN.\n');

  // ── Emit ratio table for DESIGN.md §4 ─────────────────────────────────────
  console.log('--- DESIGN.md §4 Contrast table (append) ---\n');
  console.log('| Pairing | Foreground | Background | Ratio | Result |');
  console.log('|---|---|---|---|---|');
  for (const { label, fg, bg, ratio, pass } of rows) {
    const r = ratio.toFixed(2) + ':1';
    console.log(`| ${label} | \`${fg}\` | \`${bg}\` | ${r} | ${pass ? 'PASS' : 'FAIL'} |`);
  }
}
