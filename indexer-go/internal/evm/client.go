package evm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// GraphQL queries. The pet selection set adds the v2 lineage / marriage /
// cooldown fields (plan §3.4, §4.1, §4.4); they require the subgraph schema
// bump (plan §6 open decision), and the adapter declares them here so it is
// ready the moment they deploy. petFields is shared so the full and
// incremental queries can never drift.
const (
	petFields = `id owner name dna level rarity winCount lossCount readyAt updatedAt
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
	battlesQuery = `
  query BattlesSince($first: Int!, $since: BigInt!) {
    battles(first: $first, orderBy: foughtAt, orderDirection: asc, where: { foughtAt_gt: $since }) {
      id attacker defender winnerPetId foughtAt
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
	WinCount  uint32 `json:"winCount"`
	LossCount uint32 `json:"lossCount"`
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
		return fmt.Errorf("subgraph request failed: HTTP %d", res.StatusCode)
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

func (c *client) fetchBattlesPage(ctx context.Context, since string) ([]subgraphBattle, error) {
	var data struct {
		Battles []subgraphBattle `json:"battles"`
	}
	vars := map[string]any{"first": c.pageSize, "since": since}
	if err := c.query(ctx, battlesQuery, vars, &data); err != nil {
		return nil, err
	}
	return data.Battles, nil
}

// paginate cursor-pages through all matching pets using the given query and
// variable builder, same contract as the TS implementation.
func (c *client) paginate(
	ctx context.Context,
	query string,
	buildVars func(lastID string) map[string]any,
) ([]subgraphPet, error) {
	lastID := ""
	var all []subgraphPet

	for {
		page, err := c.fetchPetsPage(ctx, query, buildVars(lastID))
		if err != nil {
			return nil, err
		}
		if len(page) == 0 {
			break
		}
		all = append(all, page...)
		lastID = page[len(page)-1].ID
		if len(page) < c.pageSize {
			break
		}
	}

	return all, nil
}
