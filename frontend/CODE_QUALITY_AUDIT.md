# Frontend Code Quality & Structure Audit

_Scope: `frontend/src` + `frontend/tests` · Method: static inspection (file tree, line
counts, grep sweeps, build output) · Companion to `REFACTORING_PLAN.md` (styling —
already complete; not re-covered here)_

## 1. Summary

The codebase is in genuinely good shape on hygiene: **zero `console.log`, zero
explicit `any`, zero `TODO`/`FIXME`**, a consistent feature-based folder layout,
path aliases for every top-level concern, and (as of the styling refactor) zero
BEM `__` class names with CI enforcement. The gaps that remain are structural
rather than cosmetic:

1. **No route-level code-splitting** — the whole app ships as one **8.7 MB** JS
   bundle. This is the highest-impact, lowest-effort fix available.
2. **`tests/` doesn't mirror `src/`** — you can't guess a test's path from its
   component's path, and vice versa.
3. A few **"does everything" files** (`useBattlePanel.ts` at 461 lines,
   `account-dropdown` at 337 lines) mix unrelated concerns and would benefit from
   the same extraction pattern already proven elsewhere in the codebase
   (`battle-matchmaking.ts`, `battle-utils.ts`).
4. A handful of **small inconsistencies** (a dead path alias, an ambiguous
   filename, uneven barrel-file coverage) that cost a few seconds of confusion
   each time someone hits them.

None of this is urgent — the app works and ships. This is a prioritized list for
when you want to invest in it.

## 2. What's already good (don't touch)

- **Zero `console.log`/`console.debug`** in `src` (only intentional
  `console.error` in error paths, 9 files).
- **Zero explicit `any`** anywhere in `src`.
- **Zero `TODO`/`FIXME`/`HACK`** comments — nothing is marked as known-incomplete.
- **Consistent kebab-case** for component directories (one exception, §4.6).
- **Path aliases** (`@components`, `@hooks`, `@constants`, `@chains`, `@shared/core`,
  …) are used consistently instead of relative `../../..` chains.
- **Feature-based structure holds up**: `components/pet/interactions/panels/<name>/`
  is a predictable, consistent shape across all 6 interaction panels (breed,
  battle, marriage, rename, train, level-up), each with its own `index.tsx` +
  `index.module.css` (+ `parts/` and `types.ts` for the ones complex enough to
  need them).
- **Pure-logic extraction already happens where it matters**: `battle-utils.ts`
  and `battle-matchmaking.ts` sit next to `battle/index.tsx`, keeping
  non-React logic out of the component. This is the right pattern — §3.3 asks for
  more of it, not something new.
- **CSS**: fully modularized, one design-token namespace, dead code purged, and
  now guarded in CI (see `REFACTORING_PLAN.md`).
- **Tests exist for nearly every component** (40 test files) and the suite is
  green (243/243 as of this writing).

## 3. Findings

### 3.1 No route-level code-splitting — 8.7 MB single bundle (High impact, low effort)

`router/app-routes/index.tsx` statically imports all 7 route pages:

```tsx
import HomePage from '@pages/home';
import BreedPage from '@pages/breed';
import BattlePage from '@pages/battle';
import LevelUpPage from '@pages/level-up';
import TrainPage from '@pages/train';
import MarriagePage from '@pages/marriage';
import RenamePage from '@pages/rename';
```

Every page is a thin 8–12 line wrapper around one interaction panel:

```tsx
// pages/battle/index.tsx — representative of all 7
const BattlePage: React.FC = () => (
    <InteractionStandalone action="battle" minPets={1}>
        <BattlePanel />
    </InteractionStandalone>
);
```

Because nothing is lazy, `vite build` produces a **single 8.7 MB** main chunk
(`dist/assets/index-*.js`) — every panel's code (battle's SVG art, breed's DNA
helix, marriage's proposal flows, …) loads on first paint regardless of which
page the user lands on. `pnpm build` already prints `(!) Some chunks are larger
than 500 kB after minification` on every run; this is why.

**Fix** (mechanical, ~30 min): wrap each page import in `React.lazy()` and add one
`<Suspense>` boundary in the router:

```tsx
const BattlePage = React.lazy(() => import('@pages/battle'));
// ...
<Route path="/battle" element={<Suspense fallback={<PageSpinner />}><BattlePage /></Suspense>} />
```

Since pages are already 1:1 with panels and contain no shared state, this is a
pure win with no architectural risk — verify with a build + a click-through
afterward (Suspense fallbacks are a visual thing, not typecheck-catchable).

> **✅ Done.** `router/app-routes/index.tsx` now `lazy()`-loads all 7 pages behind
> one `<Suspense>` (fallback reuses the existing global `.loading-container`/
> `.loading-spinner`). Verified in the build output that each panel lands in its
> own chunk — e.g. breed's `"DNA Strand"` string, marriage's `"Accept Proposal"`,
> and battle's `"Battle Log"` each resolve to a **different** ~20–40 kB chunk file,
> confirming a route now only downloads its own panel's code.
>
> **Calibration on the headline number:** the top-line bundle size barely moved
> (8.72 MB → 8.57 MB main chunk), because that 8.5 MB is overwhelmingly
> third-party wallet/crypto SDK code (`wagmi`, `viem`, `@dynamic-labs`,
> `@solana/web3.js`, WalletConnect, wallet-adapter — verified by grepping the
> chunk for those library signatures), not panel code. It's loaded eagerly by
> `AppProviders.tsx`, which wraps the entire router (`WagmiProvider`,
> `DynamicProvider`, `SolanaWalletProvider`, …) *before* any route renders — so
> route-level splitting structurally cannot reach it. This fix still does its
> job (a user on `/battle` no longer pays for breed/marriage/rename/train/
> level-up's code), it just doesn't move the number the original finding implied
> it might. Shrinking the vendor floor would mean deferring wallet-SDK
> initialization until first wallet interaction — a materially bigger,
> higher-risk change (touches every chain-connection code path) that was **not**
> attempted here and would need its own dedicated pass if wanted.

### 3.2 `tests/` doesn't mirror `src/` (Medium impact, low-medium effort)

`src` nests interaction panels three levels deep:
`components/pet/interactions/panels/<name>/`. `tests/` doesn't follow that
shape consistently — it drops different segments in different places:

| Source path | Test path | Segments dropped |
|---|---|---|
| `components/pet/interactions/panels/battle/` | `tests/components/pet/battle/` | `interactions`, `panels` |
| `components/pet/interactions/panels/{breed,marriage,rename,train,level-up}/` | `tests/components/pet/panels/` | `interactions` |
| `components/pet/interactions/state-card/` | `tests/components/pet/state-card.test.tsx` | `interactions` |
| `components/pet/interactions/standalone/` | `tests/components/pet/interactions/standalone.test.tsx` | _(correct — no drop)_ |

The effect: you cannot predict a test's location from its component's location,
or vice versa — `battle`'s tests are one level shallower than its five sibling
panels' tests, for no apparent reason. This makes "where's the test for X"
consistently a small (but real, and it happens 40+ times) navigation cost.

**Fix**: pick one shape and move files to match (`git mv`, mechanical). Given
`tests/components/pet/panels/*` already holds 5 of the 6 panels, moving
`tests/components/pet/battle/*` → `tests/components/pet/panels/battle/*` is the
smaller diff; the alternative (mirroring `interactions/panels/` in full) is more
correct long-term but touches more paths. Either is fine — consistency is the
actual goal, not which one.

> **✅ Done — went with the full mirror**, not the smaller diff. Reason found
> while executing: `tests/components/pet/interactions/standalone.test.tsx`
> *already* kept the `interactions` segment while `tests/components/pet/
> state-card.test.tsx` (for the sibling source dir `interactions/state-card/`)
> dropped it — a second, un-caught inconsistency between two files this table
> didn't list. The "drop `interactions`, keep `panels`" partial rule wouldn't
> have fixed that; only mirroring `src` exactly removes every exception. Moved
> (via `git mv`, no content changes — confirmed zero relative imports first):
> `tests/components/pet/battle/*` → `tests/components/pet/interactions/panels/
> battle/*`, `tests/components/pet/panels/{breed,level-up,marriage,rename,
> train}.test.tsx` → `tests/components/pet/interactions/panels/*.test.tsx`,
> `tests/components/pet/state-card.test.tsx` → `tests/components/pet/
> interactions/state-card.test.tsx`. `standalone.test.tsx` didn't move (it was
> already correct). Verified: `tsc -b`, full `eslint --max-warnings 0`, and the
> suite all green (40 files / 243 tests — vitest's glob discovered every file at
> its new path with no config change needed).

### 3.3 A couple of "god" files worth splitting (Medium impact, medium effort)

Two files mix multiple unrelated concerns in one place, where the codebase's own
precedent (§2, `battle-utils.ts`/`battle-matchmaking.ts`) suggests extraction:

- **`hooks/battle/useBattlePanel.ts` — 461 lines, single exported hook.**
  One `useBattlePanel()` call currently owns fighter selection, opponent
  selection + matchmaking wiring, taunts, the battle mutation itself, and result-
  dialogue orchestration. Candidate split (matching the existing sibling hooks
  `useBattleOutcome.ts` / `useResultDialogue.ts` already in the same folder):
  a `useFighterSelection` + delegate matchmaking to the existing
  `battle-matchmaking.ts`, leaving `useBattlePanel` as a thin composer.
- ~~**`components/wallet/account-dropdown/index.tsx` — 337 lines.**~~ **✅ Done**
  — extracted the ERC-20 multicall (`ERC20_BALANCE_OF_ABI` + `tokenContracts` +
  `useReadContracts` + the `tokenBalances`/`allFetched`/`withBalanceCount`
  derivations) into `hooks/useAccountTokenBalances.ts` (new file, 77 lines incl.
  types/docs). `account-dropdown` drops from 337 → 299 lines and now just calls
  `useAccountTokenBalances(chain?.id, address, isOpen)`; the JSX and all other
  behavior (clipboard copy, EVM/Solana auth) are untouched. Verified
  `account-dropdown.test.tsx` (which mocks wagmi's `useReadContracts`) still
  passes unchanged — the mock resolves correctly through the new indirection —
  plus the full suite (40 files / 243 tests) and tsc/eslint/`lint:css`.

Neither is urgent — both work and are tested — but both are the kind of file
where the next feature request ("add a 3rd chain", "add a new battle phase")
will be noticeably harder to land than it needs to be.

### 3.4 Small inconsistencies (Low impact, cheap to fix)

- ~~**Dead path alias**~~ **✅ Done** — `@utils/*` was declared in both
  `tsconfig.app.json` and `vite.config.ts` (kept in sync per the file's own
  comment) with no `src/utils/` directory backing it in either. Confirmed zero
  usages anywhere in `src`/`tests` first, then removed from both files.
- **Ambiguous filename**: `components/layout/index.tsx` is real, used code (the
  route-level `<Layout>` wrapping `<AppShell>`) — not a barrel file — but sitting
  directly in `layout/` next to `layout/app-shell/`, `layout/sidebar/`,
  `layout/top-bar/` (each in their own subdirectory), `layout/index.tsx` *reads*
  like a barrel re-exporting the folder. Consider `components/layout/layout/index.tsx`
  or renaming the component's own folder to something like `page-frame/` to
  remove the ambiguity, or just renaming the file to `Layout.tsx` so it visually
  stands apart from the barrel convention.
- **Uneven barrel-file (`index.ts` re-export) coverage**: `components/common/`
  and `components/ui/` have a barrel; `components/pet/` and most of
  `components/wallet/` don't (only `wallet/network-switcher/index.ts` does).
  Not wrong either way — direct deep imports are perfectly fine — but the mix
  means there's no single rule of thumb for "do I import from the barrel or the
  file" across the codebase.
- **`_shared` underscore prefix**: `components/pet/interactions/panels/_shared/`
  is the only underscore-prefixed directory in `components/` (everything else is
  plain kebab-case). It's a reasonable convention (marks "not a route/panel
  itself"), just currently a convention of one — worth either applying
  consistently to similar non-panel helper folders in the future, or dropping the
  underscore since kebab-case already reads fine without it.
- **No `import/order` (or similar) ESLint rule**: `eslint-plugin-import` is
  already a dependency and `import/no-duplicates` is enabled, but nothing
  enforces import grouping/ordering, so it currently varies file to file. Low
  priority — cosmetic — but cheap to add (`import/order` with `newlines-between:
  'always'`) if import-diff noise in PRs becomes annoying.
- ~~**`@typescript-eslint/no-explicit-any` is `'warn'`, not `'error'`**~~ **✅
  Done** — bumped to `'error'` in `eslint.config.js`. Verified `eslint . --max-
  warnings 0` still passes clean across the whole frontend (including `tests/`),
  confirming the zero-`any` baseline from §2 holds; a future `any` will now fail
  `lint:check` instead of silently passing.

## 4. Suggested order of attack

None of this is blocking; pick based on where the payoff is highest for what you're
about to do next.

1. **Route-level `React.lazy()`** (§3.1) — do this first. ~30 minutes, mechanical,
   directly improves every user's first-load time, zero architectural risk.
2. **Bump `no-explicit-any` to `'error'`** (§3.4, last bullet) — one-line config
   change, locks in a property you already have.
3. **Delete the dead `@utils/*` alias** (§3.4) — one-line tsconfig edit.
4. **Realign `tests/` with `src/`** (§3.2) — mechanical file moves, no logic
   changes; good "clean up while you're in there" companion to any future test
   work.
5. **Extract `useAccountTokenBalances` from `account-dropdown`** (§3.3) — do this
   before the next wallet-related feature request, not before.
6. **Split `useBattlePanel`** (§3.3) — do this before the next battle-flow
   feature request; higher effort/risk than the others (it's the most complex
   hook in the app), so it's last on purpose.
7. **Rename `components/layout/index.tsx`** and **decide on barrel-file
   convention** (§3.4) — whenever convenient; both are single-file/low-risk but
   also genuinely optional.
