# Toolchain, build recipes, CMake modules, `import std;`

> Part of the `modern-cpp` skill. This file is **loaded on demand**
> from `SKILL.md` (see its routing table). Facts here are verified on
> g++-16 / libstdc++ 16 (2026-08); see `SKILL.md` § "Trust boundary".

---

## Toolchain

- Reflection (P2996), contracts (P2900), and `#embed` (P1967) are **C++26
  only** and need a **GCC 16+** compiler (commonly installed as `g++-16`; the
  system default `g++` may be 15 and **rejects `-freflection`** — check
  `g++ --version` / `which g++-16` before building). Clang/MSVC support these
  features only partially or experimentally; verify before relying on them.
- Configure with CMake: `cmake -S . -B build -DCMAKE_CXX_COMPILER=g++-16
  -DCMAKE_BUILD_TYPE=Release` (substitute the actual GCC 16 binary name).
- Flags: `-std=c++26 -freflection`. Contracts are on by default in C++26;
  `-fno-contracts` disables them. `-fno-exceptions -fno-rtti` are safe when
  the code uses neither and shrink the dynamic binary ~17%.
  **Omitting `-std=c++26` is the #1 build failure**: with the default `g++`
  (15) the modern headers do not exist at all (`fatal error: meta: No such
  file or directory`); with g++-16, `-freflection` is rejected and guarded
  headers come up empty. See the symptom table in
  `references/stdlib-headers.md`.
- Fallback: `-std=c++23` on a GCC 15+ compiler (no reflection/contracts/#embed).
- Performance notes: `unsigned __int128` single-multiply in `umul_ppmm`
  (~1.6x on Pollard rho); `std::countr_zero` instead of bit-loops in GCD
  (~2x). Static linking gives the fastest startup; `std::print` pulls in
  `<ostream>`; startup cost is dominated by the dynamic loader + libstdc++
  relocations, not by print/format.
- Size note: C++26 mode adds ~19KB .text vs C++23 (contracts ~9KB + libstdc++
  C++26 hardening ~10KB); reflection table data itself is ~free. On a trivial
  TU (no templates/contracts) the two modes are identical.
- Locate the toolchain portably on any machine (use these instead of guessing
  paths):
  ```sh
  which g++-16                            # confirm the GCC 16 binary name
  g++-16 -print-file-name=include         # standard-library include dir
  g++-16 -print-file-name=libstdc++.so    # libstdc++ location (dirname = lib dir)
  ```

## Build recipes — copy these, don't derive them

The toolchain facts in this skill were verified on a g++-16 16.1.0 /
libstdc++ 16 toolchain (2026-08). On the same toolchain, trust them; do not
re-derive flags or API spellings from scratch. When you need to compile, use
exactly:

Single translation unit (no CMake):

    g++-16 -std=c++26 -freflection -O2 -o demo demo.cpp
    # optional when unused: -fno-exceptions -fno-rtti   (shrink ~17%)
    #                        -fno-contracts             (disable contracts)

CMake project:

    cmake -S . -B build -DCMAKE_CXX_COMPILER=g++-16 -DCMAKE_BUILD_TYPE=Release
    cmake --build build -j$(nproc)

The project's CMakeLists must set `CMAKE_CXX_STANDARD 26` — this requires
**CMake ≥ 3.30** (older CMake silently falls back to C++23) — and pass
`-freflection` explicitly for reflection code (CMake never adds it).

If the workspace has its own C++ project with a documented build recipe
(repo-level AGENTS.md or README build section), follow that recipe instead.

One-line toolchain sanity check (when in doubt — not a full re-verification):

    printf 'int main(){}' | g++-16 -std=c++26 -freflection -x c++ - -o /tmp/t && echo "g++-16 OK"

This skill ships a complete, known-good demo project at
`examples/reflection-demo/` (the directory next to this SKILL.md — resolve it
relative to this file, do not assume an absolute location).
Read its `README.md` first: `main.cpp` exercises reflection + contracts +
`#embed` + format/print + span + expected and compiles with the one-liner
above (verified both single-file and via its CMakeLists.txt). Use it as the
smoke test and as a copy-from idiom source.

## Offline docs

If the machine has an offline cppreference snapshot and/or a GCC manual
(locations may be recorded in the workspace AGENTS.md), consult those before
web search. Otherwise use the online references: cppreference.com (C++20/23
complete; C++26 ongoing) and the GCC manual + `cxx-status.html` (official
C++26 = experimental status) for feature/compiler support.


---

## Modern CMake and C++ modules — verified 2026-08

CMake 3.28+ (Ninja generator) makes C++ modules first-class with GCC 16:
**no hand-written `-fmodule-mapper`**, both the interface unit and every
consumer `import` are handled automatically. CMake 4.2.3 + Ninja 1.13 +
g++-16 (Ubuntu) verified by building a library module + executable:

```cmake
cmake_minimum_required(VERSION 3.28)
project(demo LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 26)          # 23 also works if the toolchain supports it
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(mathlib mathlib/math.cppm)          # the module interface unit lives here
target_sources(mathlib PUBLIC FILE_SET CXX_MODULES FILES mathlib/math.cppm)
set_target_properties(mathlib PROPERTIES CXX_MODULE_STD CXX26)

add_executable(demo main.cpp)                    # main.cpp does `import mathlib;`
target_link_libraries(demo PRIVATE mathlib)
```

Key facts (all observed on the actual build above):

- The one required declaration is `target_sources(<lib> PUBLIC FILE_SET
  CXX_MODULES FILES <interface>...)` plus `set_target_properties(<lib>
  PROPERTIES CXX_MODULE_STD CXX26)`. A `.cppm` (module interface unit) can
  both declare and define exported functions directly.
- `CXX_MODULE_STD` must match the compiler's handling of the module
  partition/standard. For a single interface unit with `-std=gnu++26`, set it
  to `CXX26`.
- CMake drives a two-phase build: first it scans each TU with
  `g++-16 -E -fmodules-ts -fdeps-file=... -fdeps-format=p1689r5 ... -o .ddi.i`,
  writing P1689R5 dependency files; then it compiles with
  `-std=gnu++26 -fmodules-ts -fmodule-mapper=<file>.modmap -fdeps-format=p1689r5`.
  The `.modmap` mapper is **generated by CMake**; a consumer `import` of a
  target's public module set just works through `target_link_libraries`.
- Combine with the existing toolchain section: configure requires
  `-DCMAKE_CXX_COMPILER=g++-16` (system `g++` is 15 and rejects the module
  flags' newer `-std=gnu++26` semantics). Ninja is required — the Makefile
  generator does not have the CXX dyndep support modules need.
- When a header-only lib must be consumable via modules, the exported
  interface TUs go in the library's `FILE_SET CXX_MODULES` and stay
  alphabetical-safe (avoid leading `_` in module names).

## `import std;` — verified 2026-08

`import std;` (and `import std.compat;`) is the standard-library module that
replaces the standard `<...>` includes. On GCC 16 it works, but the std module
interface must be **precompiled first** — GCC does not build it on its own.

Standard status (do not re-derive): `import std;` / `std.compat` is **already
standardized** — it is part of **C++23** via P2465R3 ("Standard Library
Modules `std` and `std.compat`", Stephan T. Lavavej). It is not a draft or a
pending feature. The three major standard libraries have implemented it:
libstdc++ (GCC, merged 2024), libc++ (Clang/LLVM, marked implemented 2024),
and MSVC STL. What is genuinely NOT "done" is the **build-system integration**:
CMake's automatic `import std` is still an experimental, version-fragile
feature, so the usable-on-today path is the manual precompile below. Do not
tell the user "wait for a feature that has not arrived" — the standard and the
implementations are already in; only automatic build integration is incomplete.

Verified on this machine (g++-16 / GCC 16.1.0, libstdc++-16-dev): `import
std;` + `std::println`, `std::format`, `std::vector`, `std::views::filter`
compiled and ran (`[1, 3]`, `2+3=5`).

- GCC ships the std module interface at
  `$(g++-16 -print-file-name=include)/bits/std.cc` (and `bits/std.compat.cc`),
  with the manifest
  `$(dirname $(g++-16 -print-file-name=libstdc++.so))/libstdc++.modules.json`
  whose `modules[].source-path` points at them (substitute the actual GCC 16
  binary name; if those paths do not exist, locate the include search dirs
  with `echo | g++-16 -E -x c++ -v - 2>&1`). There is **no separate
  `std.cppm`** in the dev package.
- Naive `import std;` in a CMake target fails:
  `fatal error: unknown compiled module interface: no such module` — because
  no `gcm.cache/std.gcm` exists yet.
- Manual robust recipe (works today):
  ```sh
  g++-16 -std=gnu++23 -fmodules-ts -c "$(g++-16 -print-file-name=include)/bits/std.cc"   # -> gcm.cache/std.gcm
  g++-16 -std=gnu++23 -fmodules-ts main.cpp                             # imports std from ./gcm.cache
  ```
  GCC finds `gcm.cache` next to the source and imports `std` from it; no
  `-fmodule-mapper` needed for this single-target case. Build the std module
  once per toolchain, then reuse the cache.
- **CMake's automatic `import std` is experimental and version-fragile.**
  CMake 4.2 supports it via a generated imported target `__CMAKE::CXX<NN>`
  built from `libstdc++.modules.json`, but only on the **Ninja** generator,
  only when the `CxxImportStd` experimental feature is enabled before
  `project()`, and only for libstdc++. There were enablement bugs across
  4.2.x releases; do not depend on it for a stable build. Prefer the manual
  gcm precompile or a target that compiles `bits/std.cc` into the module set.

