# backend

Moved out of the root `CLAUDE.md` so it loads only when working in this directory.
Universal rules and the cross-chain non-negotiables stay in the root file and `AGENTS.md`.

## Private chat (roadmap §2 v1): access is derived per request, never stored
`chat_thread` deliberately does not record the marriage that justifies it. Every read, send, and socket upgrade rechecks `pet_roster.spouse_id` through `chat.service.authorizeThread`, so a divorce closes the conversation the moment the indexer sees it, with no revocation step that could be forgotten. The thread row survives — deleting it would destroy the history — it just stops answering.

Two consequences worth keeping: a non-participant gets **404, not 403**, identical to a thread that does not exist, because 403 would confirm a thread id to anyone probing; and the caller is normalized (`normalizeAccount`) at the service boundary, since the caller doubles as the thread's participant key and an unnormalized spelling would open a second thread beside the first and split the conversation.

## Auth
Backend auth is nonce, then wallet-signature, then JWT (`backend/README.md`), guarding a single `/graphql` endpoint; the authenticated wallet becomes the matchmaking `caller` context (`backend/API.md`). Roster/battle reads are read-only projections of what the indexer(s) wrote; the backend no longer decodes contract events itself. `winEstimate` returns `null` (not an error) when unavailable, so treat that as a degraded UI state, not a failure.
