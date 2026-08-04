package solana

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
)

type wsNotification struct {
	Method string `json:"method"`
	Params struct {
		Result json.RawMessage `json:"result"`
	} `json:"params"`
	// Subscription request/response frames (no method): id matches the
	// subscribe call, result is the subscription id, error a rejection.
	ID     int             `json:"id"`
	Result json.RawMessage `json:"result"`
	Error  *rpcError       `json:"error"`
}

// subNames maps subscribe request ids to what was requested (see subscribe).
var subNames = map[int]string{1: "programSubscribe"}

func (ix *Indexer) handleMessage(
	ctx context.Context,
	msg []byte,
	roster chan<- indexer.RosterUpdate,
) {
	var note wsNotification
	if err := json.Unmarshal(msg, &note); err != nil {
		return // unknown frame
	}
	if note.Method == "" {
		name := subNames[note.ID]
		switch {
		case name == "":
			// unrelated frame
		case note.Error != nil:
			slog.Error("solana subscription rejected — no live feed, reconcile scan only",
				"sub", name, "code", note.Error.Code, "err", note.Error.Message)
		default:
			slog.Info("solana subscription confirmed", "sub", name, "subscription_id", string(note.Result))
		}
		return
	}

	switch note.Method {
	case "programNotification":
		ix.handleProgramNotification(ctx, note.Params.Result, roster)
	}
}

func (ix *Indexer) handleProgramNotification(
	ctx context.Context,
	result json.RawMessage,
	roster chan<- indexer.RosterUpdate,
) {
	var payload struct {
		Context struct {
			Slot uint64 `json:"slot"`
		} `json:"context"`
		Value programAccount `json:"value"`
	}
	if err := json.Unmarshal(result, &payload); err != nil {
		slog.Warn("solana bad program notification", "err", err)
		return
	}
	raw, err := payload.Value.Account.Data.decode()
	if err != nil {
		slog.Warn("solana undecodable account in notification", "pubkey", payload.Value.Pubkey, "err", err)
		return
	}
	update, ok := decodePetAccount(ix.layout, raw)
	if !ok {
		return
	}
	update.Version = payload.Context.Slot
	slog.Info("solana live update",
		"pet", update.PetID, "owner", update.Owner, "level", update.Level, "slot", update.Version)
	select {
	case <-ctx.Done():
	case roster <- update:
	}
}

