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

// buildPetAccount serializes a PetAccount exactly as the on-chain program
// does: 8-byte discriminator + Borsh body in IDL field order.
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
	buf.WriteByte(7) // bump
	var nameBuf [32]byte
	copy(nameBuf[:], name)
	buf.Write(nameBuf[:])
	buf.WriteByte(uint8(len(name)))

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
	// nameLen past the fixed buffer.
	overflow := bytes.Clone(valid)
	overflow[len(overflow)-1] = 33
	if _, ok := decodePetAccount(layout, overflow); ok {
		t.Error("accepted nameLen > buffer")
	}
}

func buildBattleLog(attacker, defender uint32, attackerWon bool) string {
	raw := make([]byte, 17)
	copy(raw, battleResultDiscriminator)
	binary.LittleEndian.PutUint32(raw[8:], attacker)
	binary.LittleEndian.PutUint32(raw[12:], defender)
	if attackerWon {
		raw[16] = 1
	}
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
	if results[0].AttackerPetID != 7 || results[0].DefenderPetID != 9 || !results[0].AttackerWon {
		t.Errorf("first result: %+v", results[0])
	}

	event := results[1].toBattleEvent("sig123", 555, 1770000300)
	if event.WinnerPetID != "5" {
		t.Errorf("defender won: winner = %s, want 5", event.WinnerPetID)
	}
	if event.Chain != "solana" || event.BattleID != "sig123" || event.Attacker != "3" ||
		event.Defender != "5" || event.Version != 555 || event.FoughtAt != 1770000300 {
		t.Errorf("event mapping: %+v", event)
	}
}
