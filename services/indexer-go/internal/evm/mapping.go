package evm

import (
	"fmt"
	"math/big"
	"strconv"
	"strings"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
)

func (ix *Indexer) toUpdate(pet subgraphPet) (indexer.RosterUpdate, error) {
	readyAt, err := strconv.ParseInt(pet.ReadyAt, 10, 64)
	if err != nil {
		return indexer.RosterUpdate{}, fmt.Errorf("pet %s: invalid readyAt %q: %w", pet.ID, pet.ReadyAt, err)
	}
	updatedAt, err := strconv.ParseUint(pet.UpdatedAt, 10, 64)
	if err != nil {
		return indexer.RosterUpdate{}, fmt.Errorf("pet %s: invalid updatedAt %q: %w", pet.ID, pet.UpdatedAt, err)
	}
	breedReadyAt, err := parseTimeField(pet.BreedReadyAt)
	if err != nil {
		return indexer.RosterUpdate{}, fmt.Errorf("pet %s: invalid breedReadyAt %q: %w", pet.ID, pet.BreedReadyAt, err)
	}
	trainReadyAt, err := parseTimeField(pet.TrainReadyAt)
	if err != nil {
		return indexer.RosterUpdate{}, fmt.Errorf("pet %s: invalid trainReadyAt %q: %w", pet.ID, pet.TrainReadyAt, err)
	}

	return indexer.RosterUpdate{
		Chain:     ix.chain,
		PetID:     pet.ID,
		Owner:     strings.ToLower(pet.Owner), // EVM addresses normalize lowercase
		Name:      pet.Name,
		Level:     pet.Level,
		Rarity:    pet.Rarity,
		DNA:       pet.DNA,
		ReadyAt:   readyAt,
		Version:   updatedAt,

		// WinCount/LossCount stay zero: PetCore stopped carrying a battle record when
		// battles moved off chain (§L Phase 6), so there is nothing on chain to mirror.
		// A pet's real record is the backend's `pet_battle_progress`.
		//
		// v2 fields. EVM has no Metaplex Core asset (ERC-721 token id IS the
		// pet id), so Asset stays empty.
		XP:           pet.XP,
		Generation:   pet.Generation,
		Parent1ID:    idOrZero(pet.Parent1ID),
		Parent2ID:    idOrZero(pet.Parent2ID),
		BreedCount:   pet.BreedCount,
		SpeciesID:    pet.SpeciesID,
		SpouseID:     idOrZero(pet.SpouseID),
		BreedReadyAt: breedReadyAt,
		TrainReadyAt: trainReadyAt,
	}, nil
}

// toItemUpdate converts one ItemBalance row (roadmap §4).
//
// A quantity that does not fit 64 bits is an error rather than a truncation. The
// item id beside it is kept as a string precisely because a uint256 token id can
// be that large, so the asymmetry is a claim: ids are arbitrary, quantities are
// counts of things a player holds, and one that overflows means something is
// wrong upstream rather than that a wider type was needed.
func (ix *Indexer) toItemUpdate(row subgraphItemBalance) (indexer.ItemUpdate, error) {
	quantity, err := strconv.ParseUint(row.Quantity, 10, 64)
	if err != nil {
		return indexer.ItemUpdate{}, fmt.Errorf("item %s: invalid quantity %q: %w", row.ID, row.Quantity, err)
	}
	updatedAt, err := strconv.ParseUint(row.UpdatedAt, 10, 64)
	if err != nil {
		return indexer.ItemUpdate{}, fmt.Errorf("item %s: invalid updatedAt %q: %w", row.ID, row.UpdatedAt, err)
	}

	return indexer.ItemUpdate{
		Chain:    ix.chain,
		Owner:    strings.ToLower(row.Owner), // EVM addresses normalize lowercase
		ItemType: row.ItemType,
		Quantity: quantity,
		Version:  updatedAt,
	}, nil
}

// toEquipmentUpdate converts one PetEquipment row (roadmap §4).
func (ix *Indexer) toEquipmentUpdate(row subgraphPetEquipment) (indexer.EquipmentUpdate, error) {
	updatedAt, err := strconv.ParseUint(row.UpdatedAt, 10, 64)
	if err != nil {
		return indexer.EquipmentUpdate{}, fmt.Errorf("equipment %s: invalid updatedAt %q: %w", row.ID, row.UpdatedAt, err)
	}

	return indexer.EquipmentUpdate{
		Chain:    ix.chain,
		PetID:    row.PetID,
		Slot:     row.Slot,
		ItemType: idOrZero(row.ItemType),
		Version:  updatedAt,
	}, nil
}

// parseTimeField parses a BigInt cooldown string, treating "" (field absent on
// a pre-v2 subgraph) as 0.
func parseTimeField(s string) (int64, error) {
	if s == "" {
		return 0, nil
	}
	return strconv.ParseInt(s, 10, 64)
}

// idOrZero normalizes an optional pet-id string to "0" when the subgraph
// omitted it, matching the on-chain "0 = none" convention.
func idOrZero(s string) string {
	if s == "" {
		return "0"
	}
	return s
}

// normalizeSeed renders the uint256 combat seed as a canonical 0x-prefixed,
// zero-padded 64-char lowercase hex string, matching the Solana adapter's
// hex-encoded [u8;32] so a seed is comparable and replayable across chains.
// Accepts either a decimal BigInt or an already-0x-hex value from the
// subgraph; "" (pre-v2 / absent) stays "".
func normalizeSeed(s string) string {
	if s == "" {
		return ""
	}
	var n *big.Int
	if h, ok := strings.CutPrefix(s, "0x"); ok {
		n, ok = new(big.Int).SetString(h, 16)
		if !ok {
			return s // unparseable — surface as-is rather than drop the seed
		}
	} else {
		var ok bool
		n, ok = new(big.Int).SetString(s, 10)
		if !ok {
			return s
		}
	}
	return fmt.Sprintf("0x%064x", n)
}
