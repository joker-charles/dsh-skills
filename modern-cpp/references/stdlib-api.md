# Verified API quick reference (g++-16 / libstdc++ 16)

> Part of the `modern-cpp` skill. This file is **loaded on demand**
> from `SKILL.md` (see its routing table). Facts here are verified on
> g++-16 / libstdc++ 16 (2026-08); see `SKILL.md` § "Trust boundary".

---

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

