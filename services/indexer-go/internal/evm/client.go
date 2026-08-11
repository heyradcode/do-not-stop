package evm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// GraphQL queries. The pet selection set adds the v2 lineage / marriage /
// cooldown fields (plan §3.4, §4.1, §4.4); they require the subgraph schema
// bump (plan §6 open decision), and the adapter declares them here so it is
// ready the moment they deploy. petFields is shared so the full and
// incremental queries can never drift.
const (
	petFields = `id owner name dna level rarity readyAt updatedAt
      xp generation parent1Id parent2Id breedCount speciesId spouseId breedReadyAt trainReadyAt`

	fullSyncQuery = `
  query Pets($first: Int!, $lastId: ID!) {
    pets(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId }) {
      ` + petFields + `
    }
  }
`
	incrementalQuery = `
  query PetsSince($first: Int!, $lastId: ID!, $since: BigInt!) {
    pets(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId, updatedAt_gt: $since }) {
      ` + petFields + `
    }
  }
`
)

// Inventory queries (roadmap §4). Same cursor-plus-watermark shape as the pet
// queries above, and the same rule applies: these selection sets must match the
// subgraph's ItemBalance / PetEquipment entities exactly or the adapter silently
// reads zero values.
const (
	itemBalanceFields = `id owner itemType quantity updatedAt`

	itemBalanceFullQuery = `
  query ItemBalances($first: Int!, $lastId: ID!) {
    itemBalances(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId }) {
      ` + itemBalanceFields + `
    }
  }
`
	itemBalanceIncrementalQuery = `
  query ItemBalancesSince($first: Int!, $lastId: ID!, $since: BigInt!) {
    itemBalances(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId, updatedAt_gt: $since }) {
      ` + itemBalanceFields + `
    }
  }
`

	petEquipmentFields = `id petId slot itemType updatedAt`

	petEquipmentFullQuery = `
  query PetEquipments($first: Int!, $lastId: ID!) {
    petEquipments(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId }) {
      ` + petEquipmentFields + `
    }
  }
`
	petEquipmentIncrementalQuery = `
  query PetEquipmentsSince($first: Int!, $lastId: ID!, $since: BigInt!) {
    petEquipments(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId, updatedAt_gt: $since }) {
      ` + petEquipmentFields + `
    }
  }
`
)

// subgraphPet mirrors the subgraph's Pet entity. The Graph encodes Int as a
// JSON number and BigInt as a string.
type subgraphPet struct {
	ID        string `json:"id"`
	Owner     string `json:"owner"`
	Name      string `json:"name"`
	DNA       string `json:"dna"`
	Level     uint32 `json:"level"`
	Rarity    uint32 `json:"rarity"`
	ReadyAt   string `json:"readyAt"`
	UpdatedAt string `json:"updatedAt"`

	// v2 fields. Int → JSON number; BigInt (ids, cooldowns) → string. Absent
	// on a pre-v2 subgraph, in which case they decode to their zero values.
	XP           uint32 `json:"xp"`
	Generation   uint32 `json:"generation"`
	Parent1ID    string `json:"parent1Id"`
	Parent2ID    string `json:"parent2Id"`
	BreedCount   uint32 `json:"breedCount"`
	SpeciesID    uint32 `json:"speciesId"`
	SpouseID     string `json:"spouseId"`
	BreedReadyAt string `json:"breedReadyAt"`
	TrainReadyAt string `json:"trainReadyAt"`
}

// subgraphBattle mirrors the subgraph's Battle entity.
type subgraphBattle struct {
	ID          string `json:"id"` // txHash-logIndex
	Attacker    string `json:"attacker"`
	Defender    string `json:"defender"`
	WinnerPetID string `json:"winnerPetId"`
	FoughtAt    string `json:"foughtAt"`

	// v2 sim outputs. seed is the uint256 vrf seed (decimal or 0x-hex from the
	// subgraph); the adapter normalizes it to 0x-hex. Absent on a pre-v2
	// subgraph, in which case they decode to their zero values.
	LoserPetID        string `json:"loserPetId"`
	Seed              string `json:"seed"`
	Rounds            uint32 `json:"rounds"`
	WinnerHpRemaining uint32 `json:"winnerHpRemaining"`
	XPWin             uint32 `json:"xpWin"`
	XPLoss            uint32 `json:"xpLoss"`
}

// subgraphItemBalance mirrors the subgraph's ItemBalance entity. `quantity` is a
// BigInt, so The Graph encodes it as a string.
type subgraphItemBalance struct {
	ID        string `json:"id"` // "{owner}-{itemType}"
	Owner     string `json:"owner"`
	ItemType  string `json:"itemType"`
	Quantity  string `json:"quantity"`
	UpdatedAt string `json:"updatedAt"`
}

// subgraphPetEquipment mirrors the subgraph's PetEquipment entity. `slot` is an
// Int (a JSON number); the rest are BigInt strings.
type subgraphPetEquipment struct {
	ID        string `json:"id"` // "{petId}-{slot}"
	PetID     string `json:"petId"`
	Slot      uint32 `json:"slot"`
	ItemType  string `json:"itemType"`
	UpdatedAt string `json:"updatedAt"`
}

type client struct {
	url      string
	pageSize int
	http     *http.Client
}

// query posts a GraphQL request and unmarshals the data payload into dataOut.
func (c *client) query(ctx context.Context, query string, variables map[string]any, dataOut any) error {
	body, err := json.Marshal(map[string]any{"query": query, "variables": variables})
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
		return err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return &httpError{status: res.StatusCode, retryAfter: retryAfter(res)}
	}

	var envelope struct {
		Data   json.RawMessage `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.NewDecoder(res.Body).Decode(&envelope); err != nil {
		return fmt.Errorf("subgraph response decode: %w", err)
	}
	if len(envelope.Errors) > 0 {
		msgs := make([]string, len(envelope.Errors))
		for i, e := range envelope.Errors {
			msgs[i] = e.Message
		}
		return fmt.Errorf("subgraph errors: %s", strings.Join(msgs, "; "))
	}

	if err := json.Unmarshal(envelope.Data, dataOut); err != nil {
		return fmt.Errorf("subgraph data decode: %w", err)
	}
	return nil
}

func (c *client) fetchPetsPage(ctx context.Context, query string, variables map[string]any) ([]subgraphPet, error) {
	var data struct {
		Pets []subgraphPet `json:"pets"`
	}
	if err := c.query(ctx, query, variables, &data); err != nil {
		return nil, err
	}
	return data.Pets, nil
}

func (c *client) fetchItemBalancesPage(ctx context.Context, query string, variables map[string]any) ([]subgraphItemBalance, error) {
	var data struct {
		ItemBalances []subgraphItemBalance `json:"itemBalances"`
	}
	if err := c.query(ctx, query, variables, &data); err != nil {
		return nil, err
	}
	return data.ItemBalances, nil
}

func (c *client) fetchPetEquipmentPage(ctx context.Context, query string, variables map[string]any) ([]subgraphPetEquipment, error) {
	var data struct {
		PetEquipments []subgraphPetEquipment `json:"petEquipments"`
	}
	if err := c.query(ctx, query, variables, &data); err != nil {
		return nil, err
	}
	return data.PetEquipments, nil
}

// paginate cursor-pages through all matching rows of one entity, same contract
// as the TS implementation.
//
// Generic over the row type, and therefore a function rather than a method: Go
// does not allow type parameters on methods. The alternative was a near-identical
// copy of this loop per entity, where a fix to the cursor or the short-page
// termination would have to be made in three places to hold.
func paginate[T any](
	ctx context.Context,
	pageSize int,
	buildVars func(lastID string) map[string]any,
	idOf func(T) string,
	fetch func(ctx context.Context, variables map[string]any) ([]T, error),
) ([]T, error) {
	lastID := ""
	var all []T

	for {
		page, err := fetch(ctx, buildVars(lastID))
		if err != nil {
			return nil, err
		}
		if len(page) == 0 {
			break
		}
		all = append(all, page...)
		lastID = idOf(page[len(page)-1])
		if len(page) < pageSize {
			break
		}
	}

	return all, nil
}

// httpError is a non-200 from the subgraph, carrying enough for a caller to tell a rate
// limit from a genuine failure.
//
// The distinction is not cosmetic. A 429 means the endpoint is asking to be left alone for
// a moment, and a poller that treats it like any other error keeps its interval, spends the
// next request on the same refusal, and renews the block. The status is what lets the loop
// back off instead.
type httpError struct {
	status int
	// From the Retry-After header when the endpoint sent one; zero otherwise. Preferred over
	// any locally-chosen delay, since it is the only figure that reflects when the limiter
	// will actually admit us.
	retryAfter time.Duration
}

func (e *httpError) Error() string {
	if e.retryAfter > 0 {
		return fmt.Sprintf("subgraph request failed: HTTP %d (retry after %s)", e.status, e.retryAfter)
	}
	return fmt.Sprintf("subgraph request failed: HTTP %d", e.status)
}

// rateLimited reports whether the endpoint is asking for fewer requests rather than
// reporting a fault. 503 counts: gateways use it for shedding, and the correct response is
// the same either way.
func (e *httpError) rateLimited() bool {
	return e.status == http.StatusTooManyRequests || e.status == http.StatusServiceUnavailable
}

// retryAfter reads the header in both forms RFC 9110 allows: delay-seconds, or an HTTP date.
// An unparseable or past value reports zero, leaving the caller to pick its own delay.
func retryAfter(res *http.Response) time.Duration {
	raw := strings.TrimSpace(res.Header.Get("Retry-After"))
	if raw == "" {
		return 0
	}
	if seconds, err := strconv.Atoi(raw); err == nil {
		if seconds <= 0 {
			return 0
		}
		return time.Duration(seconds) * time.Second
	}
	if at, err := http.ParseTime(raw); err == nil {
		if delay := time.Until(at); delay > 0 {
			return delay
		}
	}
	return 0
}
