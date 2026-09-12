// reflection-demo — a minimal, known-good, SELF-CONTAINED C++26 program for
// g++-16. No workspace or external dependencies.
//
// Demonstrates (all verified on g++-16 16.1.0, 2026-08):
//   * P2996 static reflection  — <meta>, field-number annotations, member
//     enumeration, annotation reading via define_static_array + scope splice
//   * P2900 contracts          — contract_assert + weak default handler
//   * P1967 #embed             — directive alone on its line; the file must
//     sit next to the source (GCC does not search -I paths for #embed)
//   * std::format / std::println / std::span / std::expected
//   * libstdc++ 16 quirks      — std::saturating_add (NOT std::add_sat)
//   * A minimal self-contained serialize/parse roundtrip built on a
//     compile-time field table (see "Reflection-driven serialization" in the
//     skill) — annotated struct as schema, ascending field numbers, varint
//     wire encoding.
//
// Single-file build:
//   g++-16 -std=c++26 -freflection -O2 -o demo main.cpp && ./demo
// CMake build: see CMakeLists.txt / README.md.

#include <meta>
#include <print>
#include <format>
#include <span>
#include <expected>
#include <numeric>
#include <contracts>
#include <string>
#include <string_view>
#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <utility>
#include <vector>

// ── #embed (P1967): the directive must be alone on its line; GCC does not
//    search -I paths for it — "data.txt" sits next to this source file.
static const unsigned char embedded_bytes[] = {
#embed "data.txt"
};

// ── Contracts (P2900): weak default handler at GLOBAL scope (outside any
//    namespace — the contract machinery references the global symbol).
void handle_contract_violation(std::contracts::contract_violation const& v)
{
  std::print(stderr, "contract violation: {}\n", v.comment());
  std::abort();
}

// ── P2996 reflection: field-number annotations (P3394R4 spelling) ──────────
namespace rpb { template <std::uint32_t N> struct field_no { static constexpr std::uint32_t value = N; }; }

struct Point {
  [[=rpb::field_no<1>{}]] int x{};
  [[=rpb::field_no<2>{}]] int y{};
  bool operator==(Point const&) const = default;
};

template <typename T> struct is_field_no : std::false_type {};
template <std::uint32_t N> struct is_field_no<rpb::field_no<N>> : std::true_type {};

// Number of nonstatic data members. NOTE: call `.size()` directly on the
// call — the returned vector must NOT be bound to a local constexpr first
// (that trips the transient-allocation constraint on GCC 16).
consteval std::size_t member_count()
{
  return std::meta::nonstatic_data_members_of(^^Point,
         std::meta::access_context::unprivileged()).size();
}

// Name of the I-th member (subscript the call directly, same constraint).
template <std::size_t I>
consteval std::string_view member_name()
{
  constexpr std::meta::info m =
      std::meta::nonstatic_data_members_of(^^Point,
      std::meta::access_context::unprivileged())[I];
  return std::meta::identifier_of(m);
}

// Field number of the I-th member, read from its annotations with the codec
// pattern: `template for` over define_static_array + scope splice
// `[: type_of(ann) :]::value`.
template <std::size_t I>
consteval std::uint32_t member_field_no()
{
  constexpr std::meta::info m =
      std::meta::nonstatic_data_members_of(^^Point,
      std::meta::access_context::unprivileged())[I];
  template for (constexpr auto ann :
                std::define_static_array(std::meta::annotations_of(m)))
    {
      using A = std::remove_cvref_t<typename [: std::meta::type_of(ann) :]>;
      if constexpr (is_field_no<A>::value)
        return [: std::meta::type_of(ann) :]::value;
    }
  return 0;
}

// Compile-time field table: field numbers in ascending order, built via
// index_sequence (the robust codec pattern — no `template for` needed on the
// caller side).
template <std::size_t... Is>
consteval std::array<std::uint32_t, sizeof...(Is)>
field_numbers_impl(std::index_sequence<Is...>)
{
  return {{ member_field_no<Is>()... }};
}
constexpr std::array<std::uint32_t, member_count()> field_numbers =
    field_numbers_impl(std::make_index_sequence<member_count()>{});

// ── minimal wire slice: varint + tag ───────────────────────────────────────
// wire_type 0 = varint (int32 encodes sign-extended to 64 bits, like protobuf)
constexpr std::uint32_t wire_type_varint = 0;

void write_varint(std::string& out, std::uint64_t v)
{
  while (v >= 0x80)
    {
      out.push_back(static_cast<char>((v & 0x7F) | 0x80));
      v >>= 7;
    }
  out.push_back(static_cast<char>(v));
}

std::uint64_t read_varint(std::string_view in, std::size_t& pos)
{
  std::uint64_t v = 0;
  int shift = 0;
  while (pos < in.size())
    {
      unsigned char b = static_cast<unsigned char>(in[pos++]);
      v |= std::uint64_t(b & 0x7F) << shift;
      if ((b & 0x80) == 0) return v;
      shift += 7;
    }
  return v;  // truncated input; demo only
}

// Emit the fields in ascending field-number order; each field is a tag
// (field_no << 3 | wire_type) followed by its payload.
std::string serialize_point(Point const& p)
{
  std::string out;
  write_varint(out, (field_numbers[0] << 3) | wire_type_varint);
  write_varint(out, std::uint64_t(std::int64_t(p.x)));
  write_varint(out, (field_numbers[1] << 3) | wire_type_varint);
  write_varint(out, std::uint64_t(std::int64_t(p.y)));
  return out;
}

bool parse_point(std::string_view in, Point& p)
{
  std::size_t pos = 0;
  while (pos < in.size())
    {
      std::uint64_t tag = read_varint(in, pos);
      std::uint32_t field_no = tag >> 3;
      // wire_type = tag & 7; this demo handles varint (0) only
      std::int32_t value = static_cast<std::int32_t>(read_varint(in, pos));
      if (field_no == field_numbers[0]) p.x = value;
      else if (field_no == field_numbers[1]) p.y = value;
      else return false;  // unknown field: demo rejects; production skips
    }
  return true;
}

int main()
{
  // std::print / std::println (<print>) and std::format (<format>)
  std::println("Point has {} data members", member_count());

  // index_sequence gives each member a compile-time index for the consteval
  // helpers (no `template for` needed on the caller side).
  []<std::size_t... Is>(std::index_sequence<Is...>) {
    ((std::println("  member {}: '{}' (field {})", Is, member_name<Is>(),
                   member_field_no<Is>())),
     ...);
  }(std::make_index_sequence<member_count()>{});

  // #embed payload
  std::string_view embedded(reinterpret_cast<const char*>(embedded_bytes),
                            sizeof(embedded_bytes));
  std::println("embedded {} bytes: {}", sizeof(embedded_bytes), embedded);

  // std::span (<span>) — implicit from a C array; range algorithm (<algorithm>)
  int arr[] = {4, 1, 3, 2};
  std::span<int> s(arr);
  std::ranges::sort(s);
  std::println("sorted span: [{}, {}, {}, {}]", s[0], s[1], s[2], s[3]);

  // std::expected (<expected>) — monadic chain
  auto checked = [](int v) -> std::expected<int, std::string> {
    if (v < 0) return std::unexpected("negative");
    return v;
  };
  auto result = checked(5)
                    .and_then([](int v) -> std::expected<int, std::string> {
                      return v * 2;
                    })
                    .transform([](int v) { return v + 1; });
  std::println("expected chain: {}", result.value());

  // P2900 contract
  contract_assert(s.size() == 4);

  // libstdc++ 16 saturating arithmetic: `saturating_add`, NOT `add_sat`
  std::println("saturating_add(200, 100) = {}", std::saturating_add(200, 100));

  // Reflection-driven wire roundtrip: serialize Point -> bytes -> parse back.
  Point p{42, -7};  // negative exercises int32 sign-extension in varint
  std::string wire = serialize_point(p);
  Point q;
  bool ok = parse_point(wire, q);
  std::println("roundtrip: {} ({} bytes, values {}/{})", ok && q == p,
               wire.size(), q.x, q.y);
  return 0;
}
