# CryptoPets mobile

React Native client for the `do-not-stop` monorepo, sharing `@shared/core` with the web frontend.
Licensed PolyForm Noncommercial 1.0.0, like the rest of the app packages (see the root `LICENSE`).

## Setup

Run everything from the repo root. The package manager is pnpm; `npm` and `yarn` will not resolve
the workspace links this package depends on.

```sh
pnpm install:all              # root + frontend + website + backend + mobile + contracts/ethereum
cp mobile/env.example mobile/.env
```

Fill in `REOWN_PROJECT_ID` from https://dashboard.reown.com and point `API_URL` at your backend.
On an Android emulator the host is `10.0.2.2`; on a physical device or LDPlayer it is your LAN IP.
Every other variable has a working default.

> **Editing `.env` needs a rebuild, not a reload.** `react-native-dotenv` inlines `@env` at Babel
> transform time and Metro caches transforms, so a Fast Refresh picks up nothing. Restart with
> `pnpm --filter mobile start --reset-cache` and rebuild. An installed APK has the old values
> bundled inside it, where a cache reset cannot reach them at all.

## Commands

| Task | Command |
|---|---|
| Metro dev server | `pnpm --filter mobile start` |
| Run on Android | `pnpm --filter mobile android` |
| Run on iOS | `pnpm --filter mobile ios` |
| Lint | `pnpm --filter mobile lint` |
| Test | `pnpm --filter mobile test` |
| One test file | `pnpm --filter mobile exec jest __tests__/<name>.test.tsx` |

There is no `build` script. React Native has no equivalent, so "it works" means lint, jest, and the
app running on a device, never a successful compile. `tsc --noEmit` is useful but is not a gate:
it reports pre-existing errors in `shared/` that this package does not own.

iOS also needs CocoaPods before its first run:

```sh
cd mobile/ios && bundle install && bundle exec pod install
```

## Which chain this targets

Two testnets carry a full deployment, **Base Sepolia (84532)** and **Sepolia (11155111)**.
`EVM_CHAIN_ID` picks which one the app starts on and defaults to Base Sepolia, matching the web
frontend. A player can switch between them in the app and the pet list follows, because contract
addresses are keyed by chain in `src/chains/ethereum/contracts.ts` and `useEvmPetsConfig` resolves
them from the wallet's current chain.

Addresses are built in, so **leave `PETCORE_ADDRESS` and friends unset** unless you are deliberately
overriding. They apply to `EVM_CHAIN_ID`'s chain only, since the names carry no chain of their own,
which makes a stale value worse than a missing one: it silently points the new target at the old
chain's proxy and every read returns an empty `0x` that looks like a decode bug.

Base Sepolia's roster started empty on 2026-08-06, so **mint a pet before expecting the gallery to
show anything**. An empty gallery on first run is correct, not a failure.

Solana is wired for devnet and reached through the same chain-blind hooks. It has not yet been
exercised end to end on a device.

## How it fits together

`App.tsx` mounts the provider stack in the same order as the frontend's `AppProviders.tsx`, with
`NavigationContainer` where the web app has `BrowserRouter`:

```
SafeAreaProvider > Wagmi > QueryClient > AppKit > [SolanaAuthSigner]
  > SolanaAppKitAnchorBridge > ApiClient > Auth > PetsConfig > Toast > NavigationContainer
```

Things worth knowing before changing any of it:

- **Wallets go through Reown AppKit**, not Dynamic Labs as on web. Parity between the two apps is at
  the level of behavior and configuration, not libraries.
- **Pet reads and writes are chain-blind.** Screens call `@shared/core` hooks (`usePetList`,
  `useCreatePet`, `useBattlePets`, and so on) which resolve through the `ChainAdapter` layer. Do not
  reach for wagmi or Anchor directly in a screen.
- **`useActiveChain` decides which adapter runs**, and it resolves Solana from the auth-signer store
  and nothing else. `src/solana/SolanaAuthSigner.tsx` is what registers it; without that a connected
  Solana wallet is invisible to every one of those hooks.
- **Navigation is five tabs plus seven stack routes.** `Gallery`, `Battle`, `Breed`, `Level Up` and
  `Train` are tabs. `Marriage`, `Rename`, `Defense` and `Equip` are pushed over the shell from a
  per-pet action, because each acts on one chosen pet. `Leaderboard`, `Inventory` and `Chat` are
  pushed from the account sheet instead: they act on no single pet, and a bottom bar past five
  entries truncates every label.
- **The landing screen is registered conditionally**, not redirected away from. While disconnected
  only `Landing` exists, so there is no window where a tab screen renders against a wallet that is
  not there.
- **`shared/` and `protocol/` are consumed as raw TypeScript**, with no build step, by this app and
  the frontend at once. A change in either affects both.

## Known gaps

- No ERC-20 token balances. The target chain's popular-token list holds a single testnet LINK.

Recently closed, so the older notes claiming otherwise are wrong: the battle replays
round by round from the verified receipt and plays the AI result dialogue after it; pet
art renders through `PetArt` when `IMAGE_SERVICE_URL` is set, falling back to the emoji
avatar; the leaderboard, the inventory, equipment and private chat all have screens. See
`docs/plan-mobile-frontend-parity.md` for what is left.

## Android package name

The app **display name** is **CryptoPets** (see `app.json`, Android `res/values/strings.xml`, and
iOS `CFBundleDisplayName`). The Android **namespace** and **Kotlin/Java package** remain
**`com.cryptozombies`** (e.g. `MainActivity` under `com/cryptozombies/`, `namespace` in
`android/app/build.gradle`).

The Play Store **`applicationId`** is configured separately in `android/app/build.gradle`
(`defaultConfig.applicationId`); it can differ from the namespace, but the **native package /
namespace** is intentionally not rebranded to match CryptoPets yet.

We are **not** renaming that Android namespace/package until React Native fixes autogenerated code
that can reference a **stale or wrong `BuildConfig` package** when renaming apps or using flavors.
See [facebook/react-native#52754](https://github.com/facebook/react-native/issues/52754).

## Troubleshooting

**A `.env` change had no effect.** See the rebuild note above. This is almost always the cause.

**`pnpm install` fails with `ERR_PNPM_ENOENT ... <pkg>_tmp_<pid>`.** Metro is running and its
watcher holds handles in `node_modules` while pnpm renames temp directories. It fails on a different
package each attempt, so it looks transient and is not. Stop Metro and install again. A partial
failure rewrites `pnpm-lock.yaml` without recording the dependency in `mobile/package.json`, so
imports fail while the lockfile claims the package exists; add the specifier by hand and re-run.

**WebSocket 3000 "Unauthorized: origin not allowed".** The Reown dashboard project has an allowlist
that does not include this build's origin. Leave it empty while developing, or add the exact
`metadata.url` from `src/AppKitConfig.ts` plus your Metro origin.

**Wrong network banner that will not clear.** The wallet approved a different chain set than the app
requested, which WalletConnect freezes at connect time. Reconnecting is the only reliable way to
widen it. `src/components/NetworkGate.tsx` explains which of the two cases you are in.

**A jest suite dies importing `@shared/core`.** The barrel re-exports the Solana adapter and drags
the whole Solana runtime in, ending at an unresolvable `rpc-websockets`. Stub the barrel with
`jest.mock` and pull the specific module in through `jest.requireActual` with a relative path.
