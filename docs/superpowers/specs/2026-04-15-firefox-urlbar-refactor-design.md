# Firefox-Style Urlbar Refactor Design

## Goal

Refactor Zenbar's current and new tab pickers to follow Firefox's urlbar model: heuristic-first ranking, provider-driven result generation, muxed result composition, and default-result submission that is distinct from explicit row selection.

## Scope

In scope:

- replace the current flat background ranking flow with a query-context and provider pipeline
- add heuristic providers for autofill, history URL, and fallback behavior in Firefox order
- add normal providers for tabs, bookmarks, history, suggestions, and adaptive input history
- replace score-sort dedupe with a muxer that composes the visible result list
- update the UI selection model so default result and explicit row selection are separate concepts
- keep `tab-search` as a separate explicit-selection mode
- add an opt-in adaptive learner backed by `chrome.storage.local`
- add Options UI for the adaptive learner toggle and reset control

Out of scope:

- pixel-perfect Firefox UI recreation
- recreating Places or Firefox internals exactly
- changing extension packaging or MV3 structure
- rewriting shortcut, options export/import, or unrelated settings flows

## Firefox Model To Emulate

Firefox's urlbar is not a single sorted list. It uses:

1. a query context built from the typed input and browser state
2. heuristic providers that compete for the default action
3. normal providers that generate additional candidates
4. a muxer that composes the final list in group order with dedupe rules
5. a UI selection model that distinguishes the current default result from explicit row selection

Zenbar should copy this architecture in simplified form rather than trying to simulate Firefox with more conditional ranking rules inside the existing service worker.

## Architecture

### Query Context

Add a dedicated `QueryContext` object in `src/background/query-context.ts`.

It should carry:

- raw and normalized input
- stripped and URL-normalized variants
- query classification (`search`, `origin-like`, `url-like`, `deep-url`)
- mode and contextual tab/window information
- allowed sources and permission state
- pending provider state
- heuristic result
- normal candidate buckets
- final visible results
- default result
- allow-empty-selection flag
- request/version id for stale-query protection

### Providers

Add a provider contract in `src/background/providers/base.ts` with:

- `id`
- `kind` (`heuristic` or `normal`)
- `group`
- `isActive(context)`
- `start(context)`

Heuristic providers:

- `AutofillHeuristic`
- `HistoryUrlHeuristic`
- `FallbackHeuristic`

Normal providers:

- `TabsProvider`
- `BookmarksProvider`
- `HistoryProvider`
- `SuggestionsProvider`
- `InputHistoryProvider`

### Heuristic Order

For current and new tab modes, the heuristic winner order should be:

1. autofill heuristic
2. history URL heuristic
3. fallback heuristic

Fallback should always be able to synthesize a default result from the raw input so the system never degrades into picking a random top-scoring normal result.

### Muxer

Replace `dedupeAndSortResults()` with a `src/background/muxer.ts` stage that:

- places the winning heuristic first
- composes normal groups in fixed order
- dedupes URL-like results by normalized URL key
- dedupes query-like results by normalized query key
- suppresses duplicate history rows when a stronger tab result exists
- keeps suggestions under the heuristic/default result
- enforces the visible result cap

### Execution Layer

Move navigation and action execution into `src/background/submit.ts` so result generation and result execution are separate concerns.

### UI Selection Model

Add `src/ui/selection-model.ts` and make `src/ui/command-app.ts` consume it.

The UI should track:

- associated default result for the current input
- explicit selected row index
- user selection behavior (`none`, `arrow`, `pointer`)
- allow-empty-selection semantics supplied by the query engine

`Enter` should use the associated default result unless the user has explicitly moved selection to another row.

### Adaptive Learner

Add a local adaptive learner using `chrome.storage.local`.

- default: disabled
- when disabled: no reads, no writes
- when enabled: successful selections may influence autofill/input-history providers
- include a reset operation to clear learned entries

This is an approximation of Firefox's adaptive/input history model suitable for an extension environment.

## Settings And Privacy

Add `adaptiveHistoryEnabled: boolean` to settings.

Requirements:

- default to `false`
- expose a toggle in Options
- expose a `Clear learned history` control in Options
- explain that learned picks are stored locally in Zenbar
- keep browser `history` heuristics behind the existing optional `history` permission

## Mode Behavior

`current-tab` and `new-tab`:

- full Firefox-style heuristic pipeline
- default result submission behavior
- explicit row selection only after arrow or pointer interaction

`tab-search`:

- separate provider path
- explicit-only result navigation
- no Firefox-style URL/search heuristic competition

## Error Handling

- every query carries a request/version id
- stale provider results must never overwrite newer input
- provider failures are isolated to that provider
- submit falls back to the current default heuristic if explicit selection is stale
- if no default result exists, fallback heuristic is regenerated from the typed input

## Testing Strategy

Add coverage for:

- query classification
- heuristic ordering
- adaptive learner read/write/reset gating
- muxer composition and dedupe
- UI default-result vs explicit-selection behavior
- service worker query/submit integration

Manual verification should cover:

- `cats`
- `example.com`
- `example.com/foo`
- arrow navigation and Enter behavior
- click selection
- `tab-search`
- adaptive learning off/on and reset

## Success Criteria

The refactor is complete when:

- current/new-tab ranking is driven by query context, providers, and muxer rather than flat sorting
- the default result is distinct from explicit row selection
- heuristic winner order follows the Firefox-style order defined above
- adaptive learning is opt-in and resettable
- tests, typecheck, and build all pass
