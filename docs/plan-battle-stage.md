# Plan: the battle stage

`BattleStage` is the full-screen arena that opens when Start is pressed. It currently renders
a spinner, a flat list of taunt lines, an HP-bar scene, a scrolling strike log, and a result
sheet centred over all of it. It reads as a status page for a fight rather than the fight.

Scope is `mobile/`. Three of the five items below need no other package. The two that touch
data are fixed in `useBattlePanel`, which is mobile's own file, not in `shared/`.

---

## Three findings up front, because they decide the order

**1. The panel throws away who is speaking.** `UseBattlePanel` exposes `taunts: string[]`,
built as `taunts.turns?.map((t) => t.text)`. The underlying `DialogueTurn` is
`{ speaker: 'attacker' | 'defender'; phase; text }`, so the side each line belongs to exists
and is discarded one layer before the component that needs it. Nothing can put a line beside
its avatar until this stops. This is the whole of the complaint about message history, and it
is a two-line change.

**2. The panel throws away the shape of each strike, too.** `strikeLog: string[]` is built by
mapping `animation.history` through a formatter. `history` is `StrikeLogEntry[]`, which
carries `attacker: 1 | 2`, `damage`, `crit`, `isMagic`, `heal`, `elementMult`,
`furyTriggered`. No hit effect can know who was hit, how hard, or whether it crit while the
component only receives a sentence.

**3. The two pets stop existing before the fight ends.** Publishing a receipt puts the fighter
on cooldown, which drops it out of `readyPets`, so `panel.fighter` is null by the time a
result is on screen, and `panel.opponent` can leave the matchmaking list the same way. The
panel already solves this for names with `personasRef`, a `BattlePersonas` captured at start.
`DialoguePetInput` holds `petId`, `name`, `level`, `rarity` and `dna`, which is enough to draw
an avatar. **Any avatar in the arena must read personas, not `fighter`/`opponent`, or it
vanishes at the moment of victory.**

---

## 1. Two fighters, facing each other

### Current state

`BattleScene` renders two stacked `HpBar` rows, a flourish line and a scrolling log. There is
no pet on screen at any point. The one thing a player recognises a pet by, its art, is absent
from the only screen that is about two specific pets.

### Proposed

An arena band across the top: attacker on the left, defender on the right, each with

- `PetArt` at 72, from the persona's `petId` and `dna`
- name and level under it
- an HP bar under that, keeping `HpBar`'s existing drain animation
- the loser dimmed to ~40% opacity once a result lands

Between them, the `GlyphDivider` already used by Breed and Battle setup, with `VS`.

### Work

| file | change |
|---|---|
| `src/screens/parts/BattleStage.tsx` | the arena band |
| `src/screens/parts/BattleScene.tsx` | HP bars move into the band; the component keeps the log |
| `src/hooks/battle/useBattlePanel.ts` | expose `personas` so the arena can draw both sides |

`PetArt` takes a `Pet`. A persona is not one, so either it gets a narrow prop type
(`Pick<Pet, 'id' | 'chain' | 'assetKey' | 'dna' | 'name'>`, which is what it already reads) or
the panel exposes the two pets it captured rather than only their dialogue inputs. The second
is less work and keeps `PetArt` untouched.

---

## 2. A line sits beside whoever said it

### Current state

```tsx
{panel.taunts.map((line, i) => (
    <Text key={i} style={styles.tauntLine}>{line}</Text>
))}
```

Every line, both speakers, one column, no attribution. The result dialogue does better: it
renders `resultTurns` with the speaker's name in the speaker's colour. The taunts cannot,
because the speaker is gone by then (finding 1).

### Proposed

Taunts and result turns become the same thing: a speech bubble anchored to its speaker.

- attacker lines left-aligned, tail pointing left, cyan border
- defender lines right-aligned, tail pointing right, magenta border
- max width ~78%, so a bubble never spans the arena and the side is obvious at a glance
- newest last, the column scrolls, and it auto-scrolls only when already at the bottom
- each bubble fades and rises 8px on arrival

The tail is a rotated 8px square behind the bubble, not an image. There is no icon set here
and this needs no dependency.

### Work

| file | change |
|---|---|
| `src/hooks/battle/useBattlePanel.ts` | `taunts: DialogueTurn[]` instead of `string[]` |
| `src/screens/parts/SpeechBubble.tsx` *(new)* | one bubble, side and colour from the speaker |
| `src/screens/parts/BattleStage.tsx` | one column, taunts then result turns, in order |

Two consumers change with the type: `BattleStage` and any test asserting on `panel.taunts`.
`useResultDialogue` already returns `DialogueTurn[]`, so the two sources become one list.

---

## 3. Strikes should be visible, not narrated

### Current state

A strike changes two numbers and appends a sentence. `useLiveBattleAnimation` already paces
them one every 700ms, so the timing is there and nothing uses it.

### Proposed

Per strike, driven off `StrikeLogEntry`:

- the striker lunges 12px toward its target and back, ~180ms
- the struck pet flashes its border and shakes 6px, ~120ms
- a damage number floats up 24px from the struck pet and fades, in `danger`, doubled in size
  and in `warning` when `crit`
- `isMagic` tints the number `purple` rather than `danger`
- `heal > 0` floats a second number up from the striker in `success`
- `furyTriggered` pulses the striker's glow

All of it is transform and opacity, so `useNativeDriver: true` throughout. The HP bar stays on
the JS driver because width is a layout property, which is already the case and already
commented.

### Work

| file | change |
|---|---|
| `src/hooks/battle/useBattlePanel.ts` | expose `currentStrike: StrikeLogEntry \| null` beside `flourish` |
| `src/screens/parts/StrikeEffects.tsx` *(new)* | the lunge, shake and floating numbers |
| `src/screens/parts/BattleScene.tsx` | keep the log, hand the arena the strike |

Keep `flourish`. It is the line a player reads when they look away and back, and it is what
the screen reader gets.

---

## 4. The verdict should not cover the fight

### Current state

An absolute overlay centred on the arena, holding title, rounds, HP left, XP, the whole result
dialogue and two buttons. It lands on top of the two pets the player was just watching, which
is the moment they most want to see.

### Proposed

- the verdict is a banner in the arena band, between the two pets, where `VS` was: `Victory`
  or `Defeat`, plus `rounds · HP left · +XP` on one line
- the loser dims, the winner keeps its glow and pulses once
- the result dialogue joins the same bubble column as everything else, rather than being a
  second list inside a sheet
- `Watch again` and `Close` move to a pinned row at the bottom, matching `ScreenActionBar`
  everywhere else in the app
- the banner drops in and settles, ~220ms spring, and holds until dismissed

This removes the nested-overlay layout entirely. The arena is one screen with a beginning, a
middle and an end, rather than a screen with a sheet on top of it.

### Work

| file | change |
|---|---|
| `src/screens/parts/BattleStage.tsx` | banner replaces the overlay; actions move to a pinned row |

---

## 5. Reduced motion, and what the screen reader gets

Everything above is decoration over information that must survive without it.

- `useReduceMotion` already exists. Under it: no lunge, no shake, no float, no banner spring.
  The damage number appears and disappears rather than travelling, and HP bars jump.
- the arena band gets an `accessibilityLabel` naming both fighters and their HP
- bubbles are read as "Rex says: …", which the speaker makes possible for the first time
- the verdict banner takes `accessibilityLiveRegion="polite"` so it is announced when it lands
- `GlyphDivider` is already hidden from screen readers and stays that way

---

## Decisions needed

| # | question | recommendation |
|---|---|---|
| 1 | Persona-shaped avatars, or expose the captured `Pet` objects from the panel? | **Expose the pets.** `PetArt` is untouched and the arena gets rarity and art for free |
| 2 | Do taunts and result lines share one column, or stay two lists? | **One column.** They are the same conversation, and one list is what makes the speaker rule uniform |
| 3 | Damage numbers on every strike, or only crits? | **Every strike.** A fight is 4 to 12 strikes, and only-on-crit reads as a bug the rest of the time |

---

## Testing

`BattleScreen.test.tsx` is 47 tests and already drives the arena through `openArena`. Four of
them assert on `panel.taunts` as strings and will need the turn shape.

Worth adding:

- a taunt from the defender renders on the defender's side, and one from the attacker does not
- the arena still names both fighters after the fighter leaves `readyPets`, which is finding 3
  and the one regression that would otherwise ship silently
- a crit renders a different damage treatment from a normal strike
- the verdict does not cover the two pets: both avatars are still mounted with the banner up
- under reduced motion, a strike still updates HP and still shows its damage number

The existing replay tests already advance timers one strike at a time. Strike effects should
reuse that helper rather than introducing a second timing model.

---

## Suggested order

1. **§2 speech bubbles.** The complaint that started this, and the smallest change: a type on
   the panel plus one new component.
2. **§1 the arena band.** Everything else hangs off having two pets on screen.
3. **§4 the verdict.** Once the band exists, the banner has somewhere to live, and this
   deletes the overlay rather than adding to it.
4. **§3 strike effects.** The largest, and the only one that is pure decoration, so it goes
   last and can be cut without leaving a gap.
5. **§5 reduced motion.** Alongside §3, not after it: retrofitting a motion flag across four
   animations costs more than passing it in as each one lands.
