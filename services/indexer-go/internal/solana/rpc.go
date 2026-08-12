package solana

// Minimal Solana JSON-RPC client over HTTP. Only the four methods the
// adapter needs — a deliberate trade against the full SDK, which is heavy
// and untested on 386 builds.

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
)

type rpcClient struct {
	url  string
	http *http.Client
	// commitment every call here runs at; see config.Config.SolanaCommitment for why
	// it defaults to "finalized". Carried on the client so no call site can quietly
	// disagree with the subscription about what counts as real.
	commitment string
}

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  any    `json:"params"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (c *rpcClient) call(ctx context.Context, method string, params any, result any) error {
	body, err := json.Marshal(rpcRequest{JSONRPC: "2.0", ID: 1, Method: method, Params: params})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("rpc %s: %w", method, err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("rpc %s: HTTP %d", method, res.StatusCode)
	}

	var envelope struct {
		Result json.RawMessage `json:"result"`
		Error  *rpcError       `json:"error"`
	}
	if err := json.NewDecoder(res.Body).Decode(&envelope); err != nil {
		return fmt.Errorf("rpc %s: decode: %w", method, err)
	}
	if envelope.Error != nil {
		return fmt.Errorf("rpc %s: %d %s", method, envelope.Error.Code, envelope.Error.Message)
	}
	if result != nil {
		if err := json.Unmarshal(envelope.Result, result); err != nil {
			return fmt.Errorf("rpc %s: result decode: %w", method, err)
		}
	}
	return nil
}

// accountData is the ["<base64>", "base64"] tuple RPC uses for account bytes.
type accountData [2]string

func (d accountData) decode() ([]byte, error) {
	if d[1] != "base64" {
		return nil, fmt.Errorf("unexpected account encoding %q", d[1])
	}
	return base64.StdEncoding.DecodeString(d[0])
}

type programAccount struct {
	Pubkey  string `json:"pubkey"`
	Account struct {
		Data accountData `json:"data"`
	} `json:"account"`
}

type programAccountsResult struct {
	Context struct {
		Slot uint64 `json:"slot"`
	} `json:"context"`
	Value []programAccount `json:"value"`
}

// getProgramAccountsByLayout fetches every account matching one layout, via
// dataSize + discriminator memcmp filters, with the snapshot slot. Used for the
// roster and for each inventory account type.
func (c *rpcClient) getProgramAccountsByLayout(
	ctx context.Context,
	programID string,
	layout *accountLayout,
) (programAccountsResult, error) {
	var result programAccountsResult
	params := []any{programID, map[string]any{
		"encoding":    "base64",
		"commitment":  c.commitment,
		"withContext": true,
		"filters": []any{
			map[string]any{"dataSize": layout.totalLen()},
			map[string]any{"memcmp": map[string]any{"offset": 0, "bytes": layout.discriminatorB58}},
		},
	}}
	err := c.call(ctx, "getProgramAccounts", params, &result)
	return result, err
}

type signatureInfo struct {
	Signature string          `json:"signature"`
	Slot      uint64          `json:"slot"`
	Err       json.RawMessage `json:"err"` // null when the tx succeeded
	BlockTime *int64          `json:"blockTime"`
}

func (i signatureInfo) failed() bool { return string(i.Err) != "null" && len(i.Err) > 0 }

// getSignaturesForAddress returns signatures newest-first, stopping at
// `until` (exclusive) when set.
func (c *rpcClient) getSignaturesForAddress(
	ctx context.Context,
	address, until string,
	limit int,
) ([]signatureInfo, error) {
	opts := map[string]any{"commitment": c.commitment, "limit": limit}
	if until != "" {
		opts["until"] = until
	}
	var result []signatureInfo
	err := c.call(ctx, "getSignaturesForAddress", []any{address, opts}, &result)
	return result, err
}

type transactionResult struct {
	Slot      uint64 `json:"slot"`
	BlockTime *int64 `json:"blockTime"`
	Meta      *struct {
		Err         json.RawMessage `json:"err"`
		LogMessages []string        `json:"logMessages"`
	} `json:"meta"`
}

func (c *rpcClient) getTransaction(ctx context.Context, signature string) (transactionResult, error) {
	var result transactionResult
	params := []any{signature, map[string]any{
		"encoding":                       "json",
		"commitment":                     c.commitment,
		"maxSupportedTransactionVersion": 0,
	}}
	err := c.call(ctx, "getTransaction", params, &result)
	return result, err
}
