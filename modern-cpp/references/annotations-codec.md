# Annotation reading (P3394R4) and the reflection-driven codec pattern

> Part of the `modern-cpp` skill. This file is **loaded on demand**
> from `SKILL.md` (see its routing table). Facts here are verified on
> g++-16 / libstdc++ 16 (2026-08); see `SKILL.md` § "Trust boundary".

---

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

