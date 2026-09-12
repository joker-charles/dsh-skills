---
name: modern-cpp
description: 现代 C++（C++20/23/26）开发技能，采用渐进式披露：本文件是路由层（工具链、构建、报错排查、信任边界、契约 P2900 与 #embed）；细节按需读 references/ 下的 5 个文件——工具链与 CMake 模块、标准库头文件映射、已验证 API 签名、std::meta 反射查询索引、注解读取与序列化 codec。随附可编译 demo 与评估脚本。
whenToUse: 任何 C++20/23/26 编码或审查任务；写第一行 C++ 代码前加载，尤其是标准库用法（format/expected/span/ranges/print…）、静态反射（P2996）、契约（P2900）、#embed，以及 toolchain/编译参数报错时。
---

# Modern C++ (C++20 → C++26) — skill router

本 skill 采用**渐进式披露**：本文件是常读的路由层（工具链、构建、报错排查、
信任边界）；已实机验证的细节都在 `references/` 下，**按任务读对应的一个文件**，
不要一次性全读。

This file is the always-loaded router. Verified detail lives in five
on-demand files under `references/`; read the one the routing table selects,
and search the whole bundle before concluding a fact is absent. All facts were
verified by compiling minimal repros on **g++-16 / libstdc++ 16** (2026-08);
the trust boundary below says what that means for re-verification.

Contracts and `#embed` are short enough that keeping them here is cheaper than
a round trip, so they are inlined below rather than split out.

**Workspace rule:** a workspace `AGENTS.md` records repository-specific
conventions (paths, build recipes, project idioms) and takes precedence over
this skill inside that repo.

## Six rules that prevent wasted work

1. **Compiler and flags first.** C++26 features need **GCC 16+** (`g++-16`);
   the default `g++` may be 15 and has none of the modern headers. Always
   build C++26 as `g++-16 -std=c++26 -freflection`. Most "missing header" /
   "not a member" errors are a wrong compiler or a missing flag, not a
   knowledge gap — see the triage table below.
2. **Never guess a header or a signature.** Look it up in
   `references/stdlib-headers.md` (facility → header) and
   `references/stdlib-api.md` (exact verified spellings). Headers are not
   transitive; a facility exists only once its own header is included.
3. **Do not re-verify facts this bundle already settled.** See § Trust
   boundary. If you doubt the toolchain, run the one-line smoke test — do not
   grep the compiler's headers or rewrite minimal repros.
4. **Reflection-based serialization has a playbook.** Before designing a
   reflection codec, read `references/annotations-codec.md`; for the
   `std::meta` queries it builds on, `references/reflection-meta.md`.
5. **Search the whole bundle before declaring a gap.** `grep -rn "<term>"
   references/` — the `<meta>` query index, the header map and the API
   reference cover most ground. If it is genuinely absent, say so; that is
   not a licence to re-derive toolchain behavior in-session.
6. **There is a compilable example.** `examples/reflection-demo/` exercises
   reflection + contracts + `#embed` + format/print + span + expected; read
   its `README.md` first and use it as a copy-from idiom source.

## Routing table — read the file that matches the task

| If the task involves… | Read |
| --- | --- |
| Building, flags, CMake, C++ modules, `import std;`, offline docs | `references/toolchain.md` |
| "Which `<header>` provides X?", per-standard feature list, missing-header triage | `references/stdlib-headers.md` |
| Exact signature/spelling of a standard API (format, expected, span, jthread, ranges, mdspan, inplace_vector, saturating/checked arithmetic, text_encoding, bit ops) | `references/stdlib-api.md` |
| P2996 `std::meta` queries, `access_context`, private nested types, bases/`subobjects_of`/bit-fields, union & `std::variant`, splices and `template for` | `references/reflection-meta.md` |
| `[[=expr]]` annotations (P3394R4), reflection-driven serialize/parse codec | `references/annotations-codec.md` |
| Contracts (P2900), `#embed` (P1967) | inline below — no read needed |
| A runnable modern-C++ program | `examples/reflection-demo/` |
| Measuring this skill itself (budgets, routing, fact coverage) | `scripts/skill-eval.mjs` (report + baseline live outside the bundle) |

## Toolchain and build — the short version

- C++26 = **GCC 16+** (`g++-16`). Clang/MSVC support P2996/P2900/P1967 only
  partially or experimentally — verify before relying on them.
- Flags: `-std=c++26 -freflection`. Contracts are on by default in C++26;
  `-fno-contracts` disables them; `-fno-exceptions -fno-rtti` are safe when
  unused (~17% smaller dynamic binary). Fallback without GCC 16: `-std=c++23`.
- Single TU: `g++-16 -std=c++26 -freflection -O2 -o demo demo.cpp`
- CMake: `cmake -S . -B build -DCMAKE_CXX_COMPILER=g++-16
  -DCMAKE_BUILD_TYPE=Release`; `CMAKE_CXX_STANDARD 26` needs **CMake ≥ 3.30**
  (older CMake silently falls back to C++23), and `-freflection` must be
  passed explicitly (CMake never adds it).
- Toolchain sanity check (cheap confidence, not re-verification):

      printf 'int main(){}' | g++-16 -std=c++26 -freflection -x c++ - -o /tmp/t && echo "g++-16 OK"

- Locate paths portably: `which g++-16`, `g++-16 -print-file-name=include`,
  `g++-16 -print-file-name=libstdc++.so`.
- Workspace build recipe wins over this one when the repo documents its own.

Full detail (module builds, `import std;` precompile, offline docs):
`references/toolchain.md`.

## Failure triage — error → cause → fix

| Error | Cause | Fix |
| --- | --- | --- |
| `fatal error: meta: No such file or directory` (same for `<print>`, `<expected>`, `<generator>`, `<mdspan>`, `<flat_map>`, …) | compiling with the WRONG compiler — default `g++` is 15 and has none of these headers | use `g++-16` (`which g++-16`) |
| `'-freflection' only supported with '-std=c++26'` | `-freflection` without `-std=c++26` | pass both together |
| `'meta' is not a member of 'std'` / guarded declarations missing | g++-16 without `-std=c++26` — the header exists but its contents are guarded | add `-std=c++26` |
| C++23 gets used silently in a CMake build | `CMAKE_CXX_STANDARD 26` on CMake < 3.30 (unknown value falls back) | use CMake ≥ 3.30, or pass `-std=c++26` explicitly |

The same table, with the header map it belongs to, is in
`references/stdlib-headers.md`.

## Contracts (P2900) — verified

- `contract_assert(cond)` keyword; linking requires a user-defined
  `void handle_contract_violation(std::contracts::contract_violation const&)`
  (`<contracts>`). The accessor is `.comment()` (there is **no** `.message()`).
- Ship a **weak default handler** (global scope, `abort()`) in header-only
  libraries so consumers link without one; a strong application definition
  overrides it. Do NOT define the handler inside a namespace — the contract
  machinery references the global symbol. Default `contract_assert` semantics:
  handler is called, then the program terminates (abort).

## #embed (P1967) — verified

- Directive must be alone on its line; GCC does **not** search `-I` paths for
  it — the file must sit next to the source or use an absolute path.
  `__cpp_pp_embed` = 202502L.

## Trust boundary — what to re-verify and what not to

- **Do NOT re-verify on the same toolchain.** If `g++-16` is the compiler,
  trust the header map, the API signatures, and the reflection patterns in
  `references/`. Re-checking settled facts every session is wasted work. The
  one-line smoke test above is the cheap confidence check.
- **A missing-header / unsupported-flag error is almost always a
  compiler-or-flag problem, not a knowledge gap.** Check `which g++-16` and
  that `-std=c++26 -freflection` are both present before doubting the bundle.
- **Re-verify only when** (a) the toolchain differs (other machine, other
  compiler version, clang/MSVC instead of GCC), or (b) a compile error
  contradicts a claim here — then investigate the code first (usually a
  missing header, a wrong flag, or your own bug), not the bundle's facts.
- **Missing API?** Search the bundle first (rule 5). If it is genuinely
  absent, record the gap and ask the maintainer to add it — do not start
  re-deriving toolchain behavior in-session.
- Recorded verification toolchain: g++-16 **16.1.0** / libstdc++ 16. A newer
  same-major `g++-16` (e.g. 16.2.0) is the same toolchain family: keep
  trusting these facts, and only re-verify the specific claim a real error
  contradicts.

## Bundle layout

```
modern-cpp/
  SKILL.md                       <- this router (always loaded on skill load)
  references/
    toolchain.md                 <- builds, CMake modules, import std, offline docs
    stdlib-headers.md            <- per-standard essentials + facility → header map
    stdlib-api.md                <- verified signatures (format/expected/span/…)
    reflection-meta.md           <- P2996 std::meta index, access, patterns, traps
    annotations-codec.md         <- [[=expr]] reading + reflection codec pattern
  # contracts (P2900) + #embed (P1967) are inlined above, not split out:
  # a 1 KB reference would cost a full tool round trip to read.
  examples/reflection-demo/      <- compilable demo (README.md, main.cpp, CMakeLists.txt)
  scripts/skill-eval.mjs         <- bundle budgets / routing / fact-coverage check
```

The evaluation report and the frozen pre-split baseline live **outside** this
bundle, next to the harness (`$DSH_HOME/skill-eval/modern-cpp/`: `REPORT.md`,
`baseline/SKILL.md`). They are measurement inputs, not instructions, so they
stay off the model's load path; `scripts/skill-eval.mjs` reads the baseline
from there (`SKILL_EVAL_BASELINE` overrides the path).

## Reference implementations

- A coreutils "factor" C++26 migration demonstrates the idioms: CMake presets
  per standard, behavior-baseline freezing, differential testing vs GNU, a
  C++26 reflection-generated getopt table, `#embed` prime tables, contracts,
  and `std::expected`/`format`/`span` modernization. Consult local checkouts
  of it if relevant to the task at hand.
- `references/annotations-codec.md` distils a protobuf wire codec
  (field-number annotations, compile-time field tables, contracts, recursion
  guards, differential/conformance testing) into workspace-independent,
  verified patterns.
- `examples/reflection-demo/` is the minimal known-good demo bundled here:
  reflection with field-number annotations, contracts, `#embed`, the modern
  standard library, and a self-contained serialize/parse roundtrip.
