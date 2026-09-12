#!/usr/bin/env node
// skill-eval.mjs — progressive-disclosure evaluation for the `modern-cpp` skill.
//
// Deterministic, dependency-free. Measures the layered token budget, proves the
// split lost no verified fact (anchor coverage vs the frozen baseline), checks
// routing/link integrity, and mechanically verifies that each reference really
// is where its questions are answered.
//
//   node scripts/skill-eval.mjs            # markdown report
//   node scripts/skill-eval.mjs --json     # machine-readable report
//
// Exit code 1 when a HARD check fails (fact loss, dangling link, missing
// reference, orphan reference, failed content probe).

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Reuse the provider's own YAML implementation when it is installed, so the
// gate accepts exactly what discovery accepts. Fall back to a strict inline
// parser (block scalars and quoted/plain scalars) when it is not available.
const require0 = createRequire(import.meta.url);
let parseYaml;
try {
  ({ parse: parseYaml } = require0('yaml'));
} catch {
  parseYaml = (text) => {
    const out = {};
    for (const line of text.split('\n')) {
      if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
      const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!m) throw new Error(`unsupported frontmatter line: ${line.slice(0, 60)}`);
      const [, key, rawValue] = m;
      let value = rawValue.trim();
      if (value.startsWith('"')) {
        if (!value.endsWith('"') || value.length < 2)
          throw new Error(`unterminated quoted value for "${key}"`);
        value = value.slice(1, -1);
      } else if (value.startsWith("'")) {
        if (!value.endsWith("'") || value.length < 2)
          throw new Error(`unterminated quoted value for "${key}"`);
        value = value.slice(1, -1);
      } else if (/:\s/.test(value)) {
        // a plain scalar containing ": " is the classic invalid-YAML trap
        throw new Error(`Nested mappings are not allowed in compact mappings (key "${key}")`);
      }
      out[key] = value;
    }
    return out;
  };
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SKILL = join(ROOT, 'SKILL.md');
const REF_DIR = join(ROOT, 'references');
const BASELINE =
  process.env.SKILL_EVAL_BASELINE ??
  join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'skill-eval', 'modern-cpp', 'baseline', 'SKILL.md');
const JSON_OUT = process.argv.includes('--json');

// ── budgets ─────────────────────────────────────────────────────────────────
// Budgets are guardrails against silent bloat, not targets. Each is set a
// little above the measured size with headroom, and every raise must be
// justified in the commit — the point is to make growth a deliberate decision,
// never to force trimming a load-bearing instruction to fit a round number.
const BUDGET = {
  // L1 is loaded on every `skill` call. Baseline monolith was 62,617 B; this
  // keeps the always-loaded layer under ~21% of it.
  routerBytes: 13312,
  referenceBytes: 32768, // any single L2 file (largest is reflection-meta at ~28 KB)
  // L0 rides in the session catalog for EVERY session, loaded or not, so it is
  // the most expensive byte in the bundle. It must stay a routing summary.
  l0Bytes: 1024,
};

// ── token estimate ──────────────────────────────────────────────────────────
// No tokenizer is available offline; this is a labelled heuristic. CJK code
// points cost ~1.1 each, everything else ~1 token per 3.8 characters, which
// tracks BPE behaviour for mostly-English technical prose.
const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g;
function estTokens(text) {
  const cjk = (text.match(CJK) ?? []).length;
  const other = text.length - cjk;
  return Math.round(cjk * 1.1 + other / 3.8);
}
const bytes = (p) => (existsSync(p) ? statSync(p).size : 0);
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

// ── load bundle ─────────────────────────────────────────────────────────────
const routerText = read(SKILL);
const fmMatch = routerText.match(/^---\n([\s\S]*?)\n---\n/);
const frontmatter = fmMatch ? fmMatch[1] : '';
const routerBody = fmMatch ? routerText.slice(fmMatch[0].length) : routerText;

// Frontmatter must PARSE, not merely match the --- fences. The skill provider
// drops a skill whose YAML is invalid, and the model catalog then shows no
// diagnostic at all — the skill just silently disappears. A regex-only check
// misses that: an unquoted value containing ": " (easy to introduce when the
// text mentions flags like `-std=c++26: ...`) is invalid YAML while still
// looking perfectly fine. Parse it with the same YAML implementation the
// provider uses, so the gate fails exactly when discovery would.
const fmErrors = [];
let fmParsed = null;
if (!fmMatch) {
  fmErrors.push('no YAML frontmatter block (--- ... ---) at the top of SKILL.md');
} else {
  try {
    fmParsed = parseYaml(frontmatter);
  } catch (error) {
    fmErrors.push(`frontmatter is not valid YAML: ${error.message.split('\n')[0]}`);
  }
}
if (fmParsed) {
  const name = fmParsed.name;
  if (typeof name !== 'string') fmErrors.push('frontmatter "name" is missing or not a string');
  else {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name))
      fmErrors.push(`frontmatter "name" ${JSON.stringify(name)} is not kebab-case`);
    const dir = basename(ROOT);
    if (name !== dir)
      fmErrors.push(`frontmatter "name" (${name}) does not match the bundle directory (${dir})`);
  }
  if (typeof fmParsed.description !== 'string' || fmParsed.description.trim() === '')
    fmErrors.push('frontmatter "description" is missing or empty');
  if (fmParsed.whenToUse !== undefined && typeof fmParsed.whenToUse !== 'string')
    fmErrors.push('frontmatter "whenToUse" must be a string');
  for (const legacy of ['always-apply', 'alwaysApply', 'always_apply'])
    if (Object.hasOwn(fmParsed, legacy)) fmErrors.push(`frontmatter field "${legacy}" is unsupported`);
}

const refFiles = existsSync(REF_DIR)
  ? readdirSync(REF_DIR).filter((f) => f.endsWith('.md')).sort()
  : [];
const refs = Object.fromEntries(
  refFiles.map((f) => [`references/${f}`, { file: join(REF_DIR, f), text: read(join(REF_DIR, f)) }]),
);
const bundleText = [routerBody, ...Object.values(refs).map((r) => r.text)].join('\n');
const baselineText = read(BASELINE);

// ── anchors: every fact the old monolith carried ────────────────────────────
const norm = (s) => s.replace(/\s+/g, ' ').trim();
function extractAnchors(text) {
  const anchors = new Set();
  for (const m of text.matchAll(/^#{2,4} (.+)$/gm)) anchors.add('heading: ' + norm(m[1]));
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const a = norm(m[1]);
    // keep identifier-ish code spans; skip bare punctuation / short noise
    if (a.length >= 3 && /[A-Za-z0-9_]/.test(a) && !/^[-=+*/|<>{}()[\]]+$/.test(a)) anchors.add('code: ' + a);
  }
  return [...anchors];
}
const anchors = extractAnchors(baselineText);
// Anchors deliberately not carried over, each with a reason. Keeping this an
// explicit list means a *silent* loss can never hide behind "we rewrote it".
const INTENTIONAL_DROPS = new Map([
  // the bundle location is supplied by the harness <skill_resources> block,
  // so hard-coding the path in prose was redundant.
  ['code: ~/.dsh/skills/', 'location metadata provided by the harness'],
]);
const bundleNorm = norm(bundleText);
const inBundle = (a) => bundleNorm.includes(a.slice(a.indexOf(': ') + 2));
const missingAnchors = anchors.filter((a) => !inBundle(a) && !INTENTIONAL_DROPS.has(a));
const droppedAnchors = anchors.filter((a) => !inBundle(a) && INTENTIONAL_DROPS.has(a));

// ── routing probes ──────────────────────────────────────────────────────────
// Each probe: a real question, the reference that must answer it, and the
// distinctive terms that must actually be present there.
const PROBES = [
  {
    id: 'toolchain',
    question: 'How do I build C++26 modules with CMake, and what does import std; need?',
    expect: 'references/toolchain.md',
    route: 'Build, flags, CMake, modules, import std;',
    terms: ['-freflection', 'CMake', 'g++-16', 'import std'],
  },
  {
    id: 'headers',
    question: 'Which header declares std::generator / std::flat_map / stdc_* macros?',
    expect: 'references/stdlib-headers.md',
    route: 'Which <header> provides X?',
    terms: ['<flat_map>', '<generator>', '<text_encoding>', '<stdbit.h>'],
  },
  {
    id: 'api',
    question: 'Exact spelling for a runtime format string, and why runtime_format fails?',
    expect: 'references/stdlib-api.md',
    route: 'Exact signature/spelling of a standard API',
    terms: ['runtime_format', 'make_format_args', 'std::formatted_size', 'std::vformat'],
  },
  {
    id: 'reflection',
    question: 'Does unchecked() let me name a private nested type? Flatten derived members?',
    expect: 'references/reflection-meta.md',
    route: 'P2996 std::meta queries, access_context',
    terms: ['access_context::unchecked', 'variant_alternative', 'is_enumerable_type', 'subobjects_of'],
  },
  {
    id: 'codec',
    question: 'How does the annotation-driven reflection codec map varints and compare deeply?',
    expect: 'references/annotations-codec.md',
    route: 'annotations (P3394R4), reflection-driven codec',
    terms: ['field_no', 'varint', 'zigzag', 'deep_equal'],
  },
  {
    id: 'contracts',
    question: 'What symbol must a program link for contract_assert, and #embed rules?',
    // Inlined in the router by design: a 1 KB reference would cost a full tool
    // round trip, so the probe asserts the content is present in SKILL.md.
    expect: 'SKILL.md',
    route: 'Contracts (P2900), #embed (P1967)',
    terms: ['contract_assert', 'handle_contract_violation', '__cpp_pp_embed', 'contract_violation'],
  },
];

const routerMentions = (p) => routerBody.includes(p);
const candidates = [['SKILL.md', routerBody], ...Object.entries(refs).map(([k, v]) => [k, v.text])];
const probeResults = PROBES.map((p) => {
  const scores = candidates.map(([k, text]) => [k, p.terms.filter((t) => text.includes(t)).length]);
  scores.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const best = scores[0];
  const hit = best && best[0] === p.expect && best[1] >= Math.ceil(p.terms.length * 0.6);
  const inline = p.expect === 'SKILL.md';
  return {
    ...p,
    score: best ? best[1] : 0,
    ranked: scores,
    contentHit: Boolean(hit),
    // an inlined topic needs no routing: it is already in context
    routerHit: inline ? true : routerMentions(p.expect),
    inline,
    routeListed: routerBody.includes(p.route),
  };
});

// ── link / orphan integrity ─────────────────────────────────────────────────
const pathRefs = new Set();
for (const m of (routerBody + '\n' + Object.values(refs).map((r) => r.text).join('\n')).matchAll(
  /(?:^|[\s(`])((?:references|examples|scripts|docs)\/[A-Za-z0-9._/-]+)/g,
)) pathRefs.add(m[1]);
const dangling = [...pathRefs].filter((p) => !existsSync(join(ROOT, p)));
const orphans = Object.keys(refs).filter((p) => !routerMentions(p));

// ── duplication (informational) ─────────────────────────────────────────────
const dupAnchors = anchors
  .map((a) => {
    const body = a.slice(a.indexOf(': ') + 2);
    const where = [['SKILL.md', routerBody], ...Object.entries(refs).map(([k, v]) => [k, v.text])]
      .filter(([, t]) => t.includes(body))
      .map(([k]) => k);
    return { anchor: a, where };
  })
  .filter((d) => d.where.filter((w) => w.startsWith('references/')).length > 1);

// ── route cost model ────────────────────────────────────────────────────────
const ROUTES = [
  ['baseline (pre-split, always)', [BASELINE]],
  ['router only (L1)', [SKILL]],
  ['build / toolchain', [SKILL, join(REF_DIR, 'toolchain.md')]],
  ['header lookup', [SKILL, join(REF_DIR, 'stdlib-headers.md')]],
  ['API signature', [SKILL, join(REF_DIR, 'stdlib-api.md')]],
  ['reflection / meta', [SKILL, join(REF_DIR, 'reflection-meta.md')]],
  ['reflection codec', [SKILL, join(REF_DIR, 'reflection-meta.md'), join(REF_DIR, 'annotations-codec.md')]],
  ['contracts / #embed (inlined)', [SKILL]],
  ['everything (worst case)', [SKILL, ...Object.values(refs).map((r) => r.file)]],
].map(([name, files]) => {
  const b = files.reduce((s, f) => s + bytes(f), 0);
  const t = files.reduce((s, f) => s + estTokens(read(f)), 0);
  return { name, files: files.map((f) => f.replace(ROOT + '/', '')), bytes: b, tokens: t };
});

const baselineBytes = bytes(BASELINE);
const baselineTokens = estTokens(baselineText);

// ── hard checks ─────────────────────────────────────────────────────────────
const failures = [];
// frontmatter must parse as valid YAML with the required fields — an invalid
// file is dropped by discovery with no model-visible diagnostic, so the skill
// silently vanishes from the catalog. This is the highest-severity check.
failures.push(...fmErrors);
if (missingAnchors.length) failures.push(`${missingAnchors.length} baseline fact anchor(s) missing from the bundle`);
if (dangling.length) failures.push(`dangling path reference(s): ${dangling.join(', ')}`);
if (orphans.length) failures.push(`reference(s) not routed from SKILL.md: ${orphans.join(', ')}`);
for (const p of probeResults) {
  if (!p.contentHit) failures.push(`probe "${p.id}": content not found in ${p.expect}`);
  if (!p.routerHit) failures.push(`probe "${p.id}": SKILL.md does not route to ${p.expect}`);
}const l0Bytes = Buffer.byteLength(frontmatter, 'utf8');
if (bytes(SKILL) > BUDGET.routerBytes) failures.push(`router is ${bytes(SKILL)}B > budget ${BUDGET.routerBytes}B`);
if (l0Bytes > BUDGET.l0Bytes) failures.push(`frontmatter is ${l0Bytes}B > budget ${BUDGET.l0Bytes}B`);
if (bytes(BASELINE) === 0)
  failures.push(
    `baseline ${BASELINE} missing — cannot prove fact coverage (set SKILL_EVAL_BASELINE)`,
  );

const report = {
  generatedFor: 'modern-cpp skill',
  budgets: BUDGET,
  layers: {
    l0FrontmatterBytes: Buffer.byteLength(frontmatter, 'utf8'),
    l1RouterBytes: bytes(SKILL),
    l1RouterBodyBytes: Buffer.byteLength(routerBody, 'utf8'),
    l2: Object.entries(refs).map(([k, v]) => ({
      file: k,
      bytes: Buffer.byteLength(v.text, 'utf8'),
      tokens: estTokens(v.text),
    })),
    l2TotalBytes: Object.values(refs).reduce((s, r) => s + Buffer.byteLength(r.text, 'utf8'), 0),
  },
  tokens: { estimator: 'cjk*1.1 + other/3.8 (heuristic)', baseline: baselineTokens, router: estTokens(routerBody) },
  routes: ROUTES,
  factCoverage: {
    baselineAnchors: anchors.length,
    missing: missingAnchors,
    intentionalDrops: droppedAnchors.map((a) => ({ anchor: a, reason: INTENTIONAL_DROPS.get(a) })),
    coveragePct: +(((anchors.length - missingAnchors.length) / anchors.length) * 100).toFixed(2),
    multiFileAnchors: dupAnchors.length,
  },
  probes: probeResults,
  links: { referenced: [...pathRefs].sort(), dangling, orphans },
  failures,
  pass: failures.length === 0,
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
}

// ── markdown report ─────────────────────────────────────────────────────────
const pct = (a, b) => `${(((b - a) / b) * 100).toFixed(1)}%`;
const L = [];
L.push('# modern-cpp skill — progressive-disclosure evaluation', '');
L.push(`Result: **${report.pass ? 'PASS' : 'FAIL'}** — ${failures.length} hard failure(s)`, '');
L.push('## 1. Layered token budget', '');
L.push('| Layer | File | Bytes | ~Tokens |', '| --- | --- | ---: | ---: |');
L.push(
  `| L0 catalog (always) | frontmatter | ${report.layers.l0FrontmatterBytes} | ${estTokens(frontmatter)} |`,
);
L.push(`| L1 router (on skill load) | SKILL.md | ${bytes(SKILL)} | ${report.tokens.router} |`);
L.push(`| L1 baseline (pre-split) | ${BASELINE.replace(homedir(), '~')} | ${baselineBytes} | ${baselineTokens} |`);
for (const r of report.layers.l2) L.push(`| L2 on demand | ${r.file} | ${r.bytes} | ${r.tokens} |`);
L.push('');
L.push(
  `L1 reduction vs baseline: **${pct(bytes(SKILL), baselineBytes)}** bytes / ` +
    `**${pct(report.tokens.router, baselineTokens)}** tokens.`,
);
L.push('');
L.push('## 2. Per-task route cost', '');
L.push('| Route | Files loaded | Bytes | ~Tokens | vs baseline |', '| --- | --- | ---: | ---: | ---: |');
for (const r of ROUTES) {
  L.push(
    `| ${r.name} | ${r.files.length} | ${r.bytes} | ${r.tokens} | ${r.name.startsWith('baseline') ? '—' : pct(r.bytes, baselineBytes)} |`,
  );
}
L.push('');
L.push('## 3. Fact coverage vs frozen baseline', '');
L.push(
  `- anchors extracted from baseline: **${anchors.length}** (headings + inline-code facts)`,
);
L.push(`- missing from the new bundle: **${missingAnchors.length}** (coverage ${report.factCoverage.coveragePct}%)`);
L.push(`- anchors present in more than one reference file: ${report.factCoverage.multiFileAnchors}`);
if (missingAnchors.length) for (const a of missingAnchors) L.push(`  - MISSING: ${a}`);
for (const d of report.factCoverage.intentionalDrops) L.push(`  - intentional drop: ${d.anchor} — ${d.reason}`);
L.push('');
L.push('## 4. Routing probes', '');
L.push('| Probe | Expected reference | terms found | content | router |');
L.push('| --- | --- | ---: | --- | --- |');
for (const p of probeResults) {
  L.push(
    `| ${p.id} | ${p.inline ? '`SKILL.md` (inlined)' : p.expect} | ${p.score}/${p.terms.length} | ${p.contentHit ? '✅' : '❌'} | ${p.inline ? 'n/a' : p.routerHit ? '✅' : '❌'} |`,
  );
}
L.push('');
L.push('## 5. Link and orphan integrity', '');
L.push(`- distinct bundle paths referenced: ${report.links.referenced.length}`);
L.push(`- dangling: ${dangling.length ? dangling.join(', ') : 'none'}`);
L.push(`- orphan references: ${orphans.length ? orphans.join(', ') : 'none'}`);
L.push('');
L.push('## 6. Hard failures', '');
L.push(failures.length ? failures.map((f) => `- ❌ ${f}`).join('\n') : '- none ✅');
L.push('');
L.push('> Token figures are estimates from the labelled heuristic in the header;');
L.push('> no offline tokenizer is assumed. Byte counts are exact.');
console.log(L.join('\n'));
process.exit(report.pass ? 0 : 1);
