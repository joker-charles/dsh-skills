# `modern-cpp` — progressive-disclosure optimization and effectiveness evaluation

**Date:** 2026-09-12 · **Toolchain:** g++-16 **16.2.0** (Ubuntu) / libstdc++ 16,
node v24.18.0 · **Scope:** the user-global skill at `~/.dsh/skills/modern-cpp`.

This document records (a) the restructure from a single monolithic `SKILL.md`
into a router + on-demand references, and (b) the evaluation that the
restructure kept the skill effective — no fact lost, routing still correct,
the bundled demo still building.

Reproduce everything with:

```sh
cd ~/.dsh/skills/modern-cpp
node scripts/skill-eval.mjs          # markdown report, exit 1 on any hard failure
node scripts/skill-eval.mjs --json   # machine-readable
```

**This report and the baseline live outside the skill bundle**, at
`$DSH_HOME/skill-eval/modern-cpp/` (`REPORT.md`, `baseline/SKILL.md`). They are
measurement inputs for humans and CI, not instructions for the model, so they
stay off the model's load path — anything under `references/` would be pulled
into the retrieval surface, and a *stale* evaluation report is worse than none.
`scripts/skill-eval.mjs` reads the baseline from there; `SKILL_EVAL_BASELINE`
overrides the path when the bundle is checked out elsewhere (e.g. a Git repo
with its own `eval/` directory).

The pre-split monolith is frozen at `baseline/SKILL.md`; it is the oracle
for the fact-coverage check and must not be edited.

---

## 1. What changed

**Before.** One 62,617-byte `SKILL.md` (1,060 lines) carrying six unrelated
topic areas — toolchain/build, header map, API signatures, `std::meta`
reflection, annotations/codec, contracts/`#embed`. Every `skill` load pulled
all of it (~16.5k estimated tokens) into context regardless of the task, so a
question about `std::expected` paid for the whole reflection index and vice
versa. There was no on-demand layer and no way to measure any of it.

**After.** `SKILL.md` is a router; verified detail lives in five reference
files read on demand. The split itself was a mechanical, verbatim extraction
of the old line ranges, so relocating facts could not silently rewrite them.
Contracts/`#embed` were initially split out too, then merged back into the
router (finding F6): at 1,095 B the file cost a full tool round trip to read.

| Layer | File | Bytes | Loaded |
| --- | --- | ---: | --- |
| L0 catalog | frontmatter of `SKILL.md` | 688 | every session (advertisement) |
| L1 router | `SKILL.md` | 10,620 | on `skill` load |
| L1 (inlined) | contracts (P2900) + `#embed` (P1967) | ~1,100 of the above | with the router — no round trip |
| L2 | `references/toolchain.md` | 9,481 | on demand |
| L2 | `references/stdlib-headers.md` | 7,904 | on demand |
| L2 | `references/stdlib-api.md` | 7,787 | on demand |
| L2 | `references/reflection-meta.md` | 26,853 | on demand |
| L2 | `references/annotations-codec.md` | 6,799 | on demand |

The router keeps what must be in context unconditionally: the six anti-waste
rules, the routing table, the short toolchain/build recipe, the
error→cause→fix triage table, the trust boundary, and the two topics too small
to justify a round trip.

## 2. Findings

| # | Finding | Disposition |
| --- | --- | --- |
| F1 | Skill was a 62.6 KB monolith loaded in full on every load. | Split into router + references; verbatim extraction. |
| F2 | One heading (`## Reference implementations`) was initially dropped in the router rewrite. | Caught by the automated anchor check, restored — coverage then 100%. |
| F3 | The coverage checker compared raw text against whitespace-normalised anchors, reporting 13 false "missing" headings. | Checker fixed (normalise both sides); false positives gone. |
| F4 | Recorded verification toolchain was g++-16 **16.1.0**; the installed binary is now **16.2.0**. | Trust boundary now states the same-major rule explicitly instead of implying an exact-version lock. |
| F5 | The demo README still pointed at the old "Reflection-driven serialization" section name. | Repointed to `references/annotations-codec.md`. |
| F6 | Over-fragmentation: `references/contracts-embed.md` was 1,095 B, so reading it cost a full tool round trip. | Merged into the router (still under the 12 KB budget); the probe now asserts the content is inlined. |
| F7 | The report (~10 KB) and the frozen baseline (62.6 KB, **stale content**) sat inside the bundle, where any whole-bundle search can surface them as evidence. | Both moved outside the bundle to `$DSH_HOME/skill-eval/modern-cpp/`; the script reads the baseline from there (`SKILL_EVAL_BASELINE` overrides). |
| F8 | **Bundle gap**: `define_static_array` was documented only for `template for` plumbing; the "collect the names in a helper and return the vector" shape — which fails two ways on GCC 16.2.0 — was absent. | Found by a probe *not* constrained by the skill (see §6). `references/reflection-meta.md` now documents both failure messages and a verbatim-compiled fix. |
| F9 | The "do NOT re-verify" rule suppressed *useful* reproduction as well as wasted re-derivation. | Rewritten as **lookup vs derivation**: still no re-deriving settled facts, but an empirical check that answers the agent's own question (reproducing a failure, compiling the construct about to ship) is explicitly sanctioned. |

## 3. Evaluation results

### 3.1 Context budget (progressive disclosure achieved)

| Metric | Baseline | Router | Change |
| --- | ---: | ---: | ---: |
| Always-loaded L1 bytes | 62,617 | 10,620 | **−83.0 %** |
| Always-loaded L1 est. tokens | 16,468 | 2,618 | **−84.1 %** |

Typical per-task route cost (router + the selected reference(s)):

| Route | Files | Bytes | vs baseline |
| --- | ---: | ---: | ---: |
| router only (no reference read) | 1 | 10,620 | −83.0 % |
| build / toolchain | 2 | 20,101 | −67.9 % |
| header lookup | 2 | 18,524 | −70.4 % |
| API signature | 2 | 18,407 | −70.6 % |
| reflection / `std::meta` | 2 | 37,473 | −40.2 % |
| reflection codec | 3 | 44,272 | −29.3 % |
| contracts / `#embed` (inlined) | 1 | 10,620 | −83.0 % |
| *worst case (reads everything)* | 6 | 69,444 | **+10.9 %** |

The worst case is the only regression: an agent that ignores the routing table
and reads every reference pays ~6.6 KB more than the old monolith (the
router's duplicated triage table plus the per-file headers). That is the
intended trade — the worst case is rare, and every realistic route is 29–83 %
smaller. The contracts/`#embed` row is the payoff of F6: the same bytes as the
bare router, because a 1 KB topic is cheaper to carry than to fetch.

Token figures are estimates (`cjk × 1.1 + other / 3.8`, a labelled heuristic);
byte counts are exact. No offline tokenizer was assumed available.

### 3.2 Fact coverage — zero loss (hard check)

- Anchors extracted from the frozen baseline: **685** (every H2–H4 heading and
  every single-line inline-code fact).
- Missing from the new bundle: **0** → **100.00 % coverage**.
- Intentional drops: **1** — `` `~/.dsh/skills/` ``, a hard-coded bundle path
  now supplied by the harness `<skill_resources>` block. Allow-listed with a
  reason in `scripts/skill-eval.mjs`, so a *silent* loss can never hide behind
  "we rewrote that part".
- Anchors occurring in more than one file: 116 (informational — the technical
  terms overlap by nature; the checker does not treat this as a failure).

*Limitation:* the extractor ignores inline code spans that wrap across lines,
so coverage of very long multi-line `code` spans is not asserted. Every
heading is covered.

### 3.3 Routing integrity

Mechanical probes (`node scripts/skill-eval.mjs`) — each asks whether the
expected file actually contains the distinctive terms and whether `SKILL.md`
routes to it:

| Probe | Expected location | terms | content | router |
| --- | --- | ---: | :---: | :---: |
| toolchain (modules, `import std;`) | `references/toolchain.md` | 4/4 | ✅ | ✅ |
| headers (`<flat_map>`, `<generator>`, …) | `references/stdlib-headers.md` | 4/4 | ✅ | ✅ |
| API (runtime format string) | `references/stdlib-api.md` | 4/4 | ✅ | ✅ |
| reflection (`access_context`, `subobjects_of`) | `references/reflection-meta.md` | 4/4 | ✅ | ✅ |
| codec (`field_no`, varint, `deep_equal`) | `references/annotations-codec.md` | 4/4 | ✅ | ✅ |
| contracts (`contract_assert`, `#embed`) | `SKILL.md` (inlined) | 4/4 | ✅ | n/a |

Links: 7 distinct bundle paths referenced, **0 dangling**, **0 orphan
references** (every reference is reachable from the router).

### 3.4 Empirical retrieval probes — 3/3

Three fresh subagents were given only `SKILL.md` and one question each, with a
hard cap of two reference reads, no directory listing and no web access. This
tests the actual progressive-disclosure behaviour: can an agent that sees only
the router name the right file and then answer correctly?

| Probe | Question | Routed to | Correct | Router alone sufficed |
| --- | --- | --- | :---: | :---: |
| A | runtime (non-`constexpr`) format string on libstdc++ 16 | `references/stdlib-api.md` | ✅ | yes |
| B | base-class members + private nested type with P2996 | `references/reflection-meta.md` | ✅ | yes |
| C | `meta: No such file or directory` / `'meta' is not a member of 'std'` triage | `references/stdlib-headers.md` | ✅ | yes |

Every answer reproduced the bundle's exact spellings (`std::vformat` +
`std::make_format_args` lvalue requirement; `subobjects_of` + `is_base`
recursion and the `type_of` recovery route; `g++-16` + `-std=c++26`), with no
directory listing, no extra file and no web search. All three reported that
the routing table alone was sufficient to pick the file — the intended
property of the L1 layer.

### 3.5 Toolchain regression check

The bundled demo — the skill's copy-from idiom source — was rebuilt and run on
the *currently installed* g++-16 16.2.0 (the bundle recorded 16.1.0):

```sh
g++-16 -std=c++26 -freflection -O2 -o demo main.cpp && ./demo
```

Result: builds in **3.2 s**, exit 0, and prints the expected reflection /
`#embed` / `std::expected` / saturating-arithmetic output. The central
toolchain recipe the router advertises still holds on the newer same-major
compiler — which is exactly the "same toolchain family, keep trusting" rule
now written into the trust boundary.

## 4. Verdict

- **Progressive disclosure: achieved.** The always-loaded layer shrank 83.0 %
  by bytes / 84.1 % by estimated tokens; realistic task routes shrank 29–83 %.
- **Effectiveness: preserved, with evidence.** 100 % fact-anchor coverage
  against a frozen baseline, 6/6 mechanical routing probes, 3/3 empirical
  agent probes with correct routing and correct answers, 0 dangling links,
  0 orphan references, and a green demo rebuild.
- **Residual risks.** (i) worst-case full-read is 10.9 % larger than before;
  (ii) `references/reflection-meta.md` is 26.9 KB and is the natural next file
  to split if it grows; (iii) the failure-triage table is deliberately
  duplicated between the router and `references/stdlib-headers.md` — it must
  be kept in sync (probe C showed the duplication is what makes the router
  immediately useful for the most common error class); (iv) token figures are
  heuristic, not tokenizer-exact.

## 5. Maintenance contract

- Budgets enforced by the script: router ≤ 12,000 B, any reference ≤ 32,768 B,
  frontmatter ≤ 700 B.
- **Inline anything under ~2 KB** into the router instead of splitting it out:
  a reference costs a full tool round trip regardless of size, so a tiny file
  is pure overhead. (This is the F6 fix — `contracts-embed.md` was 1,095 B.)
- New verified facts go into the routed reference, not the router. Add a
  routing-table row only for a genuinely new topic.
- Run `node scripts/skill-eval.mjs` after any edit; it exits non-zero on fact
  loss, dangling links, orphan references, a failed routing probe, or a budget
  breach, so it is usable as a pre-commit / CI gate.
- Leave `baseline/SKILL.md` frozen — replacing it would silently move the
  coverage goalposts.
- **Keep non-instructional material out of the bundle.** The report and the
  baseline are measurement artifacts; anything inside the bundle is part of the
  model's retrieval surface, so meta-material belongs outside (finding F7).

---

## 6. Preset A/B experiment (2026-09-12)

**Question.** The `modern-cpp` agent preset carried a 1.5 KB persona on top of a
14.5 KB copy of the shipped `standard` composition. Does the preset earn that
copy? Specifically: does the persona change what the agent *does*?

**Method.** Fixed workspace (`nlohmann/json` @ `feature/static-reflection`),
three frozen tasks, same model, same tools. The only variable was the persona
text (a subagent cannot mount a whole preset, so Arm B received the persona
verbatim in-prompt; the preset's other rows were compared separately by row
diff). Tasks: (T1) write a P2996 member-name printer; (T2) state the verified
route to a private nested type; (T3) triage `meta: No such file or directory`.

**Result.**

| Metric | Arm A — no persona | Arm B — persona |
| --- | --- | --- |
| Skill loaded | **1/3** (and 4th tool, as a catch-up) | **3/3** (always the first tool) |
| Answers correct | 3/3 | 3/3 |
| Grounded in | the repo's own docs (`VERIFIED_FACTS.md`, `BUILD_RECIPES.md`, `reflection_json.hpp`) | the same repo docs, plus the skill |

**Conclusions.**

1. **The persona did not improve answer quality** — both arms answered all three
   correctly, because the repository's `AGENTS.md` already points at
   `VERIFIED_FACTS.md`. With information held equal, the preset changes *when*
   the skill is loaded, not *what* the agent knows.
2. **The preset is a full replacement, not an overlay**, so keeping it means
   maintaining the whole row set — and it had already drifted silently:
   `present` and `command-goal` were missing and `tool-web` had `fetch: false`
   (none of which were intentional). Drift is structural: it is a hand copy of
   `standard` and will be stale again after any upgrade.
3. **The persona's constraints have a real cost.** Arm A's unconstrained agents
   reproduced the compile error they were diagnosing and compiled both halves of
   the splice claim; Arm B, told not to re-verify, produced less independent
   evidence. Arm A also hit — and reported — a genuine bundle gap (F8).
4. **Decision: the preset was deleted.** Valued at one behaviour (skill-load
   timing) whose benefit only materializes in repositories *without* an
   `AGENTS.md` that already routes to the facts. The composition is preserved at
   `eval/modern-cpp/preset-archived/` for revival, deliberately outside both
   loaded roots (`$DSH_HOME/skills`, `$DSH_HOME/.agent-presets`) so it cannot be
   discovered as a live preset or skill.

**Limitations.** n=3, tasks authored by the same agent that ran the experiment,
and the persona-only substitution means the preset's *tool set* (e.g. the
missing `present`) was verified by row diff rather than behaviourally. This
does not measure long multi-turn sessions, and it does not generalize to
repositories without an `AGENTS.md` — that is precisely the case where the
preset could still pay for itself.
