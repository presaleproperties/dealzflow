#!/usr/bin/env node
/**
 * Dealzflow Branding Audit
 * ------------------------
 * Verifies that every brand slot (favicon, PWA, Apple touch, OG, splash,
 * in-app logos, manifest, meta tags) uses the unified house mark and the
 * correct "Dealzflow" wordmark.
 *
 * Run: node scripts/brand-audit.mjs
 * Exit code 0 = all checks pass, 1 = at least one failure.
 */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const BRAND = 'Dealzflow';

const results = [];
const pass = (slot, detail) => results.push({ ok: true, slot, detail });
const fail = (slot, detail) => results.push({ ok: false, slot, detail });

const sha = (p) => createHash('sha1').update(readFileSync(p)).digest('hex').slice(0, 10);
const exists = (p) => existsSync(resolve(ROOT, p));
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

// Image dimensions via ImageMagick (already available in repo env).
function dims(p) {
  try {
    const out = execSync(`identify -format "%w %h" "${resolve(ROOT, p)}"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const [w, h] = out.trim().split(/\s+/).map(Number);
    return { w, h };
  } catch {
    return null;
  }
}

// 1. Canonical icon source — every square slot must hash-match this file.
const CANONICAL = 'src/assets/logo-mark.png';
if (!exists(CANONICAL)) {
  fail('canonical-icon', `${CANONICAL} missing — no source of truth for the house mark`);
} else {
  const d = dims(CANONICAL);
  if (!d || d.w !== d.h) fail('canonical-icon', `${CANONICAL} is not square (${d?.w}x${d?.h})`);
  else if (d.w < 512) fail('canonical-icon', `${CANONICAL} is ${d.w}px — must be ≥512px`);
  else pass('canonical-icon', `${CANONICAL} ${d.w}x${d.h} sha=${sha(resolve(ROOT, CANONICAL))}`);
}
const canonicalHash = exists(CANONICAL) ? sha(resolve(ROOT, CANONICAL)) : null;

// 2. Square-icon slots — each must be derived from the canonical mark.
//    We require: square, expected min size, and (for the master files) hash parity.
const squareSlots = [
  { path: 'public/favicon.png',         min: 256, mustMatchCanonical: true  },
  { path: 'public/icon-512.png',        min: 512, mustMatchCanonical: true  },
  { path: 'public/icon-192.png',        min: 192, mustMatchCanonical: false },
  { path: 'public/favicon-32.png',      min: 32,  mustMatchCanonical: false },
  { path: 'public/apple-touch-icon.png',min: 180, mustMatchCanonical: false },
  { path: 'public/app-icon-1024.png',   min: 1024,mustMatchCanonical: false },
];
for (const slot of squareSlots) {
  if (!exists(slot.path)) { fail(slot.path, 'missing'); continue; }
  const d = dims(slot.path);
  if (!d) { fail(slot.path, 'unreadable'); continue; }
  if (d.w !== d.h) { fail(slot.path, `not square (${d.w}x${d.h})`); continue; }
  if (d.w < slot.min) { fail(slot.path, `too small (${d.w}px, need ≥${slot.min})`); continue; }
  if (slot.mustMatchCanonical && canonicalHash && sha(resolve(ROOT, slot.path)) !== canonicalHash) {
    fail(slot.path, `does NOT match canonical ${CANONICAL} — regenerate from house mark`);
    continue;
  }
  pass(slot.path, `${d.w}x${d.h}${slot.mustMatchCanonical ? ' (hash-parity ✓)' : ''}`);
}

// 3. OG / social share — landscape, contains the wordmark.
{
  const p = 'public/og-image.png';
  if (!exists(p)) fail(p, 'missing OG image');
  else {
    const d = dims(p);
    if (!d) fail(p, 'unreadable');
    else if (d.w / d.h < 1.5 || d.w / d.h > 2.1) fail(p, `wrong aspect ratio ${d.w}x${d.h} — expected ~1.91:1 (1200x630)`);
    else if (d.w < 1200) fail(p, `${d.w}px wide — recommend ≥1200`);
    else pass(p, `${d.w}x${d.h} landscape OG`);
  }
}

// 4. Splash screen.
{
  const p = 'public/splash-screen.png';
  if (!exists(p)) fail(p, 'missing PWA splash');
  else {
    const d = dims(p);
    pass(p, `${d.w}x${d.h}`);
  }
}

// 5. Manifest checks.
{
  const p = 'public/manifest.json';
  if (!exists(p)) fail(p, 'missing manifest');
  else {
    let m;
    try { m = JSON.parse(read(p)); } catch (e) { fail(p, `invalid JSON: ${e.message}`); m = null; }
    if (m) {
      if (m.name !== BRAND) fail(`${p} > name`, `expected "${BRAND}", got "${m.name}"`);
      else pass(`${p} > name`, `"${m.name}"`);

      if (m.short_name !== BRAND) fail(`${p} > short_name`, `expected "${BRAND}", got "${m.short_name}"`);
      else pass(`${p} > short_name`, `"${m.short_name}"`);

      if (m.start_url !== '/dashboard') fail(`${p} > start_url`, `expected "/dashboard", got "${m.start_url}"`);
      else pass(`${p} > start_url`, m.start_url);

      const has192 = m.icons?.some(i => i.sizes === '192x192');
      const has512 = m.icons?.some(i => i.sizes === '512x512');
      const hasMaskable = m.icons?.some(i => i.purpose?.includes('maskable'));
      if (!has192) fail(`${p} > icons`, 'missing 192x192 icon');
      if (!has512) fail(`${p} > icons`, 'missing 512x512 icon');
      if (!hasMaskable) fail(`${p} > icons`, 'missing maskable purpose');
      if (has192 && has512 && hasMaskable) pass(`${p} > icons`, 'all required sizes + maskable present');
    }
  }
}

// 6. index.html meta + favicon link checks.
{
  const p = 'index.html';
  if (!exists(p)) fail(p, 'missing');
  else {
    const html = read(p);
    const checks = [
      [/<title>[^<]*Dealzflow[^<]*<\/title>/i,                    '<title> contains Dealzflow'],
      [/apple-mobile-web-app-title"\s+content="Dealzflow"/i,       'apple-mobile-web-app-title = Dealzflow'],
      [/og:site_name"\s+content="Dealzflow"/i,                      'og:site_name = Dealzflow'],
      [/og:image"\s+content="[^"]*og-image\.png"/i,                 'og:image points to /og-image.png'],
      [/twitter:image"\s+content="[^"]*og-image\.png"/i,            'twitter:image points to /og-image.png'],
      [/<link[^>]+rel="icon"[^>]+href="\/favicon\.png/i,            'favicon.png linked'],
      [/<link[^>]+rel="apple-touch-icon"[^>]+href="\/icon-192\.png/i, 'apple-touch-icon linked'],
      [/<link[^>]+rel="manifest"[^>]+href="\/manifest\.json"/i,     'manifest.json linked'],
      [/\?v=\d+/,                                                   'favicon cache-bust query present'],
    ];
    for (const [re, label] of checks) {
      if (re.test(html)) pass(`${p}`, label);
      else fail(`${p}`, label);
    }
    // Forbidden legacy brand names that must NOT appear in head meta.
    for (const bad of ['CommissionIQ', 'commissioniq']) {
      if (new RegExp(`(og:|twitter:|<title>|apple-mobile-web-app-title)[^>]*${bad}`, 'i').test(html)) {
        fail(`${p}`, `legacy brand "${bad}" still referenced in meta tags`);
      }
    }
  }
}

// 7. In-app logo references — every one must resolve to logo-mark.png.
{
  let grep;
  try {
    grep = execSync(`rg -n "from ['\\\"]@/assets/[^'\\\"]+\\.(png|svg)['\\\"]" src --no-heading`, {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
  } catch { grep = ''; }
  const logoLines = grep.split('\n').filter(l => /logo|brand|icon|mark/i.test(l));
  const offenders = logoLines.filter(l => !/logo-mark\.png|dealzflow-logo\.png|dealzflow-icon\.png/.test(l));
  if (offenders.length === 0) pass('in-app logo imports', `${logoLines.length} brand imports — all use unified marks`);
  else for (const o of offenders) fail('in-app logo imports', `non-unified brand asset: ${o}`);
}

// 8. Forbidden legacy brand assets that should have been removed.
const stale = ['src/assets/commissioniq-logo.png', 'src/assets/old-logo.png'];
for (const s of stale) {
  if (exists(s)) fail(s, 'legacy logo file still in repo — delete it');
}

// ── Report ─────────────────────────────────────────────────────────────────
const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok);
console.log('\n🏠  Dealzflow Branding Audit\n' + '─'.repeat(60));
for (const r of results) {
  const icon = r.ok ? '✅' : '❌';
  console.log(`${icon} ${r.slot.padEnd(38)} ${r.detail}`);
}
console.log('─'.repeat(60));
console.log(`${passed}/${results.length} checks passed`);
if (failed.length) {
  console.log(`\n${failed.length} failure(s):`);
  for (const f of failed) console.log(`  • ${f.slot}: ${f.detail}`);
  process.exit(1);
}
console.log('\nAll brand slots use the unified house mark + Dealzflow wordmark. ✨');
