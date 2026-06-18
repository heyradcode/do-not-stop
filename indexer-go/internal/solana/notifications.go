package solana

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

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
var subNames = map[int]string{1: "programSubscribe", 2: "logsSubscribe"}

func (ix *Indexer) handleMessage(
	ctx context.Context,
	msg []byte,
	roster chan<- indexer.RosterUpdate,
	battles chan<- indexer.BattleEvent,
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
	case "logsNotification":
		ix.handleLogsNotification(ctx, note.Params.Result, battles)
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

func (ix *Indexer) handleLogsNotification(
	ctx context.Context,
	result json.RawMessage,
	battles chan<- indexer.BattleEvent,
) {
	var payload struct {
		Context struct {
			Slot uint64 `json:"slot"`
		} `json:"context"`
		Value struct {
			Signature string          `json:"signature"`
			Err       json.RawMessage `json:"err"`
			Logs      []string        `json:"logs"`
		} `json:"value"`
	}
	if err := json.Unmarshal(result, &payload); err != nil {
		slog.Warn("solana bad logs notification", "err", err)
		return
	}
	if string(payload.Value.Err) != "null" && len(payload.Value.Err) > 0 {
		return // failed transaction
	}

	// The notification carries no blockTime; the settle just happened, so
	// wall clock is honest within seconds (matches the dialogue recorder).
	now := time.Now().Unix()
	for _, r := range parseBattleResults(payload.Value.Logs) {
		event := r.toBattleEvent(payload.Value.Signature, payload.Context.Slot, now)
		slog.Info("solana live battle",
			"battle", event.BattleID, "winner", event.WinnerPetID, "slot", event.Version)
		select {
		case <-ctx.Done():
			return
		case battles <- event:
		}
	}
	ix.lastSig = payload.Value.Signature
}
