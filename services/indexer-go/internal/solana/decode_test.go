package solana

import (
	"bytes"
	"encoding/binary"
	"testing"
)

func TestBase58Encode(t *testing.T) {
	cases := []struct {
		in   []byte
		want string
	}{
		{nil, ""},
		{[]byte{0}, "1"},
		{[]byte{0, 0, 1}, "112"},
		{[]byte("abc"), "ZiCa"},
		{make([]byte, 32), "11111111111111111111111111111111"}, // system program
	}
	for _, c := range cases {
		if got := base58Encode(c.in); got != c.want {
			t.Errorf("base58Encode(%v) = %q, want %q", c.in, got, c.want)
		}
	}
}

// Fixed v2 field values the builder writes and TestDecodePetAccount asserts.
// They exercise every new field added in the v2 PetAccount layout.
const (
	fxVersion          = 2
	fxBump             = 7
	fxXP               = 250
	fxLastOpponentID   = 17
	fxSameOpponentStrk = 1
	fxGeneration       = 4
	fxParent1ID        = 40
	fxParent2ID        = 41
	fxBreedCount       = 2
	fxBreedReadyTime   = 1770000111
	fxTrainReadyTime   = 1770000222
	fxSpeciesID        = 33
	fxSpouseID         = 99
	fxMarriageCooldown = 0
)

// buildPetAccount serializes a PetAccount exactly as the on-chain program
// does: 8-byte discriminator + Borsh body in IDL field order. v1 fields are
// parameters; the v2 fields use the fixed fx* values above.
func buildPetAccount(t *testing.T, id uint32, owner [32]byte, dna uint64, rarity uint8,
	level uint16, readyTime int64, win, loss uint16, name string) []byte {
	t.Helper()
	layout, err := resolvePetLayout()
	if err != nil {
		t.Fatalf("resolve layout: %v", err)
	}

	var buf bytes.Buffer
	buf.Write(layout.discriminator)
	_ = binary.Write(&buf, binary.LittleEndian, id)
	buf.Write(owner[:])
	_ = binary.Write(&buf, binary.LittleEndian, dna)
	buf.WriteByte(rarity)
	_ = binary.Write(&buf, binary.LittleEndian, level)
	_ = binary.Write(&buf, binary.LittleEndian, readyTime)
	_ = binary.Write(&buf, binary.LittleEndian, win)
	_ = binary.Write(&buf, binary.LittleEndian, loss)
	buf.WriteByte(fxVersion)
	buf.WriteByte(fxBump)
	var nameBuf [32]byte
	copy(nameBuf[:], name)
	buf.Write(nameBuf[:])
	buf.WriteByte(uint8(len(name)))
	// v2 fields, in struct order. No open_to_challenges byte: the flag was removed with
	// the on-chain battle path (§L Phase 6), so writing one here would shift every field
	// after it and silently misalign the decode.
	_ = binary.Write(&buf, binary.LittleEndian, uint32(fxXP))
	_ = binary.Write(&buf, binary.LittleEndian, uint32(fxLastOpponentID))
	buf.WriteByte(fxSameOpponentStrk)
	buf.WriteByte(fxGeneration)
	_ = binary.Write(&buf, binary.LittleEndian, uint32(fxParent1ID))
	_ = binary.Write(&buf, binary.LittleEndian, uint32(fxParent2ID))
	buf.WriteByte(fxBreedCount)
	_ = binary.Write(&buf, binary.LittleEndian, int64(fxBreedReadyTime))
	_ = binary.Write(&buf, binary.LittleEndian, int64(fxTrainReadyTime))
	_ = binary.Write(&buf, binary.LittleEndian, uint16(fxSpeciesID))
	_ = binary.Write(&buf, binary.LittleEndian, uint32(fxSpouseID))
	buf.Write(owner[:]) // marriageOwnerSnapshot
	_ = binary.Write(&buf, binary.LittleEndian, int64(fxMarriageCooldown))
	buf.Write(owner[:])        // asset
	buf.Write(make([]byte, 8)) // _reserved

	data := buf.Bytes()
	if len(data) != layout.totalLen() {
		t.Fatalf("fixture is %d bytes, layout says %d", len(data), layout.totalLen())
	}
	return data
}

func TestDecodePetAccount(t *testing.T) {
	layout, err := resolvePetLayout()
	if err != nil {
		t.Fatalf("resolve layout: %v", err)
	}

	var owner [32]byte // all zeros → system program base58
	data := buildPetAccount(t, 42, owner, 987654321, 3, 12, 1770000000, 9, 4, "Sparky")

	update, ok := decodePetAccount(layout, data)
	if !ok {
		t.Fatal("decode failed on valid PetAccount")
	}
	if update.Chain != "solana" || update.PetID != "42" {
		t.Errorf("id mapping: %+v", update)
	}
	if update.Owner != "11111111111111111111111111111111" {
		t.Errorf("owner = %q", update.Owner)
	}
	if update.Name != "Sparky" {
		t.Errorf("name = %q, want Sparky (truncated to nameLen)", update.Name)
	}
	if update.DNA != "987654321" || update.Rarity != 3 || update.Level != 12 ||
		update.WinCount != 9 || update.LossCount != 4 || update.ReadyAt != 1770000000 {
		t.Errorf("field mapping: %+v", update)
	}
	if update.Version != 0 {
		t.Errorf("version should be unset by decode, got %d", update.Version)
	}

	// v2 fields decode in their Borsh order off the new layout.
	if update.XP != fxXP || update.Generation != fxGeneration || update.BreedCount != fxBreedCount ||
		update.SpeciesID != fxSpeciesID {
		t.Errorf("v2 scalar mapping: %+v", update)
	}
	if update.Parent1ID != "40" || update.Parent2ID != "41" || update.SpouseID != "99" {
		t.Errorf("v2 lineage/marriage ids: p1=%s p2=%s spouse=%s", update.Parent1ID, update.Parent2ID, update.SpouseID)
	}
	if update.BreedReadyAt != fxBreedReadyTime || update.TrainReadyAt != fxTrainReadyTime {
		t.Errorf("v2 cooldowns: breed=%d train=%d", update.BreedReadyAt, update.TrainReadyAt)
	}
	// owner is all-zero in this fixture, so the Core asset pubkey base58 matches.
	if update.Asset != "11111111111111111111111111111111" {
		t.Errorf("asset = %q, want system-program base58 (all-zero fixture)", update.Asset)
	}
}

func TestDecodePetAccountRejectsBadInput(t *testing.T) {
	layout, err := resolvePetLayout()
	if err != nil {
		t.Fatalf("resolve layout: %v", err)
	}
	var owner [32]byte
	valid := buildPetAccount(t, 1, owner, 1, 1, 1, 1, 0, 0, "x")

	// Wrong length.
	if _, ok := decodePetAccount(layout, valid[:len(valid)-1]); ok {
		t.Error("accepted truncated data")
	}
	// Wrong discriminator.
	tampered := bytes.Clone(valid)
	tampered[0] ^= 0xFF
	if _, ok := decodePetAccount(layout, tampered); ok {
		t.Error("accepted wrong discriminator")
	}
	// nameLen past the fixed buffer. nameLen is no longer the last byte in the
	// v2 layout, so locate it from the field offsets.
	overflow := bytes.Clone(valid)
	overflow[fieldDataOffset(t, "nameLen")] = 33
	if _, ok := decodePetAccount(layout, overflow); ok {
		t.Error("accepted nameLen > buffer")
	}
}

// fieldDataOffset returns the byte offset of a field within the full account
// data (including the 8-byte discriminator), summing the sizes of all
// preceding fields in the resolved layout.
func fieldDataOffset(t *testing.T, name string) int {
	t.Helper()
	layout, err := resolvePetLayout()
	if err != nil {
		t.Fatalf("resolve layout: %v", err)
	}
	offset := 8
	for _, f := range layout.fields {
		if f.Name == name {
			return offset
		}
		size, err := sizeOf(f.Type)
		if err != nil {
			t.Fatalf("sizeOf %s: %v", f.Name, err)
		}
		offset += size
	}
	t.Fatalf("field %q not found in layout", name)
	return 0
}


// retypeLayoutField returns a copy of a layout with one field's declared type replaced.
// Only useful for a same-sized type, which keeps bodySize and every offset identical — the
// case where nothing but the field read itself can notice.
func retypeLayoutField(t *testing.T, layout *accountLayout, name string, typ idlType) *accountLayout {
	t.Helper()
	fields := append([]idlField(nil), layout.fields...)
	found := false
	for i := range fields {
		if fields[i].Name == name {
			fields[i].Type = typ
			found = true
		}
	}
	if !found {
		t.Fatalf("field %q not present in layout", name)
	}
	return &accountLayout{
		discriminator:    layout.discriminator,
		discriminatorB58: layout.discriminatorB58,
		bodySize:         layout.bodySize,
		fields:           fields,
	}
}

// A drifted IDL is what an account-version bump produces when idl/cryptopets.json is not
// re-diffed against what `anchor build` generates. The length and the discriminator still
// match, so nothing before the field reads catches it.
//
// This covers the half that is *detectable*: a field whose decoded Go type no longer
// matches what the decoder asks for. `readyTime` is i64 on chain and the decoder reads it
// as one; declaring it u64 is eight bytes either way, so every offset survives and only the
// read disagrees. The old decoder asserted types bare, so this panicked on the subscription
// goroutine and took the process with it. It now answers the way a bad discriminator does.
func TestDecodePetAccountRejectsADriftedLayout(t *testing.T) {
	layout, err := resolvePetLayout()
	if err != nil {
		t.Fatalf("resolve layout: %v", err)
	}
	var owner [32]byte
	data := buildPetAccount(t, 1, owner, 1, 1, 1, 1, 0, 0, "x")

	drifted := retypeLayoutField(t, layout, "readyTime", idlType{Primitive: "u64"})

	// The assertion that matters is that this returns at all rather than panicking.
	if _, ok := decodePetAccount(drifted, data); ok {
		t.Error("accepted a layout whose field types do not match the account")
	}
}

// The other half, stated so nobody mistakes the test above for full coverage: a drift that
// keeps every type the same is *not* detectable here. Two u32 fields exchanged decode
// cleanly and simply report the wrong values. Only re-diffing the IDL against `anchor build`
// catches that, which is why CLAUDE.md asks for it rather than trusting this decoder to
// notice.
func TestDecodePetAccountCannotSeeASameTypeDrift(t *testing.T) {
	layout, err := resolvePetLayout()
	if err != nil {
		t.Fatalf("resolve layout: %v", err)
	}
	var owner [32]byte
	data := buildPetAccount(t, 1, owner, 1, 1, 1, 1, 0, 0, "x")

	fields := append([]idlField(nil), layout.fields...)
	p1, p2 := -1, -1
	for i, f := range fields {
		switch f.Name {
		case "parent1Id":
			p1 = i
		case "parent2Id":
			p2 = i
		}
	}
	if p1 < 0 || p2 < 0 {
		t.Fatal("fixture assumes parent1Id and parent2Id are both present")
	}
	fields[p1].Name, fields[p2].Name = fields[p2].Name, fields[p1].Name
	drifted := &accountLayout{
		discriminator:    layout.discriminator,
		discriminatorB58: layout.discriminatorB58,
		bodySize:         layout.bodySize,
		fields:           fields,
	}

	update, ok := decodePetAccount(drifted, data)
	if !ok {
		t.Fatal("expected a same-type drift to decode; if this now fails, the guarantee got stronger")
	}
	// 40 and 41 in the fixture, reported the wrong way round and silently.
	if update.Parent1ID != "41" || update.Parent2ID != "40" {
		t.Errorf("expected the swapped lineage, got p1=%s p2=%s", update.Parent1ID, update.Parent2ID)
	}
}
