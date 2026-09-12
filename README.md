# dsh-skills

Personal agent skills for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH),
plus the evaluation harness that keeps them honest.

Each top-level directory is one **skill bundle**: a `SKILL.md` router plus
on-demand `references/`, exactly as the DSH filesystem skill provider expects
(`<name>/SKILL.md` under a scanned root).

## Skills

| Skill | What it is |
| --- | --- |
| [`modern-cpp/`](modern-cpp/) | Modern C++ (C++20/23/26) knowledge verified on GCC 16 / libstdc++ 16: build recipes, header map, API signatures, the `std::meta` reflection index, the annotation-driven codec pattern, contracts, `#embed`. Progressive disclosure: a small router plus five references read on demand. |

## Layout

```
modern-cpp/                  the skill bundle — this is what gets mounted
  SKILL.md                   router (always loaded on skill load)
  references/*.md            on-demand detail
  examples/reflection-demo/  compilable C++26 demo
  scripts/skill-eval.mjs     the evaluation gate for this skill

eval/                        measurement artifacts (never loaded by a model)
  modern-cpp/REPORT.md       evaluation report
  modern-cpp/baseline/       frozen pre-split monolith (coverage oracle)
```

Measurement material deliberately lives **outside** the skill bundle: anything
under `references/` becomes part of the model's retrieval surface, and a stale
evaluation report is worse than none. Keeping it in `eval/` also means the
bundle can be mounted from a checkout without dragging the report along.

## Using a skill

Copy or symlink a bundle into a root the skill provider scans — the user root
`$DSH_HOME/skills` (rank 400, visible to every session) or a project root
`<project>/.dsh/skills` (rank 100):

```sh
ln -s "$PWD/modern-cpp" "${DSH_HOME:-$HOME/.dsh}/skills/modern-cpp"
```

Symlink the **directory**, not individual files: the provider resolves a bundle
by walking `<name>/SKILL.md` and does not follow symlinked entries. Keep the
directory name equal to the skill's `name:` field.

## Evaluation

```sh
SKILL_EVAL_BASELINE="$PWD/eval/modern-cpp/baseline/SKILL.md" \
  node modern-cpp/scripts/skill-eval.mjs
```

The script is deterministic and dependency-free. It measures the layered token
budget, proves the split lost no verified fact (anchor coverage against the
frozen baseline), checks routing and link integrity, and asserts that each
reference actually contains the answers it is routed for. It exits non-zero on
any hard failure, so it works as a pre-commit hook or CI gate.

`SKILL_EVAL_BASELINE` overrides the baseline path; without it the script falls
back to `$DSH_HOME/skill-eval/modern-cpp/baseline/SKILL.md`.

## Adding a skill

1. Create `<name>/SKILL.md` with YAML frontmatter — `name` (kebab-case, must
   match the directory) and `description` are required; `whenToUse` is
   optional but strongly recommended, it is what the model routes on.
2. Put detail in `references/` and route to it from `SKILL.md`. Inline anything
   under ~2 KB instead: a reference costs a full tool round trip regardless of
   its size.
3. Put any measurement artifacts under `eval/<name>/`, never inside the bundle.

## License

MIT — see [LICENSE](LICENSE).
