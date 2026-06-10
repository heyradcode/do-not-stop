package evm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// GraphQL queries — verbatim ports of backend/indexing/evm/indexer.ts so both
// implementations stay diffable during shadow mode.
const (
	fullSyncQuery = `
  query Pets($first: Int!, $lastId: ID!) {
    pets(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId }) {
      id owner name dna level rarity winCount lossCount readyAt updatedAt
    }
  }
`
	incrementalQuery = `
  query PetsSince($first: Int!, $lastId: ID!, $since: BigInt!) {
    pets(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId, updatedAt_gt: $since }) {
      id owner name dna level rarity winCount lossCount readyAt updatedAt
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
}

type graphqlResponse struct {
	Data struct {
		Pets []subgraphPet `json:"pets"`
	} `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

type client struct {
	url      string
	pageSize int
	http     *http.Client
}

func (c *client) fetchPage(ctx context.Context, query string, variables map[string]any) ([]subgraphPet, error) {
	body, err := json.Marshal(map[string]any{"query": query, "variables": variables})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("subgraph request failed: HTTP %d", res.StatusCode)
	}

	var decoded graphqlResponse
	if err := json.NewDecoder(res.Body).Decode(&decoded); err != nil {
		return nil, fmt.Errorf("subgraph response decode: %w", err)
	}
	if len(decoded.Errors) > 0 {
		msgs := make([]string, len(decoded.Errors))
		for i, e := range decoded.Errors {
			msgs[i] = e.Message
		}
		return nil, fmt.Errorf("subgraph errors: %s", strings.Join(msgs, "; "))
	}

	return decoded.Data.Pets, nil
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
		page, err := c.fetchPage(ctx, query, buildVars(lastID))
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
