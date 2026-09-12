# A/B/C experiment — does instruction PLACEMENT change skill loading?

Same 3 frozen tasks, same repo, same model. Only the instruction layer changed.

| Arm | Instruction layer | T1 (write code) | T2 (private nested) | T3 (triage) | Load rate |
|-----|-------------------|-----------------|---------------------|-------------|-----------|
| A | baseline AGENTS.md (descriptive: "facts live in the skill") | skill 4th, late | NO | NO | 1/3 |
| B | deleted preset persona (imperative, session-level) | skill 1st | skill 1st | skill 1st | 3/3 |
| C | AGENTS.md imperative + decision-type trigger | skill 1st | skill 1st | skill 1st | 3/3 |

## Verdict
C = B. The same imperative wording in the WORKSPACE layer achieves what the
session-level preset persona achieved -- at zero maintenance cost and scoped to
this repo. This closes the question: the preset is not needed for load rate.

## Why baseline failed (arm A)
AGENTS.md line 168 was DESCRIPTIVE ("generic C++26 facts live in the modern-cpp
skill") -- it said WHERE facts are, not that loading is a precondition. The model
rationally used the repo docs instead, since they answered the question directly.

## Secondary finding: the F8 fix was exercised in the wild
C1 hit the exact `define_static_array` trap that arm A discovered and that I
committed a fix for hours earlier. A fresh agent, reading the skill, applied the
documented fix and cited `references/reflection-meta.md` lines 129-149 by name.
That is a closed loop: an unconstrained probe found a gap -> the gap was fixed ->
a later agent's correct answer depended on the fix.

## Answer quality
Unchanged across all three arms: 3/3 correct. Only load timing moved. Consistent
with the earlier finding that progressive disclosure changes cost and timing,
not the answer ceiling.
