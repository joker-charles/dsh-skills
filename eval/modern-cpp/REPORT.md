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
| L0 catalog | frontmatter of `SKILL.md` | 959 | every session (advertisement) |
| L1 router | `SKILL.md` | 12,599 | on `skill` load |
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
| F10 | A *descriptive* pointer to the skill ("generic facts live in the `modern-cpp` skill") produced a 1/3 load rate; the skill cannot trigger its own loading from its body. | Fixed at the layer that can: `whenToUse` retargeted to decision types, the body now states the usage contract and says outright that it cannot self-trigger, and the consuming repo's `AGENTS.md` carries the imperative precondition (measured 3/3). See §6.2. |
| F11 | **The skill silently vanished from the catalog** mid-session: the rewritten `whenToUse` contained `: `, making a plain YAML scalar parse as a nested mapping, and discovery drops an invalid-frontmatter skill with no model-visible diagnostic. The gate had only regex-validated the frontmatter, which passes malformed YAML. | Gate now **parses** frontmatter (provider's own YAML, strict fallback) and fails on invalid YAML, bad/missing `name`/`description`, non-kebab or directory-mismatched name, legacy keys. Reverting the quote reproduces the provider's exact error. See §6.3. |
| F12 | Budgets (12,000 B router / 700 B frontmatter) had silently become the binding constraint on load-bearing instructions. | Raised deliberately to 13,312 B / 1,024 B with rationale at the definition: guardrail headroom, not a target; never trim substance to fit a number. See §6.3. |

## 3. Evaluation results

### 3.1 Context budget (progressive disclosure achieved)

| Metric | Baseline | Router | Change |
| --- | ---: | ---: | ---: |
| Always-loaded L1 bytes | 62,617 | 12,599 | **−79.9 %** |
| Always-loaded L1 est. tokens | 16,468 | 3,066 | **−81.4 %** |

Typical per-task route cost (router + the selected reference(s)):

| Route | Files | Bytes | vs baseline |
| --- | ---: | ---: | ---: |
| router only (no reference read) | 1 | 12,599 | −79.9 % |
| build / toolchain | 2 | 22,080 | −64.7 % |
| header lookup | 2 | 20,503 | −67.3 % |
| API signature | 2 | 20,386 | −67.4 % |
| reflection / `std::meta` | 2 | 39,452 | −37.0 % |
| reflection codec | 3 | 46,251 | −26.1 % |
| contracts / `#embed` (inlined) | 1 | 12,599 | −79.9 % |
| *worst case (reads everything)* | 6 | 71,423 | **+14.1 %** |

The worst case is the only regression: an agent that ignores the routing table
and reads every reference pays ~6.6 KB more than the old monolith (the
router's duplicated triage table plus the per-file headers). That is the
intended trade — the worst case is rare, and every realistic route is 26–80 %
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

- **Progressive disclosure: achieved.** The always-loaded layer shrank 79.9 %
  by bytes / 81.4 % by estimated tokens; realistic task routes shrank 26–80 %.
- **Effectiveness: preserved, with evidence.** 100 % fact-anchor coverage
  against a frozen baseline, 6/6 mechanical routing probes, 3/3 empirical
  agent probes with correct routing and correct answers, 0 dangling links,
  0 orphan references, and a green demo rebuild.
- **Residual risks.** (i) worst-case full-read is 14.1 % larger than before;
  (ii) `references/reflection-meta.md` is 26.9 KB and is the natural next file
  to split if it grows; (iii) the failure-triage table is deliberately
  duplicated between the router and `references/stdlib-headers.md` — it must
  be kept in sync (probe C showed the duplication is what makes the router
  immediately useful for the most common error class); (iv) token figures are
  heuristic, not tokenizer-exact.

## 5. Maintenance contract

- Budgets enforced by the script: router ≤ 13,312 B, any reference ≤ 32,768 B,
  frontmatter ≤ 1,024 B. Each is guardrail headroom above the measured size,
  not a target: a raise must be justified in the commit, and the fix for an
  over-budget bundle is a deliberate decision, never trimming a load-bearing
  instruction to fit a round number.
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

### 6.1 Follow-up: does instruction placement change loading? (A/B/C)

Arm A above left one question open: the persona reached 3/3 skill loads, but it
lived in a preset that cost a 14.5 KB drifting copy. Does the same imperative
wording work from the *workspace* layer, at zero maintenance cost?

Three arms, same three frozen tasks, same repo, same model — only the
instruction layer varied:

| Arm | Instruction layer | T1 | T2 | T3 | Load rate |
| --- | --- | --- | --- | --- | --- |
| A | baseline `AGENTS.md` — *descriptive* ("generic C++26 facts live in the `modern-cpp` skill") | late, 4th tool | no | no | **1/3** |
| B | preset persona — imperative, session level | 1st | 1st | 1st | **3/3** |
| C | `AGENTS.md` — imperative + decision-type trigger | 1st | 1st | 1st | **3/3** |

**Verdict: C = B.** The workspace layer is sufficient; the preset is not needed
to get loading. Answer quality was 3/3 in every arm — only load *timing* moved,
which is consistent with §6's premise that disclosure changes cost, not the
answer ceiling.

**Why Arm A failed.** `AGENTS.md` said *where* the facts are, not that loading
is a precondition. The model used the repository's own docs instead, which is
rational when they answer the question directly. Making the load an imperative
precondition — and keying the trigger to the *kind of decision* rather than the
language standard, since the branch keeps C++11–C++26 green — is what closed it.

**Closed loop on F8.** Arm C's first task hit the exact `define_static_array`
trap that the unconstrained Arm A probe had discovered, and which was fixed in
the previous commit. The fresh agent applied the documented fix and cited
`references/reflection-meta.md` by line. An unconstrained probe found a gap, the
gap was fixed, and a later agent's correct answer depended on the fix — the
methodology paying for itself.

The change lives in the consuming repository (`nlohmann/json`, commit
`ae6b6028`), not in this bundle: it is repository policy, not a property of the
skill. Raw results: `abc-experiment-results.md`.

**Limitations.** n=3, tasks authored by the same agent that ran the experiment,
and the persona-only substitution means the preset's *tool set* (e.g. the
missing `present`) was verified by row diff rather than behaviourally. This
does not measure long multi-turn sessions, and it does not generalize to
repositories without an `AGENTS.md` — that is precisely the case where the
preset could still pay for itself.

### 6.2 Instruction placement: which layer can actually trigger a load

The A/B/C results above pin down a distinction worth recording, because it is
easy to get wrong (the first draft of this work put the wording in the wrong
place):

**A skill cannot trigger its own loading.** A load is decided *before* the body
is read, so instruction text inside `SKILL.md` is self-defeating as a loading
trigger — by the time an agent reads it, it has already loaded. Only two layers
can move the decision:

| Layer | Reaches the model | Can trigger a load | Scope |
| --- | --- | --- | --- |
| `description` / `whenToUse` frontmatter | always (session catalog) | **yes** — it is what the model routes on | every session that can see the skill |
| Workspace `AGENTS.md` / session persona | always (prompt) | **yes** — proven by arms B and C | that repository / that session |
| `SKILL.md` body | only after loading | **no** | — |

So the two layers carry different jobs, and the bundle needs both:

1. **`whenToUse` (frontmatter)** — the only skill-owned field that influences
   the decision. Rewritten from a standard-version trigger to a **decision-type**
   trigger (reflection/contracts/`#embed`, C++20+ library facilities, build
   errors, signature lookups), matching what the A/B/C data showed actually
   needed answering.
2. **The `SKILL.md` body** — states the *usage contract* for when the skill is
   loaded: read the router, then exactly one routed reference; work out of the
   bundle rather than re-deriving settled facts; report confirmed contradictions
   as findings. It also states explicitly that it cannot trigger its own load,
   so an agent that notices it is unloaded-but-relevant should say so rather
   than assume the skill is absent by design.
3. **Workspace `AGENTS.md`** — the imperative precondition, kept (it is what
   makes arm C reach 3/3). It remains repository policy and lives in the
   consuming repository, not here.

This is the maintenance rule that falls out: **cross-session reachability is
frontmatter's job; enforcement is the workspace's job; usage is the body's.**

### 6.3 Two defects the F10 work exposed in the gate itself

Adding the usage contract and retargeting `whenToUse` surfaced two failures that
the gate had been unable to see:

**A silent-discovery defect (caught, fixed).** The rewritten `whenToUse` value
contained `: ` sequences (from flag examples like `-std=c++26`), which makes a
plain YAML scalar parse as a *nested mapping*. The skill provider drops a skill
whose frontmatter is invalid, **with no model-visible diagnostic** — the skill
simply vanishes from the session catalog. That is exactly what happened: the
`modern-cpp` entry disappeared mid-session and came back only when the value was
quoted. The gate had been validating frontmatter with regexes (`^name:\s*...`,
`^description:\s*\S`), which match malformed YAML just as happily as valid YAML.
It now **parses** the frontmatter with the provider's own YAML implementation
(falling back to a strict inline parser) and fails on: invalid YAML, non-string
or missing `name`/`description`, a name that is not kebab-case or does not match
the bundle directory, and unsupported legacy keys. Reverting the quote
reproduces the failure with the provider's exact message.

This is the highest-severity check in the gate because it is the one failure
mode with **no** signal: every other defect here surfaces as a wrong answer,
whereas this one surfaces as the skill not existing.

**Budgets had silently become the binding constraint.** The router grew to
12,599 B and the frontmatter to 959 B, both over limits that were arbitrary
round numbers chosen when the bundle was smaller. Trimming load-bearing
instructions to fit a number chosen for convenience inverts the priority, so the
budgets were raised deliberately (13,312 B / 1,024 B) with the rationale recorded
at the definition: they exist to make growth a conscious decision, not to
constrain content. The L0 budget is still the strictest, because frontmatter
rides in every session's catalog whether or not the skill is ever loaded.
