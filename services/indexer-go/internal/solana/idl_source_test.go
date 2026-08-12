package solana

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// The embedded IDL against the Rust it claims to describe.
//
// idl/cryptopets.json is hand-maintained — Anchor generates one, but this file is edited by
// hand to match — and it drives *positional* Borsh decoding. A field inserted, removed or
// reordered in the program moves every field after it, and the decoder happily reads the
// new bytes at the old offsets. Account version 7 already did exactly that: removing
// `open_to_challenges` and `level_band_width` mid-struct shifted everything from `xp` on.
//
// Two reasons this test exists rather than the instruction to re-diff by hand:
//
//   - No CI job builds Rust. The workflows cover protocol, contracts/ethereum, indexer-go,
//     mobile and the verifier; `anchor build` runs on nobody's machine but a developer's.
//   - The decoder cannot see this class of drift. `fieldReader` fails closed when a field
//     decodes as the wrong *type*, but two same-typed fields exchanged decode cleanly and
//     report the wrong values, as TestDecodePetAccountCannotSeeASameTypeDrift shows.
//
// Reading the struct with a regex is cruder than compiling it, and it catches what matters:
// order, names and widths, which is all that positional decoding depends on.

/** Where the program source lives, relative to this package. */
const rustStateDir = "../../../../contracts/solana/cryptopets/programs/cryptopets/src/state"

var (
	structFieldPattern = regexp.MustCompile(`(?m)^\s*pub (\w+): ([^,]+),`)
	constPattern       = regexp.MustCompile(`(?m)^\s*pub const (\w+): usize = (\d+);`)
	arrayPattern       = regexp.MustCompile(`^\[(\w+); ([^\]]+)\]$`)
)

type rustField struct {
	name string
	typ  string
}

// idlAccountField mirrors the subset of the IDL's field shape this test compares. `Type` is
// either a primitive string ("u32") or an object ({"array": ["u8", 32]}).
type idlAccountField struct {
	Name string          `json:"name"`
	Type json.RawMessage `json:"type"`
}

// readRustStructs returns every `pub struct` in a file, plus the usize consts it declares
// (array lengths are written as constants, so a size comparison needs them resolved).
func readRustStructs(t *testing.T, file string) (map[string][]rustField, map[string]int) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(rustStateDir, file))
	if err != nil {
		t.Fatalf("read %s: %v", file, err)
	}
	source := string(raw)

	consts := map[string]int{}
	for _, match := range constPattern.FindAllStringSubmatch(source, -1) {
		value, err := strconv.Atoi(match[2])
		if err != nil {
			t.Fatalf("const %s: %v", match[1], err)
		}
		consts[match[1]] = value
	}

	structs := map[string][]rustField{}
	for _, part := range strings.Split(source, "pub struct ")[1:] {
		name, rest, found := strings.Cut(part, " {")
		if !found || strings.ContainsAny(name, "(<") {
			continue
		}
		body, _, found := strings.Cut(rest, "\n}")
		if !found {
			continue
		}
		fields := []rustField{}
		for _, match := range structFieldPattern.FindAllStringSubmatch(body, -1) {
			fields = append(fields, rustField{name: match[1], typ: strings.TrimSpace(match[2])})
		}
		structs[name] = fields
	}
	return structs, consts
}

// idlAccountFields returns one account type's declared fields from the embedded IDL.
func idlAccountFields(t *testing.T, account string) []idlAccountField {
	t.Helper()
	var idl struct {
		Types []struct {
			Name string `json:"name"`
			Type struct {
				Fields []idlAccountField `json:"fields"`
			} `json:"type"`
		} `json:"types"`
	}
	if err := json.Unmarshal(idlJSON, &idl); err != nil {
		t.Fatalf("parse embedded IDL: %v", err)
	}
	for _, entry := range idl.Types {
		if entry.Name == account {
			return entry.Type.Fields
		}
	}
	t.Fatalf("account %q is not in the embedded IDL", account)
	return nil
}

// idlName is the field name Anchor emits for a Rust field: snake_case to camelCase, with a
// leading underscore stripped (`_reserved` becomes `reserved`).
func idlName(rust string) string {
	parts := strings.Split(strings.TrimPrefix(rust, "_"), "_")
	out := parts[0]
	for _, part := range parts[1:] {
		if part == "" {
			continue
		}
		out += strings.ToUpper(part[:1]) + part[1:]
	}
	return out
}

// idlTypeOf renders an IDL type as its Rust-side equivalent, so the two can be compared as
// strings: "u32" stays, "pubkey" becomes "Pubkey", {"array":["u8",32]} becomes "[u8; 32]".
func idlTypeOf(t *testing.T, raw json.RawMessage) string {
	t.Helper()
	var primitive string
	if err := json.Unmarshal(raw, &primitive); err == nil {
		if primitive == "pubkey" {
			return "Pubkey"
		}
		return primitive
	}
	var array struct {
		Array []json.RawMessage `json:"array"`
	}
	if err := json.Unmarshal(raw, &array); err != nil || len(array.Array) != 2 {
		t.Fatalf("unsupported IDL type %s", raw)
	}
	var element string
	var length int
	if err := json.Unmarshal(array.Array[0], &element); err != nil {
		t.Fatalf("array element type %s", array.Array[0])
	}
	if err := json.Unmarshal(array.Array[1], &length); err != nil {
		t.Fatalf("array length %s", array.Array[1])
	}
	return "[" + element + "; " + strconv.Itoa(length) + "]"
}

// rustTypeOf renders a Rust field type with any const array length resolved, so
// `[u8; PetAccount::MAX_NAME_LEN]` compares against the IDL's `[u8; 32]`.
func rustTypeOf(t *testing.T, declared string, consts map[string]int) string {
	t.Helper()
	match := arrayPattern.FindStringSubmatch(declared)
	if match == nil {
		return declared
	}
	length := match[2]
	if literal, err := strconv.Atoi(length); err == nil {
		return "[" + match[1] + "; " + strconv.Itoa(literal) + "]"
	}
	// `Type::CONST` or a bare `CONST`.
	name := length
	if _, after, found := strings.Cut(length, "::"); found {
		name = after
	}
	value, ok := consts[name]
	if !ok {
		t.Fatalf("array length %q is not a literal and no matching usize const was found", length)
	}
	return "[" + match[1] + "; " + strconv.Itoa(value) + "]"
}

func assertLayoutMatches(t *testing.T, account, file string) {
	t.Helper()
	structs, consts := readRustStructs(t, file)
	fields, ok := structs[account]
	if !ok {
		t.Fatalf("struct %s not found in %s", account, file)
	}
	declared := idlAccountFields(t, account)

	if len(fields) != len(declared) {
		t.Fatalf("%s: Rust has %d fields, the IDL declares %d — the IDL is stale, re-diff it against `anchor build`",
			account, len(fields), len(declared))
	}
	for i, field := range fields {
		if got, want := declared[i].Name, idlName(field.name); got != want {
			t.Errorf("%s field %d: IDL says %q, Rust says %q (as %q). Every field from here on decodes at the wrong offset",
				account, i, got, field.name, want)
		}
		if got, want := idlTypeOf(t, declared[i].Type), rustTypeOf(t, field.typ, consts); got != want {
			t.Errorf("%s field %d (%s): IDL type %s, Rust type %s", account, i, field.name, got, want)
		}
	}
}

// Every account the decoders in this package read. An account missing here is one whose
// drift nothing would notice.
func TestEmbeddedIdlMatchesTheProgramSource(t *testing.T) {
	for _, tc := range []struct{ account, file string }{
		{"PetAccount", "pet.rs"},
		{"ItemBalance", "item.rs"},
		{"PetEquipment", "item.rs"},
		{"ItemSlot", "item.rs"},
	} {
		t.Run(tc.account, func(t *testing.T) {
			assertLayoutMatches(t, tc.account, tc.file)
		})
	}
}
