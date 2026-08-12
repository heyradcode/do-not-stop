package solana

import "strconv"

// fieldReader reads decoded account fields without panicking on a type mismatch.
//
// Every field here is located by the hand-maintained IDL in idl/cryptopets.json, which
// drives *positional* Borsh decoding. When that file and the on-chain struct disagree — a
// field inserted, removed, or reordered, which is what an account-version bump does — the
// bytes at a given offset are read as the wrong type, and `fields["x"].(uint64)` panics.
//
// A panic here is the wrong failure. It happens on the subscription goroutine, on whatever
// account a transaction happened to touch, and it takes the process with it. Every other
// check in this package answers "these bytes are not that account" and moves on, which is
// what lets a caller pass every account in a transaction and keep the ones that decode.
// This makes a type mismatch answer the same way.
//
// Errors accumulate rather than short-circuit, so a decoder can populate a struct literal
// in one readable pass and test `ok()` once at the end — the shape bufio.Scanner and
// sql.Rows use. A failed read yields the zero value, which is never emitted because the
// caller discards the whole result.
type fieldReader struct {
	fields map[string]any
	valid  bool
}

func newFieldReader(fields map[string]any) *fieldReader {
	return &fieldReader{fields: fields, valid: true}
}

// ok reports whether every read so far found a field of the expected type.
func (r *fieldReader) ok() bool { return r.valid }

// u64 reads an unsigned integer. u8 through u32 widen to uint64 when decoded, so this
// covers every unsigned width the IDL uses.
func (r *fieldReader) u64(name string) uint64 {
	v, ok := r.fields[name].(uint64)
	if !ok {
		r.valid = false
	}
	return v
}

// u32 narrows an unsigned field to the width the projection stores.
func (r *fieldReader) u32(name string) uint32 { return uint32(r.u64(name)) }

// i64 reads a signed integer. i8 through i64 all decode to int64.
func (r *fieldReader) i64(name string) int64 {
	v, ok := r.fields[name].(int64)
	if !ok {
		r.valid = false
	}
	return v
}

// str reads a pubkey, which the decoder hands back base58-encoded.
func (r *fieldReader) str(name string) string {
	v, ok := r.fields[name].(string)
	if !ok {
		r.valid = false
	}
	return v
}

// bytes reads a fixed-length byte array, such as a name buffer.
func (r *fieldReader) bytes(name string) []byte {
	v, ok := r.fields[name].([]byte)
	if !ok {
		r.valid = false
	}
	return v
}

// decimal reads an unsigned integer as the decimal string the projection stores. Ids and
// quantities are text columns because they can exceed what the database's integer types
// hold on the EVM side, and both chains share the schema.
func (r *fieldReader) decimal(name string) string {
	return strconv.FormatUint(r.u64(name), 10)
}
