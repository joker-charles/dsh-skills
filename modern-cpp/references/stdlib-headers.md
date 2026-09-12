# Standard-library header map and per-standard essentials

> Part of the `modern-cpp` skill. This file is **loaded on demand**
> from `SKILL.md` (see its routing table). Facts here are verified on
> g++-16 / libstdc++ 16 (2026-08); see `SKILL.md` § "Trust boundary".

---

## C++20 essentials

- **Concepts**: `concept` definitions, `requires` clauses/expressions,
  `std::same_as`, `std::convertible_to`, etc. Prefer constrained templates.
- **Ranges**: `<ranges>`, views (`std::views::filter/transform/take/drop`),
  range algorithms; prefer `std::ranges::*` over iterator pairs.
- **Coroutines**: `co_await`/`co_yield`/`co_return`, `<coroutine>`; keep
  generator-style suspensions minimal; prefer ranges for sequences.
- **Modules**: `import`/`export` — with modern CMake (3.28+) + Ninja + GCC
  16 this is now first-class and CMake handles the build completely (see
  `references/toolchain.md`, "Modern CMake and C++ modules"). No hand-written
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

- **Static reflection (P2996)** — see `references/reflection-meta.md`.
- **Contracts (P2900)** and **`#embed` (P1967)** — inlined in `SKILL.md`
  (§ Contracts / § `#embed`).
- Library: `std::inplace_vector`, `std::text_encoding`,
  `std::copyable_function`, saturating arithmetic (`std::saturating_add/sub/
  mul/div/cast` in `<numeric>` — the standard `std::add_sat` spelling does
  NOT compile on libstdc++ 16), `<stdbit.h>`/`<stdckdint.h>`
  (`ckd_add/ckd_sub/ckd_mul`). Not yet in libstdc++ 16: `std::execution`
  (P2300 senders), `std::is_within_lifetime`, `std::linalg`,
  `std::runtime_format` (use `std::vformat`). See the header map below and
  `references/stdlib-api.md` for exact headers and signatures.
- Language: `@`/`$`/backtick in basic charset, user-generated static_assert
  messages, placeholder variables (`_`), pack indexing (`T...[I]`), attributes
  for structured bindings, `= delete("reason")` diagnostics, trivial infinite
  loops are not UB.

## Standard-library header map — which `<header>` provides what

**Checked against libstdc++ 16 (g++-16) unless marked otherwise.** When a
name is "not declared in this scope", check the include first — a missing
header is the usual cause, not a missing feature. A facility only exists once
its own header is included; headers are not transitive. The companion file
`references/stdlib-api.md` gives the exact verified signatures.

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

