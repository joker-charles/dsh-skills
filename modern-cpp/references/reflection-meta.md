# C++26 reflection (P2996): `std::meta` index, access, patterns, pitfalls

> Part of the `modern-cpp` skill. This file is **loaded on demand**
> from `SKILL.md` (see its routing table). Facts here are verified on
> g++-16 / libstdc++ 16 (2026-08); see `SKILL.md` § "Trust boundary".

---

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
  (3) **`define_static_array` demands STRUCTURAL elements, and a
  `std::vector` returned from a helper is itself the transient-allocation
  trap** — verified 2026-09 while writing a member-name printer. The tempting
  shape is a `consteval` helper that collects names and returns the vector:
  ```cpp
  std::vector<std::string_view> names_of() { /* ... */ }   // rejected
  ```
  It fails two ways depending on where it is demanded — as
  `<lambda>() is not a constant expression because it refers to a result of
  'operator new'` (the transient-vector rule, GCC 16.2.0) or, when the vector
  element is a `std::string_view`/`std::string`, on the elements not being
  structural (`basic_string_view::_M_len` is not public). **Fix: do not
  materialize names at all — collect `std::meta::info` (which IS structural)
  and call `identifier_of(m)` / `display_string_of(type_of(m))` inside the
  `template for` body:**
  ```cpp
  template for (constexpr auto m : std::define_static_array(
      std::meta::nonstatic_data_members_of(^^Point, std::meta::access_context::unprivileged())))
    std::println("{}", std::meta::identifier_of(m));
  ```
  Reach for `define_static_array` only over a plain structural element type.
  (Related but distinct: annotation *types* must also be structural AND
  extractable — see `references/annotations-codec.md`.)

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

