# frontend

Moved out of the root `CLAUDE.md` so it loads only when working in this directory.
Universal rules and the cross-chain non-negotiables stay in the root file and `AGENTS.md`.

## Frontend panels: a controller hook when there's a state machine, direct composition when there isn't
`frontend/src/components/pet/interactions/panels/` holds two shapes, and which one a panel uses is not about size. The test is whether the panel owns a **multi-step state machine** — a flow with intermediate states the player sits and watches.

- **It does** → a headless controller hook in `frontend/src/hooks/<feature>/`, and the component consumes that single hook and holds **no** `useState`/`useEffect` of its own. `battle` (27-line view over `useBattlePanel`), `breed` (73 over `useBreedPanel`), `marriage` (94 over `useMarriagePanel`). Each of those flows has real intermediate states: request, entropy reveal, settle, result, and for battle a mismatch reconciliation.
- **It doesn't** → the component composes the shared hooks directly and keeps its form state local. `rename`, `level-up`, `train`, `defense` all open with the same preamble (`useChainCapabilities`, `usePetList`, `useNotifyError`, plus the action hook, plus `useFees` where the action costs money). These are one action over one selected pet; there is no interim state worth modelling.

Do not "fix" `useBattlePanel` for being 511 lines. Its own doc comment records the reasoning: selection and validation are tightly coupled (random-match and battle-start both touch validation), so one controller is the honest seam, and the genuinely separable concerns were already extracted to `useResultDialogue` (still in `frontend/src/hooks/battle/`, since it maps dialogue turns onto view props) and `useBattleOutcome` (now `@shared/core`, along with `useLiveBattleAnimation` — both are platform-neutral, so mobile's battle scene gets them for free). If it does get touched, the thing worth consolidating is its six `useEffect`s, whose ordering is implicit, not its line count.
