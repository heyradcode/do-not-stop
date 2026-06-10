package solana

// Anchor (0.30+) IDL reader + Borsh decoder for fixed-layout accounts — the
// Go port of backend/indexing/solana/scanner/anchorIdl.ts. The discriminator,
// byte length, and field layout all come from the IDL JSON, so an on-chain
// struct change only requires dropping in a fresh IDL (idl/cryptopets.json,
// kept as a copy of the backend's — regenerate both from `anchor build`).
// Variable-length types (string/vec/option) fail loudly at layout resolution
// so unhandled schema changes break startup, never decode silently wrong.

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
)

type idlType struct {
	// Exactly one is set: Primitive ("u8", "pubkey", ...) or Array.
	Primitive string
	Array     *idlArray
}

type idlArray struct {
	Elem idlType
	Len  int
}

func (t *idlType) UnmarshalJSON(data []byte) error {
	var prim string
	if err := json.Unmarshal(data, &prim); err == nil {
		t.Primitive = prim
		return nil
	}
	var wrapper struct {
		Array []json.RawMessage `json:"array"`
	}
	if err := json.Unmarshal(data, &wrapper); err != nil || len(wrapper.Array) != 2 {
		return fmt.Errorf("unsupported IDL type: %s", data)
	}
	var elem idlType
	if err := json.Unmarshal(wrapper.Array[0], &elem); err != nil {
		return err
	}
	var length int
	if err := json.Unmarshal(wrapper.Array[1], &length); err != nil {
		return err
	}
	t.Array = &idlArray{Elem: elem, Len: length}
	return nil
}

type idlField struct {
	Name string  `json:"name"`
	Type idlType `json:"type"`
}

type anchorIdl struct {
	Address  string `json:"address"`
	Accounts []struct {
		Name          string `json:"name"`
		Discriminator []byte `json:"discriminator"`
	} `json:"accounts"`
	Types []struct {
		Name string `json:"name"`
		Type struct {
			Kind   string     `json:"kind"`
			Fields []idlField `json:"fields"`
		} `json:"type"`
	} `json:"types"`
}

type accountLayout struct {
	discriminator    []byte
	discriminatorB58 string
	fields           []idlField
	bodySize         int // serialized bytes excluding the 8-byte discriminator
}

// totalLen is the getProgramAccounts dataSize filter value.
func (l *accountLayout) totalLen() int { return 8 + l.bodySize }

var primitiveSizes = map[string]int{
	"bool": 1, "u8": 1, "i8": 1, "u16": 2, "i16": 2,
	"u32": 4, "i32": 4, "u64": 8, "i64": 8, "pubkey": 32,
}

func sizeOf(t idlType) (int, error) {
	if t.Primitive != "" {
		size, ok := primitiveSizes[t.Primitive]
		if !ok {
			return 0, fmt.Errorf("unsupported IDL primitive: %s", t.Primitive)
		}
		return size, nil
	}
	if t.Array != nil {
		elem, err := sizeOf(t.Array.Elem)
		if err != nil {
			return 0, err
		}
		return elem * t.Array.Len, nil
	}
	return 0, fmt.Errorf("unsupported IDL type")
}

// resolveAccountLayout reads an account's discriminator + field layout from
// the IDL (once, at startup).
func resolveAccountLayout(idlJSON []byte, accountName string) (*accountLayout, error) {
	var idl anchorIdl
	if err := json.Unmarshal(idlJSON, &idl); err != nil {
		return nil, fmt.Errorf("idl: parse: %w", err)
	}

	var discriminator []byte
	for _, a := range idl.Accounts {
		if a.Name == accountName {
			discriminator = a.Discriminator
		}
	}
	if discriminator == nil {
		return nil, fmt.Errorf("idl: no account named %q", accountName)
	}

	var fields []idlField
	for _, t := range idl.Types {
		if t.Name == accountName {
			fields = t.Type.Fields
		}
	}
	if fields == nil {
		return nil, fmt.Errorf("idl: no struct type for %q", accountName)
	}

	bodySize := 0
	for _, f := range fields {
		size, err := sizeOf(f.Type)
		if err != nil {
			return nil, fmt.Errorf("idl: field %s: %w", f.Name, err)
		}
		bodySize += size
	}

	return &accountLayout{
		discriminator:    discriminator,
		discriminatorB58: base58Encode(discriminator),
		fields:           fields,
		bodySize:         bodySize,
	}, nil
}

// decodeStruct reads a Borsh-packed struct body (discriminator already
// stripped) into a field map: u8..u32 → uint64, i8..i64 → int64, u64 → uint64,
// bool → bool, pubkey → base58 string, [u8;N] → []byte.
func decodeStruct(fields []idlField, body []byte) (map[string]any, error) {
	out := make(map[string]any, len(fields))
	offset := 0
	for _, f := range fields {
		value, size, err := readValue(body, offset, f.Type)
		if err != nil {
			return nil, fmt.Errorf("field %s: %w", f.Name, err)
		}
		out[f.Name] = value
		offset += size
	}
	return out, nil
}

func readValue(buf []byte, offset int, t idlType) (any, int, error) {
	size, err := sizeOf(t)
	if err != nil {
		return nil, 0, err
	}
	if offset+size > len(buf) {
		return nil, 0, fmt.Errorf("truncated: need %d bytes at offset %d, have %d", size, offset, len(buf))
	}

	if t.Primitive != "" {
		b := buf[offset:]
		switch t.Primitive {
		case "bool":
			return b[0] != 0, size, nil
		case "u8":
			return uint64(b[0]), size, nil
		case "i8":
			return int64(int8(b[0])), size, nil
		case "u16":
			return uint64(binary.LittleEndian.Uint16(b)), size, nil
		case "i16":
			return int64(int16(binary.LittleEndian.Uint16(b))), size, nil
		case "u32":
			return uint64(binary.LittleEndian.Uint32(b)), size, nil
		case "i32":
			return int64(int32(binary.LittleEndian.Uint32(b))), size, nil
		case "u64":
			return binary.LittleEndian.Uint64(b), size, nil
		case "i64":
			return int64(binary.LittleEndian.Uint64(b)), size, nil
		case "pubkey":
			return base58Encode(b[:32]), size, nil
		}
	}

	if t.Array != nil && t.Array.Elem.Primitive == "u8" {
		// Byte arrays (e.g. fixed name buffers) come back raw for the caller to slice.
		return bytes.Clone(buf[offset : offset+size]), size, nil
	}

	return nil, 0, fmt.Errorf("unsupported IDL type at decode")
}
