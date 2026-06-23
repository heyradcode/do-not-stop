# Frontend Code-Quality Refactor — Plan & Progress

A step-by-step refactor of `frontend/src` to fix architectural-consistency issues
surfaced in the code-quality review. Work is done **one step per commit**; the user
commits manually after each step. This file is the single source of truth so any
session can resume without re-deriving context.

## How to use this doc
1. Pick the first step whose status is `TODO`.
2. Do **only** that step. Keep the diff focused.
3. Verify with the step's acceptance criteria (typecheck + lint + tests as noted).
4. Fill in the step's **Outcome** and **Commit message**, flip status to `DONE`.
5. Hand the commit message to the user; they commit manually.

## Project conventions (apply to every step)
- **Indentation:** 4 spaces (the app majority; see Step 1).
- **Components:** `kebab-case/index.tsx`, `React.FC`, `type XxxProps`, default export.
- **Parts pattern:** complex panels = slim orchestrator + `parts/` presentational
  components (see `panels/battle` and the refactored `panels/marriage` as templates).
- **Hooks:** `useXxx.ts`, camelCase.
- **Verify commands** (run from `frontend/`):
  - Typecheck: `node ../node_modules/typescript/bin/tsc -b`
  - Lint: `node ../node_modules/eslint/bin/eslint.js <paths>`
  - Tests: `node ../node_modules/vitest/vitest.mjs run <path>`
- **Commit style:** Conventional Commits; trailer
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Reference templates already in the codebase
- Headless controller: `src/hooks/battle/useBattlePanel.ts`
- Parts decomposition: `src/components/pet/interactions/panels/battle/parts/`
- Recently refactored example: `src/components/pet/interactions/panels/marriage/`

---

## Status overview
| # | Step | Status |
|---|------|--------|
| 1 | Tooling: Prettier + `.editorconfig` + reformat | DONE |
| 2 | Colocate panel CSS (split `overview/index.css`) | DONE |
| 3 | Extract shared `useSpousePet` hook | DONE |
| 4 | Decompose `breed` panel into orchestrator + parts | DONE |
| 5 | Extract `pet-gallery` cooldown logic into a hook | DONE |
| 6 | Design-system adoption — buttons (app-wide) | IN PROGRESS |
| 7 | Shared accessible modal + migrate bespoke modals | TODO |
| 8 | Minor cleanups (eslint `any`→warn, hex→CSS vars) | TODO |

Statuses: `TODO` → `IN PROGRESS` → `DONE` (or `SKIPPED` with reason).

---

## Step 1 — Tooling: Prettier + `.editorconfig` + reformat
**Status:** DONE

**Goal:** Eliminate the 2-space (`ui/neon-*`) vs 4-space (rest) inconsistency and
prevent future drift.

**Why:** `eslint.config.js` has no Prettier and no `indent` rule; no `.editorconfig`
exists. Nothing enforces style today.

**Plan:**
- Add Prettier config (4-space, single quotes, trailing commas — match existing majority).
- Add `.editorconfig` (4-space, LF, final newline).
- Wire a `format`/`format:check` script in `frontend/package.json`.
- Run a one-shot reformat across `src/`. This is a **large, whitespace-only diff** —
  keep it isolated in its own commit so later steps stay reviewable.

**Acceptance:**
- `format:check` passes clean.
- Typecheck + lint pass.
- Diff is whitespace/formatting only (no logic changes).

**Outcome (done):**
- Settings chosen: `tabWidth: 4`, `singleQuote: true`, `semi: true`,
  `trailingComma: 'all'`, `printWidth: 100`.
- Added `frontend/.prettierrc.json`, `frontend/.prettierignore`, `frontend/.editorconfig`.
- Added `format` / `format:check` scripts; pinned `prettier` to `2.8.8` in devDependencies
  (the version already present in the monorepo store — avoids a fresh download).
- Reformatted all of `src/**/*.{ts,tsx,css}`. The `ui/neon-*` 2-space files are now 4-space;
  some long lines rewrapped at width 100.
- **Verified:** `format:check` clean, `tsc -b` 0 errors, `eslint .` 0, **272/272 tests pass**.
- **Lockfile note:** `pnpm add` hit the known Windows EBUSY lock-rename issue
  ([[windows-file-lock-renames]]); applied the copy-temp-over workaround so the root
  `pnpm-lock.yaml` now records `prettier` as a frontend devDep. The same install also
  normalized an unrelated `isomorphic-ws` peer-dep notation (pnpm re-resolution; harmless,
  would appear on anyone's next install).
- **Prettier version caveat:** pinned to 2.8.8 (old, 2023) because installing 3.x failed on
  the EBUSY lock. Upgrading to Prettier 3.x is a good future follow-up once installs work.

**Commit message:**
```
chore(frontend): add prettier + editorconfig and reformat src

Standardize formatting (4-space, single quotes, semicolons, trailing
commas, printWidth 100) to remove the 2-space/4-space inconsistency between
the neon-* UI components and the rest of the app. Add .prettierrc.json,
.prettierignore, .editorconfig, and format/format:check scripts; pin
prettier to the version already in the monorepo store.

Whitespace/formatting only — no logic changes. Typecheck, lint, and all
272 tests pass.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Step 2 — Colocate panel CSS (split `overview/index.css`)
**Status:** DONE

**Goal:** Each panel owns and imports its own stylesheet; remove cross-component
CSS coupling.

**Why:** `overview/index.css` is ~1281 lines holding styles for marriage, rename,
train, level-up **and** the hub. `standalone/index.tsx:10` imports a sibling's CSS
(`overview/index.css`) just to style those panels — fragile. `battle/` and `breed/`
already colocate correctly; bring the rest in line.

**Plan:**
- Identify selectors per panel (`.marriage-*`, `.proposal-*`, `.rename-*`, `.train-*`,
  `.level-up-*`, plus shared `.interface`, `.action-controls`, `.picker`, `.field`,
  `.success-message`).
- Move panel-specific blocks into colocated `index.css` files imported by each panel.
- Keep genuinely shared/hub styles in `overview/index.css` (or promote shared ones to
  `styles/`). Decide: shared form primitives (`.interface`, `.field`, `.picker`) likely
  belong in `styles/` so all panels + standalone get them without importing a sibling.
- Remove the `overview/index.css` import from `standalone/index.tsx` once styles resolve
  via each panel + shared styles.

**Acceptance:**
- Each panel route (dashboard hub **and** standalone `/marriage`, `/breed`, etc.) renders
  visually unchanged. Verify in-app (the `run`/`verify` skills).
- No component imports another component's `index.css`.
- Typecheck + lint + tests pass.

**Risk:** CSS regressions are visual; verify each standalone page and the hub.

**Outcome (done):**
- Split the 1241-line `overview/index.css` into three files (pure move, no rule edits):
  - **NEW** `interactions/interactions.css` (403 lines) — shared tokens
    (`.dashboard-panel.pet-interactions` `--zi-*`), `.interface`, `.picker`/`.field`,
    `.name-input`, `.action-button`, `.action-controls`, `.cancel-button`, `.win-estimate`,
    `.transaction-info`, `.interaction-standalone-header`, `.help-text`, messages.
  - **NEW** `panels/marriage/index.css` (470 lines) — all `.marriage-*`, `.proposal-*`,
    `.sent-proposals-*`, `.accept-*`, `.propose-button`, `.confirm-*`, modal styles.
  - `overview/index.css` (368 lines) — now hub-card styles only (`.action-buttons`,
    `.breeding-lab-card`, `.battle-arena-card`, `.feature-action-card`, hub buttons).
- Import wiring:
  - `overview/index.tsx` now imports `../interactions.css` + `./index.css`.
  - `standalone/index.tsx` now imports `interactions.css` (was importing `overview/index.css`
    — the fragile sibling coupling is gone).
  - `marriage/index.tsx` now imports its own `./index.css`.
  - `battle`/`breed` unchanged: they already colocate CSS and get shared primitives from the
    wrapper (same load order as before — verified no regression).
- **Verified:** no component imports another's `index.css`; `format:check` clean; `tsc -b` 0;
  `eslint .` 0; **272/272 tests pass**; `vite build` succeeds and the built CSS contains the
  shared (`action-button`, `win-estimate`), hub (`feature-action-card`), and marriage
  (`marriage-card`, `marriage-heartbeat`) selectors.
- **Note:** styles were moved byte-for-byte (then Prettier-normalized), so visual-regression
  risk is minimal, but a quick in-app look at the hub + each standalone page is still wise.
- **Dead CSS deferred to Step 8:** `.breed-button`, `.battle-button`, `.transaction-info` are
  unused (only `lab-breed-button` is real); kept in `interactions.css` for now to keep this
  step a pure move. Added a reminder under Step 8.

**Commit message:**
```
refactor(frontend): colocate interaction panel CSS

Split the 1281-line overview/index.css into three concerns: shared tokens
and form primitives (interactions.css), hub-card styles (overview/index.css),
and marriage-specific styles (panels/marriage/index.css). Wire each surface
to import what it needs; standalone pages no longer import the overview
component's stylesheet.

Pure move (Prettier-normalized) — no rule changes. Typecheck, lint, all 272
tests, and a production build pass; built CSS contains the shared, hub, and
marriage selectors.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Step 3 — Extract shared `useSpousePet` hook
**Status:** DONE

**Goal:** One spouse-name-by-id lookup hook, reused by marriage and breed.

**Why:** Duplicated GraphQL lookups:
- `panels/marriage/parts/marriage-card.tsx:13` — `useSpousePet` + `SPOUSE_GQL`
- `panels/breed/index.tsx:38` — `SpouseLabel` + `SPOUSE_NAME_GQL`
Both run `useQuery(['pet', baseURL, chain, id])`.

**Plan:**
- Add a shared `useSpousePet(chain, id, opts?)` returning `{ name, level }` in
  `@shared/core` (next to other pet hooks) — it's now wanted by 2 features, so the
  shared package is the right home. Confirm the existing query key shape so caches
  dedupe across both call sites.
- Update `marriage-card.tsx` to consume it; drop the local copy + `SPOUSE_GQL`.
- (`breed` itself is migrated in Step 4; this step just lands the hook + marriage swap.)

**Acceptance:**
- Marriage cards still resolve spouse name/level.
- No behavior change; typecheck + lint + marriage tests pass.

**Outcome (done):**
- **NEW** `shared/src/hooks/useSpousePet.ts` — `useSpousePet(chain, id, { skip? })` returning
  `{ name?, level? }`. Superset of both old copies (selects `id name level`); keeps the
  `['pet', baseURL, chain, id]` query key so marriage + breed dedupe. Throws on GraphQL errors
  (the marriage copy silently swallowed them — minor improvement). Exported via
  `shared/src/hooks/index.ts` → `@shared/core`.
- `marriage/parts/marriage-card.tsx` now imports `useSpousePet` from `@shared/core`; removed the
  local hook + `SPOUSE_GQL` + the now-unused `useQuery`/`useApiClient` imports. Call site updated
  to the options form: `useSpousePet(chain, spouseId, { skip: Boolean(fromMap) })`.
- Test: added `useSpousePet` to the `@shared/core` mock in `marriage.test.tsx` (the hook is
  called unconditionally in `MarriageCard` before its married-check early return).
- **Breed still has its own `SpouseLabel`** — it gets swapped to this hook in Step 4 (kept here
  to keep the diff focused on landing the hook + marriage swap).
- **Verified:** `format:check` clean; `tsc -b` (builds shared + frontend) 0; `eslint .` 0;
  **272/272 tests pass**.
- **Scope note:** this commit spans both `shared/` and `frontend/`.

**Commit message:**
```
refactor: extract shared useSpousePet hook

Move the spouse-name-by-id GraphQL lookup duplicated in the marriage and
breed panels into a single useSpousePet hook in @shared/core. It returns
{ name, level }, shares the ['pet', baseURL, chain, id] query key so callers
dedupe, and surfaces GraphQL errors. Marriage now consumes the shared hook;
breed is migrated in a follow-up.

Typecheck, lint, and all 272 tests pass.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Step 4 — Decompose `breed` panel into orchestrator + parts
**Status:** DONE

**Goal:** Reduce `panels/breed/index.tsx` (~403 lines) to a slim orchestrator plus
`parts/`, mirroring the marriage refactor.

**Why:** Same monolith pattern just fixed in marriage: two tabs of state, contract
relative-detection logic, pending-breed logic, and all JSX in one file.

**Plan:**
- `types.ts`: `BreedTab`, `BreedPanelProps`.
- Consider a headless `useBreedPanel` hook (battle-style) for the contract/relative/
  pending logic if it stays heavy after splitting JSX.
- `parts/`: `breed-tab-bar`, `own-pets-tab`, `with-spouse-tab`, `offspring-name-input`,
  `breed-submit` (reuse existing `pending-breed-notice`, `stud-fee-balance`).
- Replace the local `SpouseLabel` with the shared `useSpousePet` from Step 3.
- Move tab-local state into the relevant tab components where it isn't shared.

**Acceptance:**
- Both tabs (own / with-spouse), relative warning, pending-breed notices, stud fee,
  and submit all behave identically. Verify in-app.
- Typecheck + lint + any breed tests pass.

**Outcome (done):**
- `breed/index.tsx`: **466 → 280 lines**. Now a slim orchestrator owning state, effects,
  contract reads (relative detection), pending-breed checks, and the mutation; delegates all
  rendering.
- `types.ts`: `BreedTab`, `BreedPanelProps`.
- New `parts/`: `breed-tab-bar.tsx`, `own-pets-tab.tsx`, `with-spouse-tab.tsx`,
  `spouse-label.tsx` (now uses the shared `useSpousePet` from Step 3 — the old local
  `SpouseLabel` + `SPOUSE_NAME_GQL` are gone).
- Moved the two existing flat sub-files into `parts/` (git mv): `pending-breed-notice.tsx`,
  `stud-fee-balance.tsx` — breed now matches the battle/marriage `parts/` convention.
- Tab-local state stays in the orchestrator (it feeds the relative-check contract reads,
  `canSubmit`, and the success reset), so the tabs are controlled via props — same as the
  marriage tabs.
- Tests: updated `breed.test.tsx` mock paths to `parts/...` and added `useSpousePet` to the
  `@shared/core` mock (returns no name so `SpouseLabel` falls back to `#id`).
- **Verified:** `format:check` clean; `tsc -b` 0; `eslint .` 0; breed tests 11/11;
  **272/272 tests pass**.
- **Optional future refinement:** index.tsx is still ~280 lines because all logic lives there
  (intentional, matches marriage). If a thinner view is wanted later, extract a headless
  `useBreedPanel` hook (battle-style) — deliberately deferred to keep this diff focused/low-risk.

**Commit message:**
```
refactor(frontend): decompose breed panel into parts

Split the 466-line breed/index.tsx into a slim orchestrator plus parts
(tab bar, own-pets tab, with-spouse tab, spouse label) and move the existing
pending-breed-notice / stud-fee-balance into parts/, matching the
battle/marriage convention. The spouse label now uses the shared useSpousePet
hook, removing the last duplicated spouse-name GraphQL lookup.

Behavior preserved; breed tests updated for the new module paths. Typecheck,
lint, and all 272 tests pass.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Step 5 — Extract `pet-gallery` cooldown logic into a hook
**Status:** DONE

**Goal:** Move readiness/cooldown computation out of the view.

**Why:** `pet-gallery/index.tsx:51` runs a manual 1s `setInterval` re-render tick and
inlines readiness math (`!isPetReady(BigInt(p.readyAt)) || ...`) duplicated at lines
~53–55 and ~206–208.

**Plan:**
- Add `usePetCooldowns(pets)` (or similar) returning per-pet readiness flags + labels
  and owning the tick interval. Place in `src/hooks/` (or `@shared/core` if reused).
- View consumes the hook and just renders.

**Acceptance:**
- Cooldown countdowns still tick live; ready/on-cooldown states unchanged.
- Typecheck + lint pass.

**Outcome (done):**
- **NEW** `src/hooks/usePetCooldowns.ts` — `usePetCooldowns(pets)` returns `{ anyCooldown,
  statusFor }`. Owns the 1s `setInterval` tick (only while `anyCooldown`) and a `statusFor(pet)`
  helper returning `{ onCooldown, battleReady, battleOnCooldown, breedOnCooldown, trainOnCooldown,
  battleLabel, breedLabel, trainLabel }`. The readiness math (previously inlined 3×) lives here once.
- `pet-gallery/index.tsx`: removed the inline `anyCooldown`/tick effect and the
  `isPetReady`/`getTimeUntilReady` imports; now calls `usePetCooldowns(pets)` and reads
  `cd = statusFor(pet)` once per card. The status block and Send button consume `cd.*` instead of
  recomputing `isPetReady(BigInt(...))` inline.
- **Verified:** `format:check` clean; `tsc -b` 0; `eslint .` 0; **272/272 tests pass** (incl.
  `pet-gallery.test.tsx` — its `@shared/core` mock already provides `isPetReady`/`getTimeUntilReady`,
  now reached via the hook).
- **Note:** kept the hook frontend-local in `src/hooks/` since pet-gallery is its only consumer;
  promote to `@shared/core` if another surface needs it.

**Commit message:**
```
refactor(frontend): extract usePetCooldowns hook from pet-gallery

Move the per-pet readiness math (duplicated three times in the gallery view)
and the 1s countdown tick into a usePetCooldowns hook that returns a
statusFor(pet) helper. The view now reads cd.* flags/labels instead of
recomputing isPetReady(BigInt(...)) inline, and the tick lives in the hook.

Behavior unchanged. Typecheck, lint, and all 272 tests pass.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Step 6 — Design-system adoption — buttons (app-wide)
**Status:** IN PROGRESS

**Decision (user, 2026-06-22):** **Adopt neon-\* app-wide.** Migrate buttons to `NeonButton`
and (Step 7) modals to `NeonModal`.

**Why:** `ui/neon-*` exists but was used **only in `wallet/`**. Elsewhere: raw
`<button className="action-button|marriage-row-action|breed-tab">` + `AuthActionButton`, plus
panel buttons styled via descendant selectors (`.action-controls button`).

**Obstacles found (drive the sub-step plan):**
- `NeonButtonTone` lacked `violet` (breed/level-up) and `magenta` (battle); sizes didn't cover
  the tiny inline row actions. → fixed in 6a.
- Panel buttons are styled by **descendant selectors** (`.action-controls button:first-child`,
  `.marriage-row-action`, etc.), so each migration must replace the button AND remove/whittle the
  CSS that targeted it, or the `.neon-btn` base will conflict.
- **Tabs** (`.breed-tab`, `.marriage-tab`) and structural controls (close-X, confirm Cancel) have
  active/inactive + layout states that don't map to a tone-variant button — these will keep their
  bespoke styling rather than become `NeonButton` (noted per sub-step).
- Destructive **Divorce** is currently red (outside the tone palette); will move to `magenta`
  (warm/alert) under the tone system — a small intentional visual shift.

**Sub-steps (one commit each):**
- **6a — NeonButton foundation (DONE):** add `tone-violet`, `tone-magenta`, and a compact
  `size-xs`; widen `NeonButtonTone`/`NeonButtonSize`. Purely additive, no call sites changed.
- **6b — Primary action buttons:** compose `AuthActionButton` over `NeonButton` (forward
  `tone`/`size`/`fullWidth`) and migrate the 8 auth-gated submit/row buttons (propose=amber,
  accept=emerald, breed=violet, battle=magenta, level-up=violet, train=amber, rename=cyan,
  divorce=magenta xs, cancel=amber xs). Remove the dead `.action-button`/`.propose-button`/
  `.action-controls button` color CSS those relied on; keep layout-only rules.
- **6c — Non-auth action buttons:** `accept-inline`, hub `lab-breed-button` family,
  `create-first-pet-button`, `retry-button`, `refresh`, `sync-metadata`, battle `cancel-button` →
  `NeonButton` with the right tone/size; remove dead CSS. Tabs + close-X stay bespoke.
- **6d (optional) — NeonCard:** adopt for hub cards / state cards if it reduces bespoke card CSS.

**Acceptance (whole step):** consistent `NeonButton` usage for action buttons; no behavior change;
typecheck + lint + tests pass. Visual check in-app recommended (button themes are CSS).

### 6a outcome (done)
- `neon-button/index.tsx`: `NeonButtonTone` now includes `violet`/`magenta`; `NeonButtonSize`
  adds `xs`.
- `neon-button/index.css`: added `.tone-violet`, `.tone-magenta` (colors matched to the existing
  breed/level-up violet and battle magenta themes for visual continuity) and `.size-xs`
  (4px 10px, no uppercase) for inline row actions.
- Purely additive — no consumers changed yet. **Verified:** `format:check` clean; `tsc -b` 0;
  `eslint .` 0; **272/272 tests pass**.

**6a commit message:**
```
feat(frontend): extend NeonButton palette for app-wide adoption

Add violet and magenta tones (matching the existing breed/level-up and
battle button themes) and a compact xs size for inline row actions, widening
NeonButtonTone/NeonButtonSize. Purely additive — no consumers changed yet;
groundwork for migrating panel buttons onto NeonButton.

Typecheck, lint, and all 272 tests pass.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Step 7 — Shared accessible modal + migrate bespoke modals
**Status:** TODO

**Goal:** All modals use one accessible primitive.

**Why:** `panels/marriage/parts/accept-confirm-dialog.tsx`, `create-pet-modal`,
`send-pet-modal` hand-roll modal markup with **no `role="dialog"`, no Escape-to-close,
no focus trap**. `ui/neon-modal` exists but is underused.

**Plan:**
- Ensure `NeonModal` (or a chosen modal primitive) provides `role="dialog"`,
  `aria-modal`, Escape-to-close, focus trap, and overlay-click close.
- Migrate the three bespoke modals onto it.
- Depends on Step 6's design-system decision.

**Acceptance:** Keyboard (Esc, tab-trap) + screen-reader semantics work; existing
behavior preserved; typecheck + lint + tests pass.

**Outcome:** _(fill after completion)_

**Commit message:** _(fill after completion)_

---

## Step 8 — Minor cleanups
**Status:** TODO

**Goal:** Tighten remaining low-priority items.

**Plan (each can be its own small commit if preferred):**
- Set `@typescript-eslint/no-explicit-any` to `warn` (codebase currently uses no `any`;
  keep it that way). Verify lint stays clean.
- Replace hard-coded hex colors in `.tsx` (~15) and reduce `!important` (~13) in CSS by
  using `styles/variables.css` tokens where practical.
- Optional: normalize a few camelCase non-hook filenames (`constants/interactionRoutes.ts`,
  `petsContractParams.ts`) only if it doesn't churn imports excessively.
- **Remove dead CSS** carried over from Step 2: `.breed-button`, `.battle-button`,
  `.transaction-info` in `interactions/interactions.css` (verified unused in Step 2).

**Acceptance:** Lint clean; no visual/behavior change.

**Outcome:** _(fill after completion)_

**Commit message:** _(fill after completion)_

---

## Change log
- 2026-06-22 — Step 1 — chore(frontend): add prettier + editorconfig and reformat src
- 2026-06-22 — Step 2 — refactor(frontend): colocate interaction panel CSS
- 2026-06-22 — Step 3 — refactor: extract shared useSpousePet hook
- 2026-06-22 — Step 4 — refactor(frontend): decompose breed panel into parts
- 2026-06-22 — Step 5 — refactor(frontend): extract usePetCooldowns hook from pet-gallery
- 2026-06-22 — Step 6a — feat(frontend): extend NeonButton palette for app-wide adoption
