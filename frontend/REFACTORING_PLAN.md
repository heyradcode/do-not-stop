# Frontend Refactoring Plan

_Status: proposal · Scope: `frontend/src` styling + structure · Goal: behavior- and visual-preserving cleanup_

## 1. Why now

The frontend was iterated heavily during the Crypto Pets redesign (gallery, sidebar,
battle, breed, level-up, rename, padding/card passes). That velocity left three kinds
of debt:

1. **Inconsistent, hard-to-scan CSS naming** — mixed conventions and the BEM `__` /
   `--` style you want gone (e.g. `.cp-shell__content`, `.breed-parent__stat-fill`).
2. **Fragmented design tokens** — 8+ competing CSS-variable prefixes.
3. **Dead code** left behind by reworks (orphaned files, unused components, dead CSS
   blocks and keyframes).

This plan fixes all three **incrementally, one component at a time, with no visual or
behavioral change** — each step stays shippable and verifiable.

## 2. Goals / non-goals

**Goals**
- One consistent styling convention; kill global BEM `__`/`--` names.
- Scope styles to their component so names are short and local.
- Consolidate design tokens into one coherent layer.
- Delete dead code.

**Non-goals (out of scope for this refactor)**
- No feature/behavior changes.
- No visual redesign — pixels stay the same.
- No dependency/framework swap beyond the styling approach.

## 3. Current-state assessment (measured)

| Aspect | Finding |
|---|---|
| CSS files | **34 files, ~7,360 lines**. Per-component `index.css` co-located with the component (good) + 3 globals: `styles/variables.css`, `styles/animations.css`, `styles/messages.css`. |
| Class naming | Two clashing schemes: **`cp-` + BEM** on chrome/gallery (`cp-shell__content`, `cp-nav-item__label`) and **unprefixed, ad-hoc** on panels (`breed-parent__body`, `battle-scene__hp-fill`, `combatant-card`, `lvl-badge`). Plus `is-*` state classes and `tone-*` modifiers. **12 CSS files use `__`.** |
| CSS variables | **8+ overlapping prefixes**: `--neon-*` (151), `--cp-*` (44), `--btn-*` (35), `--zi-*` (35), `--pc-*` (34), `--view-*` (20), `--shell-*` (16), `--tone-*`, `--wash-*`, `--tx-*`, plus generic `--spacing-*/--color-*/--font-*/--radius-*/--z-*`. Overlap + a large legacy-alias block in `variables.css`. |
| Tooling | Prettier present; **no stylelint**. Nothing enforces CSS naming/order. |
| Structure | An orphaned global stylesheet (`layout/index.css`) is imported nowhere; some panels wrap content in an `.interface` card, breed no longer does (inconsistent). |

## 4. The naming decision (the core ask)

You dislike the global BEM `__`. The root cause is **global class names** — because CSS
is global, everything needs a prefix (`cp-`) and BEM (`__`, `--`) to avoid collisions.
Two ways out:

### Option A — CSS Modules (recommended)
Rename `index.css` → `index.module.css`, import as `import s from './index.module.css'`,
reference `className={s.content}`. Vite supports this natively, zero deps.

- Names become **local and short**: `.cp-shell__content` → `.content` (used as `s.content`).
- **No prefixes, no BEM `__`/`--`** — collisions are impossible (Vite hashes names).
- Migratable **one component at a time**; global and module CSS coexist during the move.
- State classes become `s.active` (or `data-*` attributes); modifiers become plain
  classes (`s.toneCyan`) or props.

**Local naming inside a module:** `camelCase`, semantic, no component prefix
(`.content`, `.hero`, `.statBar`, `.hpFill`). Shared tokens stay global `var(--…)`.

### Option B — Keep global CSS, flatten the convention
If you'd rather not adopt modules: keep one prefix, drop BEM `__`/`--`, and use CSS
nesting (already used via `&`) for structure:
`.cp-shell__content` → `.shell { .content { … } }`. Less isolation than modules, but
removes the `__` noise. Still needs discipline + stylelint to prevent collisions.

### Option C — Tailwind / utility-first
Biggest change (rewrites the authoring model, ~all markup touched). Powerful but high
risk mid-project; **not recommended** for a "clean up what exists" pass.

> **Recommendation: Option A (CSS Modules).** It solves the naming complaint at the
> root, needs no new runtime deps, and migrates safely component-by-component.

## 5. Design-token consolidation

Collapse the prefix zoo into **one global token layer** in `styles/variables.css`,
kept in `:root` (CSS Modules still read `var(--…)`). Proposed structure:

```
--cp-color-*      primitives + semantic colors (fold in --neon-*, --zi-*, rarity, tones)
--cp-space-*      spacing scale (fold in --spacing-*, --pc-spacing-*)
--cp-radius-*     radii
--cp-font-*       families + sizes
--cp-shadow-*     shadows / glows
--cp-z-*          z-index scale
--cp-motion-*     durations / easings
--cp-wash-*       per-view background washes (keep; they map to the design)
```

- Pick **one prefix** (`--cp-`), delete duplicates and the legacy-alias block.
- Do this as a single mechanical pass with a rename map; verify build after.
- Component-scoped vars that are truly local (`--sc-accent`, `--tone-rgb`) can stay
  defined at the component root — they're fine, they don't leak.

## 6. Dead-code purge (do this FIRST — safe, fast, shrinks the surface)

Verified dead (safe to delete):

- **Orphaned stylesheet:** `components/layout/index.css` — imported nowhere. Its rules
  (content-slot padding, `:has(.dashboard-panel.pet-collection)` dashboard split) never
  load. **Decide:** delete it, or wire it if the split-dashboard view is still wanted.
  (Its padding/scroll intent was already re-implemented on `app-shell`/`interactions`.)
- **Unused battle components:** `panels/battle/parts/arena-slot.tsx`,
  `fighter-picker-card.tsx`, `opponent-picker-card.tsx` — 0 importers (orphaned by the
  battle-setup showdown rework). Delete + their CSS.
- **Unused keyframes** in `styles/animations.css`: `cp-power-ring`,
  `battle-result-enter`, `battle-result-pop` — 0 usages.
- **Dead CSS blocks:** old battle-setup styles (`.battle-stage`, `.battle-picker-*`,
  `.arena-slot`, `.battle-center`, the old `.battle-result-overlay/card`), and breed
  `.breed-traits` / `.breed-trait*` (trait-prediction section was removed).

_Method:_ for each, grep the class/keyframe across `src`; if unreferenced, remove; build.

## 7. Structural cleanups (after dead-code, before/with modules)

- **`.interface` wrapper inconsistency:** breed renders content directly in
  `panel-body`; other panels still wrap in `.interface`. Standardize (either all drop
  it — each is standalone-only — or all keep it). Note the `.interface` also carries the
  non-standalone `h4`/`p` styles; check each panel's `isStandaloneView` usage first.
- **Card nesting:** document the intended hierarchy — `surface` (the panel card) →
  header + `panel-body` (scroll) → content cards. Avoid re-introducing inner card
  wrappers.
- **State/modifier convention:** standardize `is-active`/`tone-*` → in modules, prefer
  `data-active` / `data-tone` attributes styled via `[data-tone="cyan"]`, or mapped
  local classes. Pick one.

## 8. Migration phases (each phase = shippable, verified)

| Phase | Work | Risk | Verify |
|---|---|---|---|
| **0. Tooling** | Add stylelint (+ standard config, order plugin) and prettier for CSS; optionally `typescript-plugin-css-modules` for typed `s.*`. Add `lint:css` script. | low | lint runs |
| **1. Dead-code purge** | §6 deletions. | low | grep-clean, `build` green |
| **2. Token consolidation** | §5 single-prefix token layer + rename map. | med (wide) | `build` + spot visual |
| **3. Modules migration** | §4 Option A, **leaf-first**: `ui/` (neon-button, neon-card, icon, toast) → `common/` → `layout/` → `pet/collection` → `pet/interactions/panels/*`. One component per PR: `index.css` → `index.module.css`, convert `className`, drop prefix/BEM, delete the old global rules. | med (many small) | per-component visual + `tsc`/`eslint`/`build` |
| **4. Sweep** | Remove any now-unused global class CSS; tighten tokens. | low | `build` |

**Ordering rationale:** start with leaf UI primitives (few consumers, low blast radius)
to prove the module pattern, then move up to panels. Chrome (`layout/`) is shared —
do it once the pattern is settled.

## 9. Guardrails

- **Every step:** `tsc -b`, `eslint --max-warnings=0`, and `vite build` must stay green.
- **Visual check per component.** The app is web3-gated (hard to headless-render), so
  do manual review: run `pnpm dev`, click through the touched screen, compare to before.
- **Small PRs** (one component / one concern). Behavior- and pixel-preserving only.
- Stylelint (Phase 0) catches naming/order regressions going forward.
- Keep a running **rename map** (old class/var → new) in this doc's appendix during the
  migration so reviews are mechanical.

## 10. Effort (rough)

- Phase 0 tooling: ~0.5 day.
- Phase 1 dead-code: ~0.5 day.
- Phase 2 tokens: ~1 day.
- Phase 3 modules: incremental; ~34 stylesheets, a handful per sitting. Spread over time.

## Appendix A — verified dead-code inventory

| Path / name | Note |
|---|---|
| `components/layout/index.css` | imported nowhere (orphaned) |
| `panels/battle/parts/arena-slot.tsx` | 0 importers |
| `panels/battle/parts/fighter-picker-card.tsx` | 0 importers |
| `panels/battle/parts/opponent-picker-card.tsx` | 0 importers |
| keyframe `cp-power-ring` (`styles/animations.css`) | 0 usages |
| keyframe `battle-result-enter` (`panels/battle/index.css`) | 0 usages |
| keyframe `battle-result-pop` (`panels/battle/index.css`) | 0 usages |
| CSS: `.breed-traits`, `.breed-trait*` (`panels/breed/index.css`) | component removed |
| CSS: old battle-setup blocks (`.battle-stage`, `.battle-picker-*`, `.arena-slot`, `.battle-center`, `.battle-result-overlay/card`) | replaced by showdown + `.battle-scene` |

## Appendix B — variable-prefix consolidation map (starter)

| Current | Target |
|---|---|
| `--neon-*`, `--cp-*` (colors) | `--cp-color-*` |
| `--zi-*` (interaction card tokens) | fold into `--cp-color-*` / `--cp-*` semantics |
| `--pc-*`, `--spacing-*` | `--cp-space-*` |
| `--btn-*` | `--cp-color-*` / component-local |
| `--shell-*` | `--cp-shell-*` (keep as layout tokens) |
| `--view-*`, `--wash-*` | keep (`--cp-wash-*`) — they map to the design |
| `--tone-*`, `--sc-*` | keep component-local (don't leak) |
| legacy alias block in `variables.css` | delete |

_(Fill in exact old→new class names per component as Phase 3 progresses.)_

## Appendix C — progress log

**Phase 1 — dead-code purge: DONE**
- Deleted orphaned `layout/index.css`; unused battle parts (`arena-slot`,
  `fighter-picker-card`, `opponent-picker-card`); unused keyframes; removed
  breed trait-prediction CSS; removed dead battle-setup CSS (~640 lines) and
  the 8 orphaned battle keyframes; pruned unused `BattleSetupProps` + dead hook
  internals.

**Phase 2 — token consolidation: DONE**
- Deleted the legacy alias block.
- Merged `--neon-*` → `--cp-*` (141 refs, collision-checked).
- Prefixed all remaining global tokens under `--cp-` (`--color-*`,
  `--spacing-*`, `--font-size-*`, `--border-radius*`, `--transition*`,
  `--z-*`, `--wash-*`, `--shell-*`, `--rarity-*`, fonts, etc.).
- Global token layer is now a single `--cp-*` namespace. Component-local
  theming vars (`--btn-`, `--zi-`, `--view-`, `--tone-`, `--sc-`, `--pc-`,
  `--tx-`) intentionally left scoped.

**Phase 3 — CSS Modules: IN PROGRESS (approach: Option A)**

Convention: `index.css` → `index.module.css`, `import s from './index.module.css'`,
local `camelCase` prefix-free class names (`.root`, `.card`, dynamic via
`clsx(s.root, s[variant])`), no `cp-`/`__`. Keyframes stay in the module
(auto-scoped). `tsc` resolves `.module.css` via the existing `vite/client` ref.

Migrated (clean leaves + Icon + first feature component):
- ✅ `ui/neon-card` — `.card`
- ✅ `common/transaction-status` — `.root` + children + state classes
- ✅ `ui/toast` — `.viewport`/`.toast` + tone classes
- ✅ `ui/icon` — `.icon` + tone/glow; replaced global `className="no-gap"` API
  with a `noGap` boolean prop (8 call sites updated)
- ✅ `layout/top-bar` — `.topbar`/`.badge`/`.gold`/… (self-contained feature
  component; child AccountDropdown via `:global(.account-dropdown)`)
- ✅ `layout/sidebar` — full `cp-*__*` BEM → local classes; dynamic tone via
  `s[item.tone]`, states via `s.isActive/isDeferred`; moved `cp-orb-float` into
  the module
- ✅ `layout/ambient` — `.ambient`/`.canvas`/`.grid` (trivial)

- ✅ **shared loading/error utilities → global** (prereq for gallery): moved
  `.loading-container`/`.loading-spinner`/`.error-container` out of the gallery
  stylesheet into `styles/messages.css` (the global "class names only" file), so
  they stay global for `interactions/standalone` after gallery modularizes.
  `native-balance` keeps its own scoped `.balance-loading .loading-spinner`
  `!important` override (independent, left as-is). `cp-spin-slow` stays in
  `animations.css`.
- ✅ `pet/collection/pet-gallery` (main screen) — full `cp-*__*`/`cp-*--*` BEM →
  local classes; dynamic tone via `clsx(s.stat, s.cyan/violet/gold)`, leaderboard
  `is-me`→`s.isMe`, send-button cooldown `on-cooldown`→`s.onCooldown` (dropped
  the style-less `is-ready` marker). Shared keyframe `cp-float` (used by 4 other
  non-module stylesheets) **duplicated into the module** — verified in built CSS
  that def+usage hash to the same `_cp-float_*` name while the global un-hashed
  `cp-float` remains for the others. Map `(s) => …` stat-tile param renamed to
  `tile` to free the `s` module import.

- ✅ `layout/app-shell` — `.cp-shell`/`.cp-shell__frame`/`.cp-shell__main`/
  `.cp-shell__content` → `.shell`/`.frame`/`.main`/`.content`. This was the
  original complaint (`.cp-shell__content`). Turned out self-contained: the
  classes are used only in its own tsx; the `--cp-shell-*` *variables* (used by
  sidebar/top-bar) are global tokens, unrelated to the classes, and stay put.
  No keyframes, no dynamic classes. The whole `layout/` chrome is now modules.

- ✅ `wallet/token-balance` — `.token-balance` → `.tokenBalance`; nested child
  classes (`.info/.symbol/.name/.amount/.value`) stay nested and get scoped.
  Self-contained leaf, no external refs, no dynamic classes.

- ✅ `wallet/native-balance` — `.native-balance`→`.nativeBalance` +
  `.balance-*`→camelCase. Its small spinner override stays a `:global(.loading-
  spinner)` under the local `.balanceLoading` ancestor, so the global base (from
  messages.css) + this override still cascade exactly as before; verified the
  built selector `_balanceLoading_* .loading-spinner`. `@keyframes spin` (used
  only here) kept in the module — verified def+usage hash to one `_spin_*`. The
  `className` prop passthrough now uses `clsx(s.nativeBalance, className)`.

- ✅ `pet/creation/create-pet-modal` — `.create-pet-body`→`.createPetBody`
  (passed to `<NeonModal contentClassName>`), `.form`/`.field` scoped locally;
  nested `label`/`input` element selectors ride along. `.pending-hint`/
  `.success-message` stay plain-string globals (messages.css); `.mint-cost` is a
  dead/unstyled class kept as a plain string to preserve the DOM. No external
  refs, no keyframes.

- ✅ `pet/transfer/send-pet-modal` — `.send-pet-body`→`.sendPetBody` (NeonModal
  `contentClassName`), `.preview`/`.details`/`.recipient`/`.actions`/`.cancel`
  scoped; the input's `.invalid` state modifier now `inputInvalid ? s.invalid :
  undefined`. No external refs, no keyframes.

**Build-command note (avoid false-positive verification):** `typescript` AND
`vite` are hoisted to the monorepo ROOT `node_modules`, not `frontend/`. Run
`node ../node_modules/typescript/bin/tsc …` and `node ../node_modules/vite/bin/
vite.js build`. A frontend-local path crashes with MODULE_NOT_FOUND; if piped to
`tail`/chained with `&&` the crash is masked and greps read a STALE `dist`. Check
the real `VITE_EXIT` and look for the `✓ built` line.

**GOTCHA — keyframes in modules:** Vite scopes `animation-name` references
even when the `@keyframes` is defined globally (`animations.css`), so a module
referencing a global keyframe silently breaks (name hashes to `_cp-x`, def
stays `cp-x`, no match — no error, animation just doesn't run). Fix: any
component-specific keyframe a module uses must be DEFINED IN THAT MODULE
(top-bar's `cp-glow-pulse`/`cp-streak-fire` were moved out of animations.css).
Verify per conversion: `grep '@keyframes _'/'animation:_' dist/assets/*.css`
— the two hashed names must match. Watch this for `ambient`/`sidebar`/`gallery`
(they use `cp-float`, `cp-orb-float`, `cp-spin-slow`, etc.); if a shared
keyframe is used by BOTH modules and non-modules, it can't simply move —
duplicate it into the module, or reference via `:global()` if supported.

**Remaining (harder — externally-referenced classes; each needs the external
selectors migrated in the same commit + per-screen visual verification):**
- `ui/neon-button` — `.neon-btn`/`.tone-*`/`.size-*` styled from
  `interactions.css`, `breed/index.css`, `account-dropdown/index.css`.
- `common/dashboard-panel` — `.surface`/`.panel-body`/`.title-bar`/… styled by
  every interaction panel + gallery; the shared panel shell. Large.
- `ui/pet-search-dropdown` — `.psd-input` referenced by `interactions.css`.
- `ui/neon-modal` — `.neon-modal .dialog` styled by `network-switcher`.
- Then feature components (`layout/*`, `pet/*`, `wallet/*`) — many still use the
  `cp-`/BEM global convention (sidebar `.cp-sidebar__*`, gallery `.cp-*`, etc.).

**Recommended next-session approach for the cross-cutting ones:** convert the
component to a module, expose the classes other files need via a small stable
contract (either keep a `:global()` hook for the exact selector another file
targets, or move that styling into the owning component), and migrate the
external selectors in the same commit. Verify each screen visually (the app is
web3-gated — headless render isn't reliable).

