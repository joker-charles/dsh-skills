# reflection-demo

A minimal, **known-good**, **self-contained** C++26 program for g++-16 — no
workspace or external dependencies. It exists so a fresh session can (a) see
the exact compile recipe in one place, (b) smoke-test that the toolchain
still works in one command, and (c) see a minimal slice of the
"Reflection-driven serialization" design from the skill implemented end to
end. Everything in `main.cpp` compiled and ran on g++-16 16.1.0 / libstdc++ 16
(2026-08).

## Build

Single file (no CMake):

```sh
g++-16 -std=c++26 -freflection -O2 -o demo main.cpp && ./demo
```

CMake:

```sh
cmake -S . -B build -DCMAKE_CXX_COMPILER=g++-16 -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
./build/demo
```

(The system default `g++` may be 15 and rejects `-freflection` — verify the
GCC 16 binary name with `which g++-16`.)

## What it demonstrates

| Feature | Where in main.cpp |
| --- | --- |
| P2996 reflection: member enumeration, annotation reading (`define_static_array` + scope splice) | `member_count` / `member_name` / `member_field_no<I>` |
| Compile-time field table via `index_sequence` (ascending field numbers) | `field_numbers_impl` / `field_numbers` |
| Minimal wire codec slice: varint + tag, serialize/parse roundtrip | `write_varint` / `read_varint` / `serialize_point` / `parse_point` |
| P2900 contracts: `contract_assert` + weak global `handle_contract_violation` | `handle_contract_violation`, `contract_assert(...)` |
| P1967 `#embed` (file must sit next to the source) | `embedded_bytes` |
| `std::print`/`std::println`, `std::format` | `main()` |
| `std::span` + `std::ranges::sort` | `main()` |
| `std::expected` monadic chain (`and_then`/`transform`) | `main()` |
| libstdc++ 16 quirk: `std::saturating_add` (not `std::add_sat`) | `main()` |

## Idioms worth copying

- Vector-returning reflection queries: subscript or take `.size()` **directly
  on the call**; never bind the vector to a local constexpr first (GCC 16
  transient-allocation constraint).
- Annotations are read via
  `template for (constexpr auto ann : std::define_static_array(meta::annotations_of(M)))`
  with `using A = std::remove_cvref_t<typename [: meta::type_of(ann) :]>;` and
  a scope splice `[: meta::type_of(ann) :]::value`.
- `contract_assert` links only with a user-provided
  `handle_contract_violation` at global scope; this file ships one so the
  demo links standalone.
- Annotated struct as schema: field numbers come from annotations at compile
  time, fields emit in ascending field-number order, int32 encodes as a
  sign-extended varint — the minimal version of the full design in
  `references/annotations-codec.md` ("Reflection-driven serialization").
