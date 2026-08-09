package combat

import "golang.org/x/crypto/sha3"

// roundSeed = keccak256(seed ‖ round), matching EVM's
// keccak256(abi.encodePacked(uint256 seed, uint8 round)). The 32-byte output
// is reused directly as the next preimage's first 32 bytes.
func roundSeed(seed [32]byte, round uint8) [32]byte {
	var preimage [33]byte
	copy(preimage[:32], seed[:])
	preimage[32] = round
	return keccak256(preimage[:])
}

// strikeRoll = keccak256(roundSeed ‖ slotOffset) % 10000, matching EVM's
// uint256(keccak256(abi.encodePacked(roundSeed, slotOffset))) % 10000.
func strikeRoll(rs [32]byte, slotOffset uint8) uint64 {
	var preimage [33]byte
	copy(preimage[:32], rs[:])
	preimage[32] = slotOffset
	digest := keccak256(preimage[:])
	return beBytesMod(digest, 10000)
}

// keccak256 is the legacy Keccak-256 (Ethereum's keccak256 / Solana's
// solana_program::keccak), NOT FIPS SHA3-256 — a mismatch here silently breaks
// cross-chain parity.
func keccak256(data []byte) [32]byte {
	h := sha3.NewLegacyKeccak256()
	h.Write(data)
	var out [32]byte
	copy(out[:], h.Sum(nil))
	return out
}

// beBytesMod computes uint256(beBytes) % modulus via Horner's method, so no
// 256-bit integer type is needed (modulus*256 must fit in u64). Mirrors
// combat::be_bytes_mod.
func beBytesMod(beBytes [32]byte, modulus uint64) uint64 {
	var result uint64
	for _, b := range beBytes {
		result = (result*256 + uint64(b)) % modulus
	}
	return result
}
