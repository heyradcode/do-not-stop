package solana

// Decoders for the two on-chain shapes the adapter consumes:
//   - PetAccount state (port of backend/indexing/solana/scanner/decode.ts)
//   - the BattleResult Anchor event emitted by settle_battle
//     (contracts/solana/.../instructions/settle_battle.rs)

import (
	"bytes"
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"strconv"
	"strings"

	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
)

//go:embed idl/cryptopets.json
var idlJSON []byte

func resolvePetLayout() (*accountLayout, error) {
	layout, err := resolveAccountLayout(idlJSON, "PetAccount")
	if err != nil {
		return nil, fmt.Errorf("solana: embedded IDL invalid: %w", err)
	}
	return layout, nil
}

// decodePetAccount decodes raw account data (including the 8-byte
// discriminator) into a RosterUpdate with Version unset — the caller stamps
// the slot. Returns ok=false when the bytes are not a PetAccount, so callers
// can pass any account a transaction touched and keep only the ones that
// decode.
func decodePetAccount(layout *accountLayout, data []byte) (indexer.RosterUpdate, bool) {
	if len(data) != layout.totalLen() {
		return indexer.RosterUpdate{}, false
	}
	if !bytes.Equal(data[:8], layout.discriminator) {
		return indexer.RosterUpdate{}, false
	}

	fields, err := decodeStruct(layout.fields, data[8:])
	if err != nil {
		return indexer.RosterUpdate{}, false
	}

	nameBuf, _ := fields["name"].([]byte)
	nameLen, _ := fields["nameLen"].(uint64)
	// A name length past the fixed buffer means the layout drifted — bail
	// rather than emit a garbage name.
	if int(nameLen) > len(nameBuf) {
		return indexer.RosterUpdate{}, false
	}

	return indexer.RosterUpdate{
		Chain:     "solana",
		PetID:     strconv.FormatUint(fields["id"].(uint64), 10),
		Owner:     fields["owner"].(string), // base58, no normalization for Solana
		Name:      string(nameBuf[:nameLen]),
		Level:     uint32(fields["level"].(uint64)),
		Rarity:    uint32(fields["rarity"].(uint64)),
		DNA:       strconv.FormatUint(fields["dna"].(uint64), 10),
		WinCount:  uint32(fields["winCount"].(uint64)),
		LossCount: uint32(fields["lossCount"].(uint64)),
		ReadyAt:   fields["readyTime"].(int64),
	}, true
}

// battleResult mirrors the BattleResult Anchor event.
type battleResult struct {
	AttackerPetID uint32
	DefenderPetID uint32
	AttackerWon   bool
}

// Anchor event discriminator: sha256("event:BattleResult")[:8].
var battleResultDiscriminator = func() []byte {
	sum := sha256.Sum256([]byte("event:BattleResult"))
	return sum[:8]
}()

const programDataPrefix = "Program data: "

// parseBattleResults extracts every BattleResult event from a transaction's
// log messages. Anchor emits events as base64 `Program data:` lines holding
// an 8-byte event discriminator + Borsh body; other events and undecodable
// lines are skipped.
func parseBattleResults(logs []string) []battleResult {
	var results []battleResult
	for _, line := range logs {
		payload, found := strings.CutPrefix(line, programDataPrefix)
		if !found {
			continue
		}
		raw, err := base64.StdEncoding.DecodeString(payload)
		if err != nil || len(raw) != 8+4+4+1 {
			continue
		}
		if !bytes.Equal(raw[:8], battleResultDiscriminator) {
			continue
		}
		results = append(results, battleResult{
			AttackerPetID: binary.LittleEndian.Uint32(raw[8:12]),
			DefenderPetID: binary.LittleEndian.Uint32(raw[12:16]),
			AttackerWon:   raw[16] != 0,
		})
	}
	return results
}

// toBattleEvent maps an on-chain result to the pipeline shape, resolving the
// winner role to the absolute pet id (matching battle_history semantics).
func (r battleResult) toBattleEvent(signature string, slot uint64, foughtAt int64) indexer.BattleEvent {
	winner := r.DefenderPetID
	if r.AttackerWon {
		winner = r.AttackerPetID
	}
	return indexer.BattleEvent{
		Chain:       "solana",
		BattleID:    signature,
		Attacker:    strconv.FormatUint(uint64(r.AttackerPetID), 10),
		Defender:    strconv.FormatUint(uint64(r.DefenderPetID), 10),
		WinnerPetID: strconv.FormatUint(uint64(winner), 10),
		Version:     slot,
		FoughtAt:    foughtAt,
	}
}
