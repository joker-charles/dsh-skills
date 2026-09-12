---
name: modern-cpp
description: 现代 C++（C++20/23/26）开发知识与已验证的 g++-16 工具链事实：标准库头文件速查、API 签名、std::meta 反射查询索引、构建命令与坑位，随附 demo 工程。
whenToUse: 用于任何 C++20/23/26 编码/审查任务；优先在标准库用法（format/expected/span/ranges/print 等）、静态反射（P2996）、契约（P2900）、#embed，以及 toolchain/编译参数疑点开始时加载。
---

# Modern C++ (C++20 → C++26) development

> 本 skill 是**通用型权威参考**，存放于用户全局根 `~/.dsh/skills/`，对所有会话可见。它收录语言/工具链本身的已验证事实。**仓库特定的约定**（路径、构建配方、项目惯用法、本仓库实验分支的已验证事实）不在此，而记录在工作区 `AGENTS.md`，后者在具体仓库内优先于本段描述。

This skill carries **verified** modern-C++ knowledge: toolchain requirements,
per-standard feature maps, and compiler behavior that was confirmed by
building minimal repros (2026-08). Read it before writing any C++20/23/26
code so a fresh context does not have to re-derive these facts from memory or
web searches. Workspace-specific conventions (paths, build recipes, project
idioms) live in the workspace AGENTS.md when present and take precedence here.

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
  headers come up empty. See the symptom table in the header map below.
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

## C++20 essentials

- **Concepts**: `concept` definitions, `requires` clauses/expressions,
  `std::same_as`, `std::convertible_to`, etc. Prefer constrained templates.
- **Ranges**: `<ranges>`, views (`std::views::filter/transform/take/drop`),
  range algorithms; prefer `std::ranges::*` over iterator pairs.
- **Coroutines**: `co_await`/`co_yield`/`co_return`, `<coroutine>`; keep
  generator-style suspensions minimal; prefer ranges for sequences.
- **Modules**: `import`/`export` — with modern CMake (3.28+) + Ninja + GCC
  16 this is now first-class and CMake handles the build completely (see the
  dedicated "Modern CMake and C++ modules" section below). No hand-written
  module mapper needed.
- **constexpr/consteval**: `constinit`, immediate functions; `std::bit_cast`,
  `std::midpoint/lerp`, `std::erase/erase_if`, `std::source_location`,
  `std::span`, `std::format` (type-safe `{}` formatting), `std::jthread` +
  `std::stop_token`, `std::atomic_ref`, `std::latch/barrier/semaphore`.
- Three-way comparison `<=>` (defaulted, `std::strong_ordering` etc.),
  designated initializers, `char8_t`, `std::endian`, `std::ssize`.

## C++23 essentials

- **Deducing this** (explicit object parameter): `void f(this auto& self)`.
- `std::expected<T,E>` (no-exceptions error handling), `std::mdspan`,
  `std::flat_map/flat_set`, `std::print/println`, `std::generator`,
  `std::ranges::to`, `std::views::enumerate/zip/adjacent/chunk/slide/join_with`,
  `std::move_only_function`, `std::bind_back`, `std::byteswap`,
  `std::to_underlying`, `std::unreachable`, `std::forward_like`,
  `std::stacktrace`, `static operator[]`, `if consteval`, `auto(x)` decay-copy,
  `#elifdef/#elifndef`, `std::is_scoped_enum`, `std::start_lifetime_as`.

## C++26 essentials

- **Static reflection (P2996)** — see the dedicated section below.
- **Contracts (P2900)** — see below.
- **`#embed` (P1967)** — see below.
- Library: `std::inplace_vector`, `std::text_encoding`,
  `std::copyable_function`, saturating arithmetic (`std::saturating_add/sub/
  mul/div/cast` in `<numeric>` — the standard `std::add_sat` spelling does
  NOT compile on libstdc++ 16), `<stdbit.h>`/`<stdckdint.h>`
  (`ckd_add/ckd_sub/ckd_mul`). Not yet in libstdc++ 16: `std::execution`
  (P2300 senders), `std::is_within_lifetime`, `std::linalg`,
  `std::runtime_format` (use `std::vformat`). See the header map and the API
  quick reference below for exact headers and signatures.
- Language: `@`/`$`/backtick in basic charset, user-generated static_assert
  messages, placeholder variables (`_`), pack indexing (`T...[I]`), attributes
  for structured bindings, `= delete("reason")` diagnostics, trivial infinite
  loops are not UB.

## Standard-library header map — which `<header>` provides what

**Checked against libstdc++ 16 (g++-16) unless marked otherwise.** When a
name is "not declared in this scope", check the include first — a missing
header is the usual cause, not a missing feature. A facility only exists once
its own header is included; headers are not transitive. The API quick
reference below gives the exact verified signatures.

> **Every header below needs `-std=c++26` on the GCC 16 binary** (plus
> `-freflection` for reflection). These headers do not exist in GCC 15's
> standard library, so missing the flag or using the wrong compiler shows up
> as a "header not found" / "not a member" error — the single most common
> build failure. Symptom → cause:
>
> | Error | Cause | Fix |
> | --- | --- | --- |
> | `fatal error: meta: No such file or directory` (same for `<print>`, `<expected>`, `<generator>`, `<mdspan>`, `<flat_map>`, ...) | compiling with the WRONG compiler — the default `g++` is 15 and has none of these headers | use `g++-16` (`which g++-16` to confirm the binary name) |
> | `'-freflection' only supported with '-std=c++26'` | `-freflection` given without `-std=c++26` | pass `-std=c++26 -freflection` together |
> | `'meta' is not a member of 'std'` / declarations missing | g++-16 but WITHOUT `-std=c++26` — the header exists but its contents are guarded (`#if __glibcxx_reflection >= 202603L`) | add `-std=c++26` |
> | C++23 gets used silently in CMake | `CMAKE_CXX_STANDARD 26` on CMake < 3.30 (unknown value falls back) | use CMake ≥ 3.30, or pass `-std=c++26` explicitly |

### C++20 facilities

| Facility | Header |
| --- | --- |
| Concepts: `std::same_as`, `convertible_to`, `derived_from`, `invocable`, `predicate`, … | `<concepts>` |
| Ranges: `std::views::*` and `std::ranges::*` | `<ranges>` (+ `<algorithm>` for range algorithms, `<numeric>` for `std::ranges::iota`) |
| `std::span` | `<span>` |
| `std::format`, `std::format_to`, `std::formatted_size`, `std::vformat`, `std::make_format_args` | `<format>` |
| `std::jthread`, `std::stop_token`, `std::stop_source`, `std::stop_callback` | `<thread>` (a standalone `<stop_token>` header also exists) |
| `std::atomic_ref` | `<atomic>` |
| `std::latch` / `std::barrier` / `std::counting_semaphore`, `std::binary_semaphore` | `<latch>` / `<barrier>` / `<semaphore>` |
| `std::source_location` | `<source_location>` |
| `std::bit_cast`, `std::endian`, `std::countr_zero`, `std::popcount`, `std::has_single_bit`, `std::bit_ceil/floor/width` | `<bit>` |
| `std::midpoint`, `std::lerp` | `<numeric>` |
| `std::ssize`, `std::size`, `std::empty`, `std::data` (free functions) | `<iterator>` |
| `std::strong_ordering` / `std::weak_ordering` / `std::partial_ordering` | `<compare>` |
| `std::erase` / `std::erase_if` for a container | that container's own header (`<vector>`, `<string>`, `<deque>`, …) |
| Coroutine support (`std::coroutine_traits`, `std::noop_coroutine`) | `<coroutine>` |
| `char8_t` conversions (`mbrtoc8` / `c8rtomb`) | `<uchar>` |
| Feature-test macros (`__cpp_lib_*`) | `<version>` |

### C++23 facilities

| Facility | Header |
| --- | --- |
| `std::expected<T,E>` | `<expected>` |
| `std::mdspan` | `<mdspan>` |
| `std::flat_map` / `std::flat_set` | `<flat_map>` / `<flat_set>` |
| `std::print` / `std::println` | `<print>` |
| `std::generator<T>` | `<generator>` |
| `std::views::enumerate/zip/zip_transform/adjacent/chunk/chunk_by/slide/join_with/stride`, `std::ranges::to` | `<ranges>` |
| `std::move_only_function`, `std::bind_back` | `<functional>` |
| `std::to_underlying`, `std::unreachable`, `std::forward_like` | `<utility>` |
| `std::byteswap` | `<bit>` |
| `std::stacktrace` / `std::basic_stacktrace` | `<stacktrace>` |
| `std::is_scoped_enum` | `<type_traits>` |
| `std::start_lifetime_as` / `std::start_lifetime_as_array` | `<memory>` |
| `std::ranges::iota` | `<numeric>` |

### C++26 facilities (this toolchain: libstdc++ 16 / g++-16)

| Facility | Header |
| --- | --- |
| Static reflection: namespace `std::meta` | `<meta>` |
| Contracts: `contract_assert`, `handle_contract_violation` | `<contracts>` |
| `#embed` | none — preprocessor directive, no header; file must sit next to the source or be an absolute path |
| `std::inplace_vector<T,N>` | `<inplace_vector>` |
| `std::text_encoding` | `<text_encoding>` |
| `std::copyable_function` | `<functional>` |
| Saturating arithmetic `std::saturating_add/sub/mul/div/cast` | `<numeric>` |
| Checked arithmetic `ckd_add` / `ckd_sub` / `ckd_mul` | `<stdckdint.h>` |
| Bit utilities (`stdc_*` macros) | `<stdbit.h>` |
| `std::is_within_lifetime` | **not in libstdc++ 16** (P2641R4 missing) |
| `std::linalg` | **not in libstdc++ 16** (missing) |
| Sender/receiver `std::execution` (P2300) | **not implemented in libstdc++ 16** — `<execution>` has no sender machinery; use stdexec or `<experimental/…>` |

## API quick reference (verified signatures, g++-16)

Signatures below compiled and ran on g++-16 (`-std=c++26 -freflection`,
2026-08) unless marked otherwise. Look here before writing a call: the exact
spelling here is what this toolchain accepts.

### std::format / std::print / runtime format strings

- `std::string std::format(std::format_string<Args...> fmt, Args&&... args);`
  (`<format>`) — the format string is compile-time checked: a wrong
  placeholder is a compile error, not a runtime one. `std::format_to(it,
  fmt, args...)` and `std::formatted_size(fmt, args...)` live in the same
  header.
- `std::print(std::format_string<Args...> fmt, Args&&... args);` and
  `std::print(FILE* stream, fmt, args...);` (`<print>`) — `std::println`
  appends a trailing `\n`; `std::println()` prints just a newline; stdout is
  the default stream.
- Runtime (non-constant) format strings: C++26 `std::runtime_format` (P2905)
  is **NOT implemented in libstdc++ 16** — verified error: `'runtime_format'
  is not a member of 'std'`. Use the C++20 escape hatch instead:
  ```cpp
  std::string_view fmt = "{}";            // a runtime value is fine here
  int n = 42;
  std::string s = std::vformat(fmt, std::make_format_args(n));
  ```
  **`std::make_format_args` takes lvalues** (`Args&...`): pass named
  variables, not temporaries (verified: an rvalue argument does not compile).

### std::expected<T,E>  (`<expected>`, C++23)

- `bool has_value() const noexcept;` and `explicit operator bool() const noexcept;`
- `T& value() &;` / `const T& value() const &;` — throws
  `std::bad_expected_access<E>` when empty.
- `const E& error() const &;` — **use only when empty**; reading `error()` on
  a value-holding expected is UB.
- `T value_or(U&& default_value) const&;` — the value, or the default.
- Monadic (each exists in `&`, `const&`, `&&`, `const&&` overloads):
  - `template<class F> auto and_then(F&& f) &;` — `f` returns `expected<U,E>`;
  - `template<class F> auto transform(F&& f) &;` — `f` returns a plain `U`
    (wrapped into `expected<U,E>`);
  - `template<class F> auto or_else(F&& f) &;` — `f` returns `expected<T,E2>`;
  - `template<class F> auto transform_error(F&& f) &;`
- `T& operator*() & noexcept;` / `T* operator->() noexcept;` — unchecked.

### std::span<T, Extent>  (`<span>`, C++20)

- Implicit from contiguous containers and C arrays:
  `std::span<int> s = vec;` / `std::span<int, 3> s3 = arr;` (static extent).
- Explicit: `std::span<int> s(ptr, count);`
- Members: `data()`, `size()`, `size_bytes()`, `empty()`, `operator[]`,
  `front()`, `back()`, `begin()/end()`.
- Subviews: `auto head = s.first(n);` `auto tail = s.last(n);`
  `auto mid = s.subspan(offset);` `auto mid = s.subspan(offset, count);`

### std::jthread + stop tokens  (`<thread>` / `<stop_token>`, C++20)

- `std::jthread jt(fn, args...);` — **the destructor joins automatically**
  (unlike `std::thread`).
- Cooperative cancellation:
  ```cpp
  std::jthread jt([](std::stop_token st) {
    while (!st.stop_requested()) { /* work */ }
  });
  jt.request_stop();   // sets stop_requested(); no forced kill
  ```
- `std::stop_token get_stop_token() const noexcept;`;
  `std::stop_source` (owner side: `request_stop()`, `stop_requested()`);
  `std::stop_callback<Fn>` (registered on a token, runs on request).

### Ranges views  (`<ranges>`, C++20/23)

- Composition:
  `auto v = c | std::views::filter(pred) | std::views::transform(f) | std::views::take(n) | std::views::drop(n);`
- `std::views::enumerate` (C++23): yields `(index, element)` — index is a
  signed difference-type, element is a reference:
  ```cpp
  for (auto&& [i, x] : vec | std::views::enumerate) { /* i is 0,1,2… */ }
  ```
- `std::views::zip(r1, r2, …)`, `std::views::adjacent<n>`,
  `std::views::chunk(n)`, `std::views::chunk_by(pred)`, `std::views::slide(n)`,
  `std::views::join_with(sep)`, `std::views::stride(n)` — all C++23.
- Materialize: `auto out = r | std::ranges::to<std::vector<int>>();` (C++23;
  `std::ranges::to` is in `<ranges>`).
- Range algorithms are in `<algorithm>` (`std::ranges::sort/find/count/
  lower_bound…`); `std::ranges::iota` is in `<numeric>`.

### std::generator<T>  (`<generator>`, C++23)

```cpp
std::generator<int> seq() { co_yield 1; co_yield 2; }
for (int x : seq()) { /* 1, 2 */ }
```
Lazy coroutine; include `<generator>` and compile with coroutine support
(C++20+). `std::generator<T&>` / `std::generator<const T&>` for reference
yields.

### std::inplace_vector<T, N>  (`<inplace_vector>`, C++26)

- Fixed-capacity vector: `push_back`, `emplace_back`, `operator[]`, `size()`,
  `capacity()` (== N), `data()`, iterators — no heap allocation; N is part of
  the type.
- C++26 failure-reporting insertions (verified): `bool try_push_back(const T&)`
  / `bool try_emplace_back(Args&&...)` return `false` when full instead of
  throwing; `unchecked_push_back` / `unchecked_emplace_back` skip the capacity
  check (UB when full).

### std::mdspan  (`<mdspan>`, C++23)

```cpp
int buf[6]{};
std::mdspan<int, std::extents<size_t, 2, 3>> m(buf);   // row-major (layout_right)
m[1, 2] = 42;          // C++23 multi-index operator[]
m.extents().extent(0); // -> 2
m.rank();              // -> 2
```
- **A data pointer (or span/array of extents) is required — there is no
  default constructor** (verified: `mdspan<int, extents<size_t,2,3>> m;`
  does not compile).

### std::copyable_function  (`<functional>`, C++26)

```cpp
std::copyable_function<int(int)> f = [](int x) { return x + 1; };
int y = f(1);   // -> 2
```
Like `std::function`, but small-buffer-optimized and specified for C++26;
prefer it for new code.

### Saturating arithmetic  (`<numeric>`, C++26) — naming deviation verified

- Available (all `constexpr`, integral types): `std::saturating_add(x, y)`,
  `std::saturating_sub(x, y)`, `std::saturating_mul(x, y)`,
  `std::saturating_div(x, y)` (`div` asserts `y != 0`), and
  `std::saturating_cast<R>(x)` (explicit target type).
- **The standard paper names `std::add_sat` / `sub_sat` / `mul_sat` /
  `div_sat` / `saturate_cast` (P0543R3) do NOT compile on libstdc++ 16**
  (verified: `'add_sat' is not a member of 'std'`). Use the `saturating_*`
  spelling on this toolchain. Feature-test macro:
  `__cpp_lib_saturation_arithmetic` = 202603L.

### Checked arithmetic  (`<stdckdint.h>`, C++26)

```cpp
int result;
bool overflowed = ckd_add(&result, 2000000000, 2000000000); // true; result unchanged
```
`ckd_add` / `ckd_sub` / `ckd_mul` store into `*result` only when the result
fits and return `true` on overflow; arguments may be mixed-width.

### Bit operations  (`<bit>` / `<stdbit.h>`)

- `<bit>` (C++20): `std::bit_cast<To>(x)`, `std::endian`, `std::countr_zero`,
  `std::countl_zero`, `std::popcount`, `std::has_single_bit`,
  `std::bit_width`, `std::bit_ceil`, `std::bit_floor`, `std::byteswap` (C++23).
- `<stdbit.h>` (C++26): the same operations as `stdc_*` macros
  (`stdc_trailing_zeros(x)` etc.), usable in C++ too.

### std::text_encoding  (`<text_encoding>`, C++26) — partial in libstdc++ 16

```cpp
std::text_encoding enc = std::text_encoding::literal(); // execution charset
const char* n = enc.name();  // e.g. "UTF-8"
std::text_encoding::id m = enc.mib();
```
`literal()` / `environment()` / `environment_is<id>()` and `aliases_view`
iteration are present (verified: `literal()` + `name()` compile and run).
**`wide_literal()` and `is_utf8()` are NOT in libstdc++ 16** (verified
absent); compare `name()` / `mib()` if you need those checks.

## Verified C++26 reflection (P2996) on GCC 16 — 2026-08

### Available in `<meta>` (namespace `std::meta`)

- `access_context` has three factory constructors (all verified 2026-08):
  - `access_context::unprivileged()` — the working default: reflects only
    members **accessible from outside any class** (private/protected members
    are omitted). This is what the codec uses — its annotated members are all
    public. For `class C { private: int h{}; public: int p{}; }` it reports
    **1** member (`p`).
  - `access_context::unchecked()` — **bypasses access control entirely**:
    returns ALL members including private/protected. Same `C` reports **2**
    (`h` and `p`), and `nonstatic_data_members_of(...)[0]` is the private
    `h`. Use it only when you genuinely need every member or must reflect
    private layout. **Scope matters — verified both halves:**
    - **Value-domain splice on a private member: WORKS.** `o.[: m :]` read and
      `o.[: m :] = v` write on a private *data member* (when `m` came from
      `unchecked()`) compile and run from outside (verified: `o.[: member_v<C,0> :] = 7`
      rewrites `private int`). `type_of(m)` on such an info also yields the
      private member type (verified: usable as `using T = typename [: type_of(m) :]`).
    - **Type-domain splice naming a PRIVATE NESTED TYPE: does NOT work.**
      `constexpr auto t = ^^Holder::Priv;` and `using V = typename [: ^^Holder::Priv :];`
      fail with `'struct Holder::Priv' is private within this context`
      (verified). The splice's type-domain lookup runs the **ordinary access
      check** — `access_context::unchecked()` does not override it.
    - **Consequence — drive a library's private nested union via the member's
      `type_of`, not by naming the type.** Directly naming the private nested
      type fails (`using V = [: ^^json_value :]` → `is private within this
      context`), so `enumerators_of(^^json_value)` / `nonstatic_data_members_of(^^json_value, …)`
      are unreachable. BUT you can reach it indirectly: `unchecked()` gives
      you the private *data member* info (`nonstatic_data_members_of(^^C,
      unchecked())[k]`), then `type_of(that info)` recovers the private nested
      type (verified twice on g++-16: `using D = typename [:
      type_of(member_v<C,0>) :];` then enumerate `^^D`'s members to reach the
      union, and `nonstatic_data_members_of(^^U, unchecked())` on it returns
      all its members in consteval). A **mirror** union is then a pragmatic
      fallback (declared in your namespace, same members/order, differential
      test against the real thing), NOT a hard requirement — a real
      `basic_json::json_value` has been used directly as the storage carrier
      with the mirror deleted. So do not claim `unchecked()` lets you *name*
      private internals; it lets you *reach them through a data member you
      already have an info for*.
  - `access_context::current()` — mirrors the privilege of the current
    translation unit; like `unprivileged()` it does NOT grant access to
    members you could not name here, so it still omits private members of
    other classes.
  - `context.via(info)` (a **member function**, called on an existing
    context, e.g. `access_context::current().via(^^Derived)`) builds a
    context "standing in" that class for `is_accessible` queries. `via`
    accepts only `info{}` (the null/empty case) or a **complete class type**
    reflection — `via(^^::)` throws `std::meta::exception` ("via argument
    other than null or complete class type reflection"). It answers "is this
    member reachable *if I stood in Derived*", but private members of another
    class remain unreachable from your TU either way (verified: `secret`
    stays inaccessible via `current().via(^^Derived)`).
  - Use `unprivileged()` unless you have a concrete reason to ask for
    more; all `nonstatic_data_members_of` / `members_of` / `bases_of` /
    `static_data_members_of` / `subobjects_of` calls take one of these (no
    default — GCC rejects the one-argument form).
- **Access filtering & the base/subobject queries — verified semantics
  (2026-08):**
  - `members_of` / `bases_of` / `subobjects_of` return only `is_accessible`
    entities for the given context: `unprivileged()` = public-visible only,
    `unchecked()` = everything. E.g. `struct D : B1, private PrivB, B2 { int d; }`
    gives `bases_of(^^D, unprivileged())` = `[B1, B2]` but `unchecked()` =
    `[B1, PrivB, B2]`; `subobjects_of` likewise `[B1,B2,d]` vs `[B1,PrivB,B2,d]`
    (verified).
  - **`subobjects_of(info, ctx)` is a UNIFIED list**: direct base subobjects
    first, then nonstatic data members — so it covers both bases and members
    in one pass (verified order: `[B1, PrivB, B2, d]`). Pick it over
    `bases_of` + `members_of` when you need the whole hierarchy flat.
    Distinguish base vs member with **`std::meta::is_base(info)`** (verified:
    true for each `B*`, false for `d`).
  - **`bases_of` returns DIRECT bases only** (recurse for the full chain);
    `has_inaccessible_bases(info, ctx)` is the dedicated "do I have
    private/protected bases" test — plus `has_inaccessible_nonstatic_data_members`
    and `has_inaccessible_subobjects` — instead of comparing unpriv/unchecked
    counts yourself (all present in GCC 16 `<meta>`, verified).
  - **`protected` members/bases need a naming-class context** — `unprivileged()`
    (standing outside every class) cannot see them; use
    `access_context::via(^^Derived)` to query "as if inside the derived
    class". `unprivileged()` covers public; protected is the gap `via` fills.
  - **Bases-of consteval trap (harder than the value-binding one):** an
    info from `bases_of` is *not* a complete-class-type directly —
    `nonstatic_data_members_of(b0, ctx)` on it fails with
    `std::meta::exception: "not a complete class type"` (verified; a real
    implementation issue, not GCC-only — cf. LLVM issue #172136). **Workaround
    (verified):** recover the type first, then enumerate:
    `using B = typename [: std::meta::type_of(b0) :];` and use `^^B` — that
    enumerates fine. **Pre-check (verified):** `is_enumerable_type(info)` is
    the sanctioned guard — true for a complete class whose member list is
    fully defined, false for an incomplete (forward-declared) type; pair it
    with `is_complete_type(info)` when you need to distinguish "complete but
    not enumerable" from "incomplete". (The same value-binding
    transient-vector rule still applies: subscript `bases_of(...)` /
    `subobjects_of(...)` directly, never bind the vector to a local
    constexpr.)
- `nonstatic_data_members_of(info,
  access_context)` — **`nonstatic_data_members_of(info,
  access_context)` REQUIRES the second argument** (GCC has no default);
  `members_of(info, access_context)` needs it too.
- `enumerators_of(info)`, `nonstatic_data_members_of`, `members_of`,
  `parameters_of` all return `std::vector<meta::info>`.
- `type_of(info)`, `identifier_of(info)` (bare name, `std::string_view`),
  `u8identifier_of` (`u8string_view`), `display_string_of` (qualified name),
  `extract<T>(info)` (strings/objects only; **throws on enumerators**),
  `substitute(info, range_of_infos)` (e.g. `substitute(^^std::vector,
  {^^int})` -> `std::vector<int>`), `is_*_type` queries. **Note the `_type`
  suffix**: `is_enum_type` / `is_class_type`; plain `is_enum` / `is_class`
  do NOT exist in `std::meta`.
- `std::define_static_string/array/object` live in `std`, **not** `std::meta`,
  and return static-storage pointers/spans (`string` -> `const char*`,
  `array` -> `span`, `object` -> `const T*`). GCC quirks (verified 2026-08):
  (1) passing a **local** constexpr lvalue to `define_static_object` yields a
  consteval-only pointer; use an rvalue or a namespace-scope constexpr.
  (2) a **local** constexpr `span` from `define_static_array` is consteval-only
  at runtime unless its value is first demanded in a constant-evaluated
  context (e.g. `constexpr std::size_t n = es.size();` or a `static_assert` on
  it); carry the values out via constexpr locals. `define_static_string`
  pointers are runtime-usable directly.

### Missing / broken in GCC 16 (do not use)

- `for_each`, `name_of` (use `identifier_of`).
- `extract<int>` on an **enumerator** throws "value cannot be extracted".
- **`if constexpr` does NOT discard the false branch** (GCC 16.1.0, C++20/23/26,
  with or without `-freflection`): a `static_assert` or a hard-instantiation
  failure in a discarded `if constexpr` branch is still a compile error
  (verified 2026-08 with minimal repro). Do NOT put a failing dependent
  instantiation in an `if constexpr` false branch. Dispatch by **tag-type
  overload** or **struct partial specialization** instead.
- `typename [: expr :]::` in an **evaluated expression** (e.g. `return
  typename [: type_of(r) :]::nested::value;`) is a **parse error**
  (`expected '(' before ';'`). Use the scope-splice form or move to a type
  context.
- Splices on **regular range-for** loop variables fail ("consteval-only
  variable '__for_range' not declared 'constexpr'"). `template for` loop
  variables are fine.
- Range splices in template argument lists; `^^` on non-type template params.
- `template for` directly over vector-returning reflection ranges is
  **ill-formed by design** (P1306R5 §3.2: needs non-transient constexpr
  allocation; GCC 16: "refers to a result of 'operator new'").
  The paper's fix is `define_static_array(...)`.

### Patterns that DO work (use these)

- Get member infos by index as constexpr variables:
  `constexpr meta::info r = meta::nonstatic_data_members_of(^^T,
  meta::access_context::unprivileged())[I];`
- Member type + access:
  `using M = typename [: meta::type_of(r) :];` then `v.[:r:]`.
- **Scope splice for static data members** (no `typename`, expression
  context, inline OK): `[: meta::type_of(ann) :]::value` (verified 2026-08).
  `typename [:R:]::value` is the wrong spelling for a non-type member —
  `typename` is only for nested *types*.
- **Type splices in type contexts** work inline even with function calls:
  `using U = typename [: expr :]::nested;` (or `using U = [: expr :]::nested;`
  in type-only contexts), `typename template [:^^TCls:]<3>::type`,
  `__is_same(typename [: expr :]::nested, ...)`.
- `annotations_of` reads annotations on **members, enumerators, and types**
  (P3394R4 type-level annotations, `struct [[=expr]] S` — verified 2026-08).
  On a type *without* a type-level annotation it returns an empty vector
  (subscripting it then trips the libstdc++ hardening assert). Member and
  enumerator annotations: go through
  `nonstatic_data_members_of(^^T, ctx)[I]` first.
- Value splice: bind to a local first, then convert:
  `auto e = [: r :];` / `int x = static_cast<int>(e);`. Direct casts of a
  **bound constexpr info** also work: `static_cast<int>([:r:])`,
  `(int)v.[:r:]` (verified 2026-08). Direct cast of the **`template for` loop
  variable itself** fails ("consteval-only expressions are only allowed in a
  constant-evaluated context") — bind `auto e = [:r:]` first there.
- Subscript splices work with a constant index: `[: es[I] :]` (enumerator
  value), `v.[: ms[I] :]` (member access).
- Member count: `meta::nonstatic_data_members_of(^^T, ctx).size()` in a
  constexpr variable template.
- `template for (constexpr auto r : define_static_array(...))` **works with
  direct splices in the expansion body** (verified on g++-16, 2026-08):
  `auto e = [: r :]` (enumerators), `v.[:r:] = ...` (member access),
  `typename [: meta::type_of(r) :]` (member type).
- The `template for` range must be the **inline** `define_static_array(...)`
  expression, or a `static` / namespace-scope constexpr variable. A plain
  local `constexpr auto es = define_static_array(...)` fails ("address of
  non-static constexpr variable ... may differ on each invocation; add
  'static'").
- An NTTP helper also works: `template <meta::info r> consteval ...` called
  as `helper<r>()` inside the `template for` body.
- **Do NOT** pass the loop variable **by value** into a `consteval` helper
  whose body splices the parameter: GCC 16 checks the body at definition and
  a function parameter is not a constant expression there ("'r' is not a
  constant expression").
- The robust codec pattern: `std::index_sequence` + `member_v<T,I>` — no
  `template for` needed.
- **Tag-dispatch helpers: pass explicit template arguments.** A dispatcher
  that forwards to per-tag overloads
  (`deserialize_member(j, v, std::bool_constant<member_is_bit_field_v<U,T,I>>{})`)
  fails with "no matching function / couldn't deduce template parameter 'I'"
  — the non-type parameter `I` is not deducible from the tag argument even
  though `std::bool_constant<false>` IS `std::false_type` (same type, verified
  `is_same_v`). Call the tagged overloads with the full explicit list:
  `deserialize_member<B, T, I>(j, v, std::bool_constant<...>{})`.

### Union and variant reflection (verified, 2026-08)

If you reach for these and the compiler rejects something, STOP and consult
this list — the answers are already here.

- **`nonstatic_data_members_of` sees union members.** For `union U { int a;
  float b; }`, `nonstatic_data_members_of(^^U, ctx)` returns both `a` and `b`
  (verified: size 2), and `is_union_type(^^U)` is `true`. Anonymous unions are
  visible too: `struct S { union { int x; float y; }; int z{}; }` is reported
  as having **2** members — `x`/`y` are folded into the enclosing `S`'s member
  list, not `z` plus the union as one member.
- **`std::variant` is handled by meta as a class, not a union.** In GCC 16,
  `std::variant<int,long,double>` has no meaningful per-alternative data-member
  reflection (the alternatives live in a discriminated holder). Do NOT try to
  enumerate `std::variant` members with `nonstatic_data_members_of`. Instead:
  - `std::meta::variant_size(^^V)` -> number of alternatives (verified: 3),
    and `std::meta::variant_alternative(I, ^^V)` -> the I-th type, used with a
    type splice `using T = typename [: meta::variant_alternative(I, ^^V) :];`
    (verified: `variant_alternative(2, ^^std::variant<int,long,double>)` is
    `double`; `std::meta::is_same_type` compares them).
  - `std::meta::is_union_type` is **false** for `std::variant` — treat it via
    `variant_size` / `variant_alternative`, not union member enumeration.
- **C unions** (for a tag+payload pattern) work directly: reflect the union's
  members with `nonstatic_data_members_of` and pick the active one by an
  explicit discriminator stored in the same struct. There is no built-in
  "active member" query — the discriminant is your responsibility.
- **Reflecting a library's private tagged-union internals — reach it through
  the member's `type_of`; a MIRROR is optional.** A discriminated-union type
  whose tags are a **public** enum and whose union members live in a
  **private** nested type (e.g. nlohmann/json's `basic_json`: public `value_t`
  + private `union json_value`) CAN be table-driven directly: get the private
  *data member* info via `unchecked()`, recover the nested type with
  `type_of`, then reflect it (`nonstatic_data_members_of(^^D, ctx)` → the
  union member → `nonstatic_data_members_of(^^U, ctx)`) — verified in consteval
  on g++-16. Build the tag↔member↔storage-class table with `index_sequence` +
  direct subscripts, replace hand-written switches with tag-overload /
  partial-specialization dispatch. A **mirror union** (`union json_value_mirror`
  in your namespace, same members/order) remains a valid fallback when the
  indirect consteval route is inconvenient (e.g. `template for` inline on the
  recovered type is rejected) — reflect the mirror, then prove it faithful by
  **differential testing against the real type**. Prefer the direct indirect
  route and keep the mirror only if a specific code shape needs it.

### Driving a private nested type: consteval indirect route (verified 2026-08)

Recapped where the private-nested-union pattern lands on GCC 16 (re-verified
twice while porting it):

- **Indirect access works well.** Get the private *data member* info via
  `unchecked()`, recover its type with `type_of`, then reflect / splice that
  recovered type freely — consteval functions, NTTP helpers, and (in local
  tests) even `template for` inline all compiled. `nonstatic_data_members_of(^^U,
  unchecked())` returned every union member (verified: a 3-member private
  union reported 3; `!!type_of(member)`'d private nested `struct data` and
  `union json_value` both enumerated fine).
  ```cpp
  template <typename T, std::size_t I>
  inline constexpr std::meta::info member_v =
      std::meta::nonstatic_data_members_of(^^T, std::meta::access_context::unchecked())[I];
  // reach the private nested union U of class C through private data member k:
  using D = typename [: std::meta::type_of(member_v<C, k>) :];   // e.g. `struct data`
  constexpr auto u = std::meta::nonstatic_data_members_of(^^D, std::meta::access_context::unchecked())[u_idx];
  using U = typename [: std::meta::type_of(u) :];                // the private union
  ```
- **The one hard wall is NAMING the type**, not using it: `^^C::PrivateType`
  and `typename [: ^^C::PrivateType :]` fail with `is private within this
  context` — you simply cannot name a private nested type from outside. That
  is why the recovery must go through a data member's `type_of`.
- **When to use a mirror**: some code shapes (e.g. a `template for` inline
  over the recovered type in a particular context) may still be rejected on
  GCC 16 with `not a complete class type` — if you hit that, fall back to a
  mirror union in your namespace (same members/order) and differential-test
  it. The mirror is a pragmatic fallback, not a requirement; the direct
  indirect route is the cleaner default.

### Inheritance and bit-fields via `subobjects_of` (verified, 2026-08)

Facts for building a serializer that handles derived classes and bit-fields;
all verified on g++-16 while implementing the refl2 codec.

- **Base-class members are NOT in `nonstatic_data_members_of`** — a derived
  type reports only its own members, so a serializer that stops there
  silently drops base members. The fix is a recursive flatten over
  `subobjects_of(^^T, ctx)` (direct bases first, then direct members):
  for each entry with `is_base(info) == true`, recurse into
  `subobjects_of(type_of(base_info), ctx)` — depth-first, base-before-member,
  matching object-layout order (verified: `Derived : Mid : Base` flattens to
  `[b, bb, m, d]`). The member-access splice `v.[:m:]` works for members of
  base classes too (verified — the splice forms a valid member access even
  when `m` belongs to a base).
- **Access classification of bases (no access_context needed):**
  `is_public(info)` / `is_protected(info)` / `is_private(info)` on each entry
  of `bases_of(^^T, access_context::unchecked())` report the base
  relationship's access kind — use them to give distinct diagnostics for
  private vs protected bases instead of the aggregate
  `has_inaccessible_bases`. Under `unprivileged()` such bases are filtered
  out of `subobjects_of` entirely, so their members would be silently
  dropped — a compile error is the honest response (verified: the two
  predicates are false/true exactly as declared).
- **Virtual bases duplicate on flatten.** `subobjects_of` reports every
  virtual-base relationship, so a shared virtual base reached via several
  paths (diamond with virtual inheritance) flattens its members multiple
  times — but C++ has ONE virtual subobject, so those members would wrongly
  appear twice in the output. `is_virtual(info)` on a base entry detects it
  (verified: true for `V1 : virtual Base`'s base relationship, false for the
  non-virtual level). Either deduplicate (track visited virtual base types
  through the recursion) or emit a dedicated compile error; do not let it
  surface as a generic duplicate-name error.
- **A class with a private/protected base is NOT an aggregate** (C++17 rule)
  — it needs a user-written constructor, which surprises aggregate-init
  users and probe code (`DerivedPriv d{"a",1,2}` fails; add a ctor).
- **Bit-fields serialize fine, but cannot bind to a `T&`.** The serialize
  side (`j[key] = v.[:m:]` with a const-ref parameter) works — the compiler
  copies the bit-field value. The from_json side (`deserialize_one(T&)` into
  `v.[:m:]`) does NOT compile: a bit-field has no address and cannot bind to
  an lvalue reference (the nlohmann macro path has the same limitation).
  Assign via `get<M>()` instead:
  `v.[:m:] = j.at(key).template get<typename [: type_of(m) :]>();` (bit-fields
  are integral/enum, so no recursion needed). `is_bit_field(info)` identifies
  them (verified). **Unnamed bit-fields are NOT subobjects** — `subobjects_of`
  skips them entirely, which is the right behavior for JSON keys (verified:
  `struct BF { int a:3; int:2; int b:5; int c; }` -> subobjects `[a, b, c]`).

### Complete `<meta>` query index (verified present on g++-16, 2026-08)

Every entry below was checked in this libstdc++'s `<meta>`; the highlighted
ones also compiled in minimal repros. Use this list to know what exists
without re-checking the compiler.

- Vector-returning queries (ALL share the transient-vector constraint:
  subscript or take `.size()` **directly on the call**, never bind the vector
  to a local constexpr first; use `std::define_static_array(...)` only for
  `template for`):
  - `nonstatic_data_members_of(info, access_context)` — **directly-declared
    nonstatic data members only; inherited members are NOT included**
    (verified: `struct D : S` where `S` declares `x` reports 0 for `^^D`).
  - `static_data_members_of(info, access_context)` — static data members.
  - `members_of(info, access_context)` — data members + member functions.
  - `bases_of(info, access_context)` — **direct** bases (recurse for the full
    hierarchy). NOTE: an info from here is NOT directly enumerable —
    `nonstatic_data_members_of(b0, ctx)` fails "not a complete class type";
    go through `type_of(b0)` first (see the access-context section).
  - `subobjects_of(info, access_context)` — **unified list**: direct bases
    then nonstatic data members, in one pass (recursion needed only for
    deeper levels). Distinguish base vs member with `is_base(info)`.
  - `has_inaccessible_bases(info, ctx)` /
    `has_inaccessible_nonstatic_data_members(info, ctx)` /
    `has_inaccessible_subobjects(info, ctx)` — dedicated "private/protected
    base-or-member present" detectors (all in GCC 16 `<meta>`).
  - `parameters_of(info)`, `enumerators_of(info)` — no access context.
  - `annotations_of(info)` / `annotations_of_with_type(info, info)` — members
    and enumerators; on a *type*, `annotations_of(^^T)` returns only P3394R4
    type-level annotations (`struct [[=expr]] S`), empty otherwise (subscript
    then trips the hardening assert; verified 2026-08). Members without
    annotations are equally fragile — always iterate via
    `std::define_static_array(...)`.
- Value/type queries: `type_of(info)`, `identifier_of(info)` /
  `u8identifier_of(info)`, `display_string_of(info)` /
  `u8display_string_of(info)`, `extract<T>(info)` (strings/objects only —
  throws on enumerators), `constant_of(info)`, `can_substitute(info, range)` /
  `substitute(info, range)` (e.g. `substitute(^^std::pair, {^^int, ^^long})`),
  `template_of(info)`, `template_arguments_of(info)` — **includes default
  arguments** (verified: `^^std::vector<int>` -> 2 entries: `int` +
  `std::allocator<int>`); a type alias has NO template arguments
  (`template_arguments_of(^^Alias)` throws `std::meta::exception` — go
  through the underlying type).
- Variant reflection: `variant_size(info)` and `variant_alternative(size_t,
  info)` — for `std::variant<>` alternatives (see "Union and variant
  reflection" above).
- Placement / linkage / location:
  - `offset_of(info)` -> `std::meta::member_offset{.bytes, .bits}` with
    `total_bits()` — NOT an integer; compare `.bytes` (verified:
    `offset_of(m) == 0` does not compile).
  - `size_of(info)`, `alignment_of(info)`, `bit_size_of(info)`.
  - `source_location_of(info)` -> `std::source_location` of the declaration
    (verified: `file_name()`/`line()` work).
  - `parent_of(info)`, `symbol_of(info)` / `u8symbol_of(info)` (operator
    spellings), `has_identifier`, `has_parent`, `has_template_arguments`,
    `has_internal_linkage` / `has_external_linkage` / `has_module_linkage` /
    `has_c_language_linkage`, `has_*_storage_duration`.
- Entity predicates (no `_type` suffix): `is_type`, `is_object`,
  `is_function`, `is_namespace`, `is_enumerator`, `is_template`,
  `is_annotation`, `is_value`, `is_static_member`, `is_nonstatic_data_member`,
  `is_bit_field`, `is_class_member`, `is_namespace_member`, `is_public` /
  `is_protected` / `is_private` (GCC convenience access queries — no
  access_context needed; verified `is_public`), `is_base`, `is_virtual`,
  `is_override`, `is_pure_virtual`, `is_defaulted`, `is_deleted`,
  `is_explicit`, `is_constructor`, `is_destructor`, `is_operator_function`,
  `is_conversion_function`, `is_vararg_function`, `is_user_declared`,
  `is_enumerable_type` (complete class with its member list fully defined —
  the sanctioned pre-check for the `bases_of` enumeration trap; false for an
  incomplete type), `is_complete_type` (verified both on this toolchain).
  `is_user_provided`, `is_mutable_member`, `is_structured_binding`,
  `is_string_literal`, `is_accessible(info, access_context)`.
- Type predicates (`is_*_type`): full `<type_traits>`-style mirror —
  `is_class_type`, `is_enum_type`, `is_union_type`, `is_arithmetic_type`,
  `is_integral_type`, `is_same_type`, `is_base_of_type`, `is_convertible_type`,
  `is_constructible_type`, `is_assignable_type`, … plus `is_reflection_type`.
- Template category: `is_class_template`, `is_function_template`,
  `is_variable_template`, `is_alias_template`, `is_concept`,
  `is_constructor_template`, `is_conversion_function_template`,
  `is_operator_function_template`, `is_literal_operator_template`.
- Not present / broken on this toolchain: `for_each`, `name_of` (use
  `identifier_of`), `extract<int>` on enumerators (throws); `if constexpr`
  does not discard the false branch; range splices in template argument
  lists; `^^` on non-type template parameters — see the patterns above.

### Annotation reading — verified pitfalls and patterns

Verified 2026-08 while building a reflection-driven codec (re-verified on
g++-16 16.1.0). Applies to P3394R4-style `[[=expr]]` value annotations.

- **Annotation infos cannot appear in a splice expression.** `[: ann :].value`
  on an annotation info is rejected ("cannot use an annotation ... in a
  splice expression"). Read a value only via one of two verified routes:
  (a) recommended — encode the value in the annotation TYPE
  (`template <std::uint32_t N> struct field_no { static constexpr std::uint32_t value = N; };`),
  then `template for` over `std::define_static_array(annotations_of(M))` and
  `return [: std::meta::type_of(ann) :]::value;` (no extract); or
  (b) structural value annotation (`[[=rpb::field_no{7}]]` with
  `struct field_no { std::uint32_t value; };`) read via
  `std::meta::extract<AnnType>(ann).value`.
- **`type_of(ann)` returns a cv/ref-qualified type.** The raw `A` does NOT
  equal `rpb::field_no<7>`; `std::remove_cvref_t<A>` does. Always strip
  qualifiers before matching the annotation type.
- **Traditional attributes and value annotations cannot share one `[[...]]`
  list.** `[[nodiscard, =rpb::field_no<7>{}]]` is rejected ("mixing
  annotations and attributes in the same list", 16.1.0). Use separate lists
  (`[[deprecated]] [[=rpb::field_no<7>{}]]`) — `annotations_of` counts only
  value annotations, so `[[deprecated]]` takes no slot.
- **The `[[=expr]]` value must be of a structural type**; a plain class with
  data members works when read via `extract`.
- **Type-level annotations are supported** by GCC 16 when placed in the
  P3394R4 form `struct [[=expr]] S`; `annotations_of(^^S)` returns the
  annotation and the type can be extracted via
  `typename [: std::meta::type_of(ann) :]` (verified on g++-16 16.1.0).
- Placement matters: `[[=expr]] struct S` (before the `struct` keyword) is
  ignored with `warning: attribute ignored ... must follow the 'struct'
  keyword`; the annotation must follow the `struct` keyword.
- Example:
  ```cpp
  struct enable {};
  struct [[=enable{}]] S { int x; };
  constexpr auto ann = std::meta::annotations_of(^^S)[0];
  using A = std::remove_cvref_t<typename [: std::meta::type_of(ann) :]>;
  static_assert(std::is_same_v<A, enable>);
  ```
- Annotation helpers must take `meta::info` as a template (NTTP) argument, not
  a function parameter (a parameter is not a constant expression where the
  body splices it).
- Second annotation use from the codec history: field-NAME annotations
  (`[[=rpb::name<"...">{}]]`) drive text/JSON output — one per oneof
  alternative, in order; plain members fall back to `meta::identifier_of`.

## Reflection-driven serialization — the codec pattern

The flagship use of P2996 reflection + P3394R4 annotations, distilled from
building a protobuf wire codec (all verified on g++-16 16.1.0, 2026-08).
This section is the design; the bundled demo implements a minimal slice of it.

- **Annotated struct = schema.** A plain struct whose members carry
  `[[=rpb::field_no<N>{}]]` (type-encoded: `N` rides on the annotation type's
  static constexpr `value`, read via scope splice — see "Annotation reading")
  IS the message definition — no `.proto` file, no code generation, no
  runtime descriptor. Known fields serialize in **ascending field-number
  order** from a compile-time table; declaration order is irrelevant. Validate
  the layout at compile time: missing/duplicate/zero field numbers,
  annotation-count mismatches, non-message `unique_ptr` pointees all
  `static_assert`.
- **Wire-type mapping conventions** (protobuf): integral/enum -> varint
  (sign-extended); sint -> zigzag; fixed32/64 and float/double -> fixed LE;
  string/bytes/embedded message -> LEN; packable repeated scalars -> packed
  LEN; `std::map<K,V>` -> repeated map-entry messages (key=1/value=2);
  `optional<T>`/`std::unique_ptr<T>` -> presence; oneof via
  `std::variant<std::monostate, Ts...>` -> one wire field per alternative;
  `unique_ptr` breaks by-value recursion cycles.
- **Presence semantics** (proto3): default-valued scalars/strings/enums and
  empty packed vectors are omitted; nested messages serialize unless all
  their members are default/absent; optionals-with-value and non-null
  `unique_ptr` always serialize; oneof: set -> emit (even defaults), last-wins
  on parse.
- **Deep equality/copy with reflection**: `deep_equal` compares member-wise
  via reflection — containers/strings use `==`; variants compare by index and
  recurse into the active alternative (variant `==` would compare `unique_ptr`
  alternatives by pointer); `unique_ptr` members dereference recursively.
  `deep_copy` rebuilds containers/variants/optionals element-wise and
  allocates fresh pointees for `unique_ptr` members.
- **Recursion guards**: cumulative thread_local depth counters on both sides
  (serialize aborts on over-depth via `contract_assert`; parse returns
  `false` — document the asymmetry); per-stream recursion limits reset on
  every nested parse, which is why a cumulative counter is needed.
- **Performance**: dispatch wire tags through a compile-time binary decision
  tree over the sorted field table (O(log N)) instead of scanning members in
  declaration order; reuse thread_local scratch buffers for nested payloads
  instead of allocating a `std::string` per chunk.
- **Testing methodology**: byte-level differential testing against a reference
  implementation (protoc-generated code, then the official conformance
  runner); one-file-per-claim minimal repros for every compiler-behavior
  claim; document accepted-but-legal divergences (e.g. packed/unpacked output
  forms) explicitly.
- **Using a library's private tagged-union as DIRECT storage** (verified in
  the nlohmann/json port): once you recover the private nested union via a
  data member's `type_of` (see the "Driving a private nested type" section),
  you can hold it directly instead of a mirror. Three preconditions to check
  on the real type before doing so: (1) the union has **no user-defined
  destructor** (so reflection-driven teardown is just member-wise), (2) its
  members are access-visible through `unchecked()` (default-accessible union
  layout), and (3) `json_value() = default` + `{}` **zero-initializes without
  allocating** — so default-constructing the union is cheap and safe. When
  all three hold, splicing the recovered union as the storage type is both
  cleaner and removes the mirror-vs-real drift risk.

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

## Trust boundary — what to re-verify and what not to

The claims in this skill were verified by compiling minimal repros with the
GCC 16 binary installed on this machine (g++-16 16.1.0, libstdc++ 16,
2026-08); wrong conclusions found then are corrected inline above. This
document is the authoritative reference for THIS toolchain:

- **Do NOT re-verify on the same toolchain.** If `g++-16` is the compiler,
  trust the header map, the API signatures, and the reflection patterns here.
  Re-checking the same facts in every session is wasted work — that is what
  this document is for. Use the one-line sanity check in "Build recipes" if
  you want cheap confidence, not a full re-derivation.
- **Missing-header / unsupported-flag errors are almost always a
  compiler/flag problem, not a knowledge gap.** Before re-verifying anything,
  check `which g++-16` and that `-std=c++26 -freflection` are both present
  (symptom table at the top of the header map).
- **Re-verify only when** (a) the toolchain differs (different machine,
  different compiler version, clang/MSVC instead of gcc), or (b) a compile
  error contradicts a claim here — on this toolchain the skill wins, so
  investigate the code first (usually a missing header / wrong flag, or your
  own code), never the skill's facts.
- **Need an API not listed here? Do NOT go grepping the compiler's headers and
  writing minimal repros "to verify".** That is exactly the wasted-work loop.
  First re-scan this skill — the `<meta>` query index, the header map, and the
  API quick reference cover the ground; a reflection capability you need (e.g.
  union/variant handling) is usually already documented. If it genuinely is
  absent, note the gap and ask the maintainer to add it; do not treat the gap
  as a license to re-derive toolchain behavior in-session.
- Workspace AGENTS.md (when present) records repository-specific verified
  facts and takes precedence for that repo.

## Reference implementations

- A coreutils "factor" C++26 migration demonstrates the idioms: CMake presets
  per standard, behavior-baseline freezing, differential testing vs GNU, a
  C++26 reflection-generated getopt table, `#embed` prime tables, contracts,
  and `std::expected`/`format`/`span` modernization. Consult local checkouts
  of it if relevant to the task at hand.
- The "Reflection-driven serialization" section above distills the design of a
  protobuf wire codec (field-number annotations, compile-time field tables,
  contracts, recursion guards, differential/conformance testing) into
  workspace-independent, verified patterns.
- This skill bundles a minimal known-good demo project
  (`examples/reflection-demo/` next to this SKILL.md — resolve it relative to
  this file): a single-file/CMake program exercising P2996 reflection with
  field-number annotations, P2900 contracts, P1967 `#embed`, the modern
  standard library, and a minimal self-contained serialize/parse roundtrip. A
  fresh context can see the compile recipe and the key APIs assembled in one
  place, with no external dependencies.
