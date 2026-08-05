package solana

// Minimal base58 (Bitcoin alphabet) encoder — enough to render pubkeys and
// the account discriminator memcmp filter. Decoding is never needed: every
// address we handle stays in its base58 string form end to end.

const b58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

func base58Encode(input []byte) string {
	zeros := 0
	for zeros < len(input) && input[zeros] == 0 {
		zeros++
	}

	// Big-endian base conversion into little-endian digit slice.
	digits := make([]byte, 0, len(input)*138/100+1)
	for _, c := range input[zeros:] {
		carry := int(c)
		for i := 0; i < len(digits); i++ {
			carry += int(digits[i]) << 8
			digits[i] = byte(carry % 58)
			carry /= 58
		}
		for carry > 0 {
			digits = append(digits, byte(carry%58))
			carry /= 58
		}
	}

	out := make([]byte, 0, zeros+len(digits))
	for i := 0; i < zeros; i++ {
		out = append(out, '1')
	}
	for i := len(digits) - 1; i >= 0; i-- {
		out = append(out, b58Alphabet[digits[i]])
	}
	return string(out)
}
