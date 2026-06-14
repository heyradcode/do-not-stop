package solana

import (
	"bytes"
	"encoding/base64"
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
	fxOpenToChallenges = true
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
	// v2 fields, in struct order.
	writeBool(&buf, fxOpenToChallenges)
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

func writeBool(buf *bytes.Buffer, v bool) {
	if v {
		buf.WriteByte(1)
		return
	}
	buf.WriteByte(0)
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

// buildBattleLog serializes a BattleResolved event as the on-chain program
// emits it: 8-byte discriminator + Borsh body. attackerWon picks which pet id
// fills the winner/loser slots (the chain resolves these absolutely).
func buildBattleLog(attacker, defender uint32, attackerWon bool) string {
	winner, loser := defender, attacker
	if attackerWon {
		winner, loser = attacker, defender
	}
	raw := make([]byte, 8+battleResolvedBodyLen)
	copy(raw, battleResolvedDiscriminator)
	b := raw[8:]
	binary.LittleEndian.PutUint32(b[0:4], attacker)
	binary.LittleEndian.PutUint32(b[4:8], defender)
	binary.LittleEndian.PutUint32(b[8:12], winner)
	binary.LittleEndian.PutUint32(b[12:16], loser)
	for i := range 32 { // distinctive seed: 0x00010203...
		b[16+i] = byte(i)
	}
	if attackerWon {
		b[48] = 1 // firstWins
	}
	b[49] = 6                                    // rounds
	binary.LittleEndian.PutUint16(b[50:52], 174) // winnerHpRemaining
	binary.LittleEndian.PutUint32(b[52:56], 100) // xpWin
	binary.LittleEndian.PutUint32(b[56:60], 25)  // xpLoss
	return programDataPrefix + base64.StdEncoding.EncodeToString(raw)
}

func TestParseBattleResults(t *testing.T) {
	logs := []string{
		"Program 78AXV46ks5oFoJHkukvbsfZTJixdj2MeStzuC6thiUry invoke [1]",
		"Program log: Instruction: SettleBattle",
		buildBattleLog(7, 9, true),
		programDataPrefix + "bm90LWFuLWV2ZW50", // valid b64, wrong shape — skipped
		"Program data: %%%not-base64%%%",       // undecodable — skipped
		buildBattleLog(3, 5, false),
	}

	results := parseBattleResults(logs)
	if len(results) != 2 {
		t.Fatalf("parsed %d results, want 2", len(results))
	}
	if results[0].AttackerPetID != 7 || results[0].DefenderPetID != 9 ||
		results[0].WinnerPetID != 7 || results[0].LoserPetID != 9 || !results[0].FirstWins {
		t.Errorf("first result: %+v", results[0])
	}
	if results[0].Rounds != 6 || results[0].WinnerHpRemaining != 174 ||
		results[0].XPWin != 100 || results[0].XPLoss != 25 {
		t.Errorf("first result sim fields: %+v", results[0])
	}

	event := results[1].toBattleEvent("sig123", 555, 1770000300)
	if event.WinnerPetID != "5" || event.LoserPetID != "3" {
		t.Errorf("defender won: winner=%s loser=%s, want 5/3", event.WinnerPetID, event.LoserPetID)
	}
	if event.Seed != "0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f" {
		t.Errorf("seed = %q", event.Seed)
	}
	if event.Chain != "solana" || event.BattleID != "sig123" || event.Attacker != "3" ||
		event.Defender != "5" || event.Version != 555 || event.FoughtAt != 1770000300 {
		t.Errorf("event mapping: %+v", event)
	}
}
