package solana

// The inventory half of the Solana adapter (roadmap §4): item balances and pet
// equipment, decoded from the same accounts the roster comes from.
//
// Unlike the EVM side there is no subgraph and no watermark query. Solana
// accounts arrive by subscription and backfill, so "what changed" is the slot
// the account was seen at, and that slot is the version guard. The store's
// monotonic last_version check then does the same job it does for the roster:
// an older slot loses.
//
// Nothing here is ever deleted. A spent stack decodes as quantity 0 and an
// emptied slot as item type "0", because a reader resuming from a watermark
// cannot see a deletion — the same rule the EVM projection and the on-chain
// accounts both follow. Zero is a value, not an absence.

import (
	"bytes"
	"fmt"
	"strconv"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
)

// Slot count, mirroring SLOT_COUNT in state/item.rs. A PetEquipment account
// whose slots array is a different length means the layout drifted.
const equipSlotCount = 3

func resolveItemBalanceLayout() (*accountLayout, error) {
	layout, err := resolveAccountLayout(idlJSON, "ItemBalance")
	if err != nil {
		return nil, fmt.Errorf("solana: embedded IDL invalid: %w", err)
	}
	return layout, nil
}

func resolvePetEquipmentLayout() (*accountLayout, error) {
	layout, err := resolveAccountLayout(idlJSON, "PetEquipment")
	if err != nil {
		return nil, fmt.Errorf("solana: embedded IDL invalid: %w", err)
	}
	return layout, nil
}

// decodeItemBalance decodes raw account data (including the 8-byte
// discriminator) into an ItemUpdate with Version unset — the caller stamps the
// slot. Returns ok=false when the bytes are not an ItemBalance, so callers can
// pass any account a transaction touched and keep only the ones that decode.
func decodeItemBalance(layout *accountLayout, data []byte) (indexer.ItemUpdate, bool) {
	fields, ok := decodeAccount(layout, data)
	if !ok {
		return indexer.ItemUpdate{}, false
	}

	r := newFieldReader(fields)
	update := indexer.ItemUpdate{
		Chain: "solana",
		// base58, unnormalized: lowercasing it would be a different pubkey, not a
		// different spelling of the same one.
		Owner:    r.str("owner"),
		ItemType: r.decimal("itemType"),
		Quantity: r.u64("quantity"),
	}
	if !r.ok() {
		return indexer.ItemUpdate{}, false
	}
	return update, true
}

// decodePetEquipment decodes one PetEquipment account into one update per slot.
//
// Per slot rather than per account, because pet_equipment is keyed by (chain,
// pet_id, slot): the on-chain account holds all three together and the
// projection holds them apart. Empty slots are emitted too — an unequip is a
// write of "0", and dropping it would leave the projection asserting gear the
// chain no longer says is there.
func decodePetEquipment(layout *accountLayout, data []byte) ([]indexer.EquipmentUpdate, bool) {
	fields, ok := decodeAccount(layout, data)
	if !ok {
		return nil, false
	}

	slots, ok := fields["slots"].([]any)
	if !ok || len(slots) != equipSlotCount {
		return nil, false
	}

	// The NUMERIC pet id, not the Core asset the account is seeded by.
	//
	// pet_equipment is joined to pet_roster on pet_id, and decodePetAccount
	// records the numeric id there. Emitting the asset instead would match no
	// roster row, so a geared pet would resolve to no equipment and fight bare
	// — and nothing would error, because zero rows is also what an ungeared pet
	// looks like. The account carries the id as a field for exactly this.
	r := newFieldReader(fields)
	petID := r.decimal("petId")
	if !r.ok() {
		return nil, false
	}

	updates := make([]indexer.EquipmentUpdate, 0, equipSlotCount)
	for slot, raw := range slots {
		itemType, ok := raw.(uint64)
		if !ok {
			return nil, false
		}
		updates = append(updates, indexer.EquipmentUpdate{
			Chain:    "solana",
			PetID:    petID,
			Slot:     uint32(slot),
			ItemType: strconv.FormatUint(itemType, 10),
		})
	}
	return updates, true
}

// decodeAccount is the shared preamble: length, discriminator, then fields.
//
// Length is checked exactly rather than as a minimum. An account longer than
// the layout is not this type with trailing data, it is a different type whose
// discriminator happened to match, and decoding it would emit plausible
// nonsense.
func decodeAccount(layout *accountLayout, data []byte) (map[string]any, bool) {
	if len(data) != layout.totalLen() {
		return nil, false
	}
	if !bytes.Equal(data[:8], layout.discriminator) {
		return nil, false
	}
	fields, err := decodeStruct(layout.fields, data[8:])
	if err != nil {
		return nil, false
	}
	return fields, true
}
