package solana

// Decoder for the on-chain shape the adapter consumes:
//   - PetAccount state (port of backend/indexing/solana/scanner/decode.ts)

import (
	"bytes"
	_ "embed"
	"fmt"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
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

	r := newFieldReader(fields)

	nameBuf := r.bytes("name")
	nameLen := r.u64("nameLen")
	// A name length past the fixed buffer means the layout drifted — bail
	// rather than emit a garbage name. Checked before the slice, and only once
	// the two reads above are known to have found their fields.
	if !r.ok() || int(nameLen) > len(nameBuf) {
		return indexer.RosterUpdate{}, false
	}

	update := indexer.RosterUpdate{
		Chain:     "solana",
		PetID:     r.decimal("id"),
		Owner:     r.str("owner"), // base58, no normalization for Solana
		Name:      string(nameBuf[:nameLen]),
		Level:     r.u32("level"),
		Rarity:    r.u32("rarity"),
		DNA:       r.decimal("dna"),
		WinCount:  r.u32("winCount"),
		LossCount: r.u32("lossCount"),
		ReadyAt:   r.i64("readyTime"),

		// v2 fields (state.rs PetAccount). Decoded by IDL name; "0"/0 zero
		// values mean none, matching the on-chain semantics.
		XP:           r.u32("xp"),
		Generation:   r.u32("generation"),
		Parent1ID:    r.decimal("parent1Id"),
		Parent2ID:    r.decimal("parent2Id"),
		BreedCount:   r.u32("breedCount"),
		SpeciesID:    r.u32("speciesId"),
		SpouseID:     r.decimal("spouseId"),
		BreedReadyAt: r.i64("breedReadyTime"),
		TrainReadyAt: r.i64("trainReadyTime"),
		Asset:        r.str("asset"), // base58 Core asset pubkey
	}

	// One check for the whole struct. A field decoded as the wrong type means the IDL and
	// the on-chain account disagree, which is what an account-version bump does; that has
	// to read as "not this account" rather than take the process down mid-subscription.
	if !r.ok() {
		return indexer.RosterUpdate{}, false
	}
	return update, true
}
