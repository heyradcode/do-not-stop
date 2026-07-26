package solana

// Decoder for the on-chain shape the adapter consumes:
//   - PetAccount state (port of backend/indexing/solana/scanner/decode.ts)

import (
	"bytes"
	_ "embed"
	"fmt"
	"strconv"

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
