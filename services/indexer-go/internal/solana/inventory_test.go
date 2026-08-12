package solana

import (
	"encoding/binary"
	"testing"
)

// Serializers that write exactly what the on-chain program does: 8-byte
// discriminator plus a Borsh body in IDL field order.
//
// Hand-built rather than captured from a validator, for the same reason the
// PetAccount fixtures are: the point is to pin the layout the IDL claims, so a
// fixture produced by the same IDL would prove nothing.

func buildItemBalance(t *testing.T, owner [32]byte, itemType, quantity uint64) []byte {
	t.Helper()
	layout, err := resolveItemBalanceLayout()
	if err != nil {
		t.Fatalf("resolveItemBalanceLayout: %v", err)
	}

	buf := make([]byte, 0, layout.totalLen())
	buf = append(buf, layout.discriminator...)
	buf = append(buf, owner[:]...)
	buf = binary.LittleEndian.AppendUint64(buf, itemType)
	buf = binary.LittleEndian.AppendUint64(buf, quantity)
	buf = append(buf, 7 /* version */, 3 /* bump */)
	return buf
}

func buildPetEquipment(t *testing.T, asset [32]byte, slots [3]uint64) []byte {
	t.Helper()
	layout, err := resolvePetEquipmentLayout()
	if err != nil {
		t.Fatalf("resolvePetEquipmentLayout: %v", err)
	}

	buf := make([]byte, 0, layout.totalLen())
	buf = append(buf, layout.discriminator...)
	buf = append(buf, asset[:]...)
	for _, itemType := range slots {
		buf = binary.LittleEndian.AppendUint64(buf, itemType)
	}
	buf = append(buf, 7 /* version */, 3 /* bump */)
	return buf
}

func TestDecodeItemBalance(t *testing.T) {
	layout, err := resolveItemBalanceLayout()
	if err != nil {
		t.Fatalf("resolveItemBalanceLayout: %v", err)
	}

	var owner [32]byte
	owner[0] = 0xAB
	update, ok := decodeItemBalance(layout, buildItemBalance(t, owner, 11, 42))
	if !ok {
		t.Fatal("decodeItemBalance returned ok=false for a valid account")
	}

	if update.Chain != "solana" {
		t.Errorf("chain = %q, want solana", update.Chain)
	}
	if update.ItemType != "11" {
		t.Errorf("itemType = %q, want 11", update.ItemType)
	}
	if update.Quantity != 42 {
		t.Errorf("quantity = %d, want 42", update.Quantity)
	}
	if update.Owner != base58Encode(owner[:]) {
		t.Errorf("owner = %q, want %q", update.Owner, base58Encode(owner[:]))
	}
}

// A spent stack is quantity 0, not a missing account. A reader resuming from a
// watermark cannot see a deletion, so zero has to arrive as a value.
func TestDecodeItemBalanceKeepsZeroQuantity(t *testing.T) {
	layout, _ := resolveItemBalanceLayout()

	update, ok := decodeItemBalance(layout, buildItemBalance(t, [32]byte{1}, 5, 0))
	if !ok {
		t.Fatal("a zero-quantity balance must still decode")
	}
	if update.Quantity != 0 || update.ItemType != "5" {
		t.Errorf("got quantity=%d itemType=%s, want 0 and 5", update.Quantity, update.ItemType)
	}
}

func TestDecodePetEquipment(t *testing.T) {
	layout, err := resolvePetEquipmentLayout()
	if err != nil {
		t.Fatalf("resolvePetEquipmentLayout: %v", err)
	}

	var asset [32]byte
	asset[31] = 0x09
	updates, ok := decodePetEquipment(layout, buildPetEquipment(t, asset, [3]uint64{1, 0, 77}))
	if !ok {
		t.Fatal("decodePetEquipment returned ok=false for a valid account")
	}

	if len(updates) != equipSlotCount {
		t.Fatalf("got %d updates, want one per slot (%d)", len(updates), equipSlotCount)
	}

	// The [u64; 3] array is Borsh-packed with no length prefix, so slot order is
	// positional. A decoder that read the elements out of order would pass every
	// other assertion here.
	wantTypes := []string{"1", "0", "77"}
	for slot, update := range updates {
		if update.Slot != uint32(slot) {
			t.Errorf("update %d has slot %d", slot, update.Slot)
		}
		if update.ItemType != wantTypes[slot] {
			t.Errorf("slot %d itemType = %q, want %q", slot, update.ItemType, wantTypes[slot])
		}
		if update.PetID != base58Encode(asset[:]) {
			t.Errorf("slot %d petId = %q, want the asset pubkey", slot, update.PetID)
		}
		if update.Chain != "solana" {
			t.Errorf("slot %d chain = %q", slot, update.Chain)
		}
	}
}

// An unequip writes "0" into the slot. Dropping empty slots would leave the
// projection asserting gear the chain no longer says is there.
func TestDecodePetEquipmentEmitsEmptySlots(t *testing.T) {
	layout, _ := resolvePetEquipmentLayout()

	updates, ok := decodePetEquipment(layout, buildPetEquipment(t, [32]byte{2}, [3]uint64{0, 0, 0}))
	if !ok {
		t.Fatal("a fully unequipped pet must still decode")
	}
	if len(updates) != equipSlotCount {
		t.Fatalf("got %d updates, want %d", len(updates), equipSlotCount)
	}
	for _, update := range updates {
		if update.ItemType != "0" {
			t.Errorf("slot %d itemType = %q, want 0", update.Slot, update.ItemType)
		}
	}
}

// Callers pass any account a transaction touched, so a decoder that accepted
// the wrong bytes would write another type's contents into the projection.
func TestInventoryDecodersRejectForeignAccounts(t *testing.T) {
	balanceLayout, _ := resolveItemBalanceLayout()
	equipLayout, _ := resolvePetEquipmentLayout()
	petLayout, err := resolvePetLayout()
	if err != nil {
		t.Fatalf("resolvePetLayout: %v", err)
	}

	balance := buildItemBalance(t, [32]byte{1}, 1, 1)
	equipment := buildPetEquipment(t, [32]byte{1}, [3]uint64{1, 2, 3})

	if _, ok := decodeItemBalance(balanceLayout, equipment); ok {
		t.Error("an ItemBalance decoder accepted a PetEquipment account")
	}
	if _, ok := decodePetEquipment(equipLayout, balance); ok {
		t.Error("a PetEquipment decoder accepted an ItemBalance account")
	}
	if _, ok := decodePetAccount(petLayout, balance); ok {
		t.Error("the PetAccount decoder accepted an ItemBalance account")
	}

	// Right discriminator, wrong length: a different type whose first eight
	// bytes collided, not this one with trailing data.
	if _, ok := decodeItemBalance(balanceLayout, append(balance, 0)); ok {
		t.Error("decodeItemBalance accepted an over-long account")
	}
	if _, ok := decodeItemBalance(balanceLayout, balance[:len(balance)-1]); ok {
		t.Error("decodeItemBalance accepted a truncated account")
	}
}

// The four accounts must not share a discriminator, or one would decode as
// another and the length check would be the only thing standing in the way.
func TestInventoryDiscriminatorsAreDistinct(t *testing.T) {
	names := []string{"PetAccount", "ItemBalance", "ItemSlot", "PetEquipment", "AuthorizedCaller"}
	seen := make(map[string]string, len(names))

	for _, name := range names {
		layout, err := resolveAccountLayout(idlJSON, name)
		if err != nil {
			t.Fatalf("resolveAccountLayout(%s): %v", name, err)
		}
		key := string(layout.discriminator)
		if other, dup := seen[key]; dup {
			t.Errorf("%s and %s share a discriminator", name, other)
		}
		seen[key] = name
	}
}

// The two subscriptions must filter on different bytes, or one would receive the
// other's accounts and the decoder would be the only thing separating them.
func TestInventorySubscriptionsFilterDistinctLayouts(t *testing.T) {
	itemLayout, _ := resolveItemBalanceLayout()
	equipLayout, _ := resolvePetEquipmentLayout()
	petLayout, _ := resolvePetLayout()

	if itemLayout.discriminatorB58 == equipLayout.discriminatorB58 {
		t.Error("item and equipment subscriptions would share a memcmp filter")
	}
	// Not required for correctness, since the discriminator filter already
	// separates them, but a shared dataSize means both filters must hold rather
	// than either. Worth knowing if it ever changes.
	if itemLayout.totalLen() == equipLayout.totalLen() {
		t.Logf("item and equipment accounts are both %d bytes; only the discriminator separates them",
			itemLayout.totalLen())
	}
	if petLayout.discriminatorB58 == itemLayout.discriminatorB58 {
		t.Error("the roster subscription would receive item balances")
	}
}

// Subscription ids must be distinct across both sessions: subNames is one table
// shared by the roster and inventory handlers, so a collision would mislabel a
// confirmation or a rejection.
func TestSubscriptionIDsAreDistinct(t *testing.T) {
	if len(subNames) != 3 {
		t.Fatalf("expected 3 registered subscriptions, got %d", len(subNames))
	}
	seen := make(map[string]int, len(subNames))
	for id, name := range subNames {
		if other, dup := seen[name]; dup {
			t.Errorf("ids %d and %d share the name %q", id, other, name)
		}
		seen[name] = id
	}
	if _, ok := subNames[itemSubID]; !ok {
		t.Error("item subscription id is not registered in subNames")
	}
	if _, ok := subNames[equipSubID]; !ok {
		t.Error("equipment subscription id is not registered in subNames")
	}
}
