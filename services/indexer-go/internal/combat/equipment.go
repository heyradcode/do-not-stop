package combat

// Equipment modifiers (roadmap §4).
//
// The Go half of a change that must land in both live ports together. AGENTS.md makes
// this a MUST: §F's circuit breaker compares this port's recomputation against the
// TypeScript engine's, and it is only worth running because the two were written
// independently enough to disagree when one drifts. A modifier applied here at a
// different point, or clamped differently, would make them disagree on every geared
// battle and take the breaker with it.
//
// Mirrors protocol/src/combat/equipment.ts. Both are held to
// contracts/test-vectors/equipment.json.

// AttrBonus is equipment's flat, additive effect on a pet's attributes.
//
// Element is deliberately absent: no item changes a pet's element, and one that did
// would change which matchups it wins rather than how hard it hits.
type AttrBonus struct {
	HP   uint16
	ATK  uint16
	DEF  uint16
	INT  uint16
	MDEF uint16
}

// NoBonus is an ungeared pet. The zero value, so a PetInputs that never mentions
// equipment behaves exactly as it did before this existed.
var NoBonus = AttrBonus{}

// applyBonus adds a bonus to extracted attributes, in place.
//
// Saturating, not wrapping, and this is the one place in this package where those differ
// on purpose. Everything else mirrors Solidity's uint16 cast, which wraps; a wrapping
// addition would turn a well-geared pet into a nearly dead one the moment its HP crossed
// 65536, the opposite of what the item says it does. The TypeScript port clamps
// identically, and equipment.json's clamped-at-u16 case pins both.
func applyBonus(attrs *Attrs, bonus AttrBonus) {
	attrs.HP = addClamped(attrs.HP, bonus.HP)
	attrs.ATK = addClamped(attrs.ATK, bonus.ATK)
	attrs.DEF = addClamped(attrs.DEF, bonus.DEF)
	attrs.INT = addClamped(attrs.INT, bonus.INT)
	attrs.MDEF = addClamped(attrs.MDEF, bonus.MDEF)
}

// SumBonuses totals several equipped items into one bonus.
//
// Order-independent by construction, unlike the snapshot encoding where order is part of
// the digest: addition commutes, so a caller does not have to sort.
func SumBonuses(items []AttrBonus) AttrBonus {
	var total AttrBonus
	for _, item := range items {
		total.HP = addClamped(total.HP, item.HP)
		total.ATK = addClamped(total.ATK, item.ATK)
		total.DEF = addClamped(total.DEF, item.DEF)
		total.INT = addClamped(total.INT, item.INT)
		total.MDEF = addClamped(total.MDEF, item.MDEF)
	}
	return total
}

// addClamped adds two uint16 values, saturating at the maximum rather than wrapping.
// Widened to uint32 first, because the wrap this exists to prevent would otherwise happen
// in the addition itself.
func addClamped(a, b uint16) uint16 {
	sum := uint32(a) + uint32(b)
	if sum > 0xffff {
		return 0xffff
	}
	return uint16(sum)
}
