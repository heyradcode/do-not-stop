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
	"encoding/hex"
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

		// v2 fields (state.rs PetAccount). Decoded by IDL name; "0"/0 zero
		// values mean none, matching the on-chain semantics.
		XP:           uint32(fields["xp"].(uint64)),
		Generation:   uint32(fields["generation"].(uint64)),
		Parent1ID:    strconv.FormatUint(fields["parent1Id"].(uint64), 10),
		Parent2ID:    strconv.FormatUint(fields["parent2Id"].(uint64), 10),
		BreedCount:   uint32(fields["breedCount"].(uint64)),
		SpeciesID:    uint32(fields["speciesId"].(uint64)),
		SpouseID:     strconv.FormatUint(fields["spouseId"].(uint64), 10),
		BreedReadyAt: fields["breedReadyTime"].(int64),
		TrainReadyAt: fields["trainReadyTime"].(int64),
		Asset:        fields["asset"].(string), // base58 Core asset pubkey
	}, true
}

// battleResolved mirrors the v2 BattleResolved Anchor event
// (settle_battle.rs). The winner/loser ids are absolute (resolved on-chain),
// and the seed makes the round-based sim replayable off-chain.
type battleResolved struct {
	AttackerPetID     uint32
	DefenderPetID     uint32
	WinnerPetID       uint32
	LoserPetID        uint32
	Seed              [32]byte
	FirstWins         bool
	Rounds            uint8
	WinnerHpRemaining uint16
	XPWin             uint32
	XPLoss            uint32
}

// battleResolvedBodyLen is the Borsh body length (excluding the 8-byte
// discriminator): 4+4+4+4+32+1+1+2+4+4.
const battleResolvedBodyLen = 60

// Anchor event discriminator: sha256("event:BattleResolved")[:8].
var battleResolvedDiscriminator = func() []byte {
	sum := sha256.Sum256([]byte("event:BattleResolved"))
	return sum[:8]
}()

const programDataPrefix = "Program data: "

// parseBattleResults extracts every BattleResolved event from a transaction's
// log messages. Anchor emits events as base64 `Program data:` lines holding
// an 8-byte event discriminator + Borsh body; other events and undecodable
// lines are skipped.
func parseBattleResults(logs []string) []battleResolved {
	var results []battleResolved
	for _, line := range logs {
		payload, found := strings.CutPrefix(line, programDataPrefix)
		if !found {
			continue
		}
		raw, err := base64.StdEncoding.DecodeString(payload)
		if err != nil || len(raw) != 8+battleResolvedBodyLen {
			continue
		}
		if !bytes.Equal(raw[:8], battleResolvedDiscriminator) {
			continue
		}
		b := raw[8:]
		var r battleResolved
		r.AttackerPetID = binary.LittleEndian.Uint32(b[0:4])
		r.DefenderPetID = binary.LittleEndian.Uint32(b[4:8])
		r.WinnerPetID = binary.LittleEndian.Uint32(b[8:12])
		r.LoserPetID = binary.LittleEndian.Uint32(b[12:16])
		copy(r.Seed[:], b[16:48])
		r.FirstWins = b[48] != 0
		r.Rounds = b[49]
		r.WinnerHpRemaining = binary.LittleEndian.Uint16(b[50:52])
		r.XPWin = binary.LittleEndian.Uint32(b[52:56])
		r.XPLoss = binary.LittleEndian.Uint32(b[56:60])
		results = append(results, r)
	}
	return results
}

// toBattleEvent maps an on-chain result to the pipeline shape. Winner/loser
// are already absolute pet ids on-chain (matching battle_history semantics).
func (r battleResolved) toBattleEvent(signature string, slot uint64, foughtAt int64) indexer.BattleEvent {
	return indexer.BattleEvent{
		Chain:             "solana",
		BattleID:          signature,
		Attacker:          strconv.FormatUint(uint64(r.AttackerPetID), 10),
		Defender:          strconv.FormatUint(uint64(r.DefenderPetID), 10),
		WinnerPetID:       strconv.FormatUint(uint64(r.WinnerPetID), 10),
		LoserPetID:        strconv.FormatUint(uint64(r.LoserPetID), 10),
		Seed:              "0x" + hex.EncodeToString(r.Seed[:]),
		Rounds:            uint32(r.Rounds),
		WinnerHpRemaining: uint32(r.WinnerHpRemaining),
		XPWin:             r.XPWin,
		XPLoss:            r.XPLoss,
		Version:           slot,
		FoughtAt:          foughtAt,
	}
}
