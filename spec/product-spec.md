# Zenbar Product Spec

Status: Locked for v1

## Overview

Zenbar is a Chromium extension that provides a floating, centered, luxury command bar for navigation, search, and tab switching. It mimics the feel of browser-native URL bar flows and prefers native-style shortcut defaults where the browser allows them.

## Core Principles

1. The UI should feel calm, premium, and minimal.
2. The command bar should appear as a centered floating glass surface with blur.
3. Results should feel immediate and fuzzy-ranked, not segmented into heavy dashboards.
4. Search execution should respect the user's default browser search engine.
5. Remote suggestion providers must be opt-in.

## Chromium Constraints

1. Chromium does not expose a general API for live suggestions from the user's current default search engine.
2. Chromium lets the extension define default shortcuts and read assigned shortcuts, but not directly rebind them from extension UI.
3. Shortcut assignment can still vary by browser or user environment, so Zenbar should surface unassigned or rejected shortcuts in settings.

## Default Shortcuts

1. `Cmd/Ctrl+L`: edit current tab / search in current tab
2. `Cmd/Ctrl+T`: open target in new tab
3. `Cmd/Ctrl+Shift+A`: tab search

## Modes

## 1. Current Tab Mode

Purpose: mimic URL edit and current-tab search flow.

Behavior:

1. Opens a centered floating overlay on the current page.
2. Prefills the input with the current tab URL.
3. Selects the full URL so the user can immediately replace or edit it.
4. If the submitted input is a URL, Zenbar navigates the current tab.
5. If the submitted input is not a URL, Zenbar searches in the current tab using the browser default search engine.
6. While typing, results are shown as a fuzzy blend of enabled sources.

## 2. Open In New Tab Mode

Purpose: mimic new-tab search/open behavior using a custom shortcut.

Behavior:

1. Opens the same centered floating overlay on the current page.
2. Starts with an empty input.
3. Uses the same result model and ranking system as Current Tab Mode.
4. If the submitted input is a URL, Zenbar opens it in a new tab.
5. If the submitted input is not a URL, Zenbar searches in a new tab using the browser default search engine.
6. If the selected result matches an already open tab, Zenbar switches to that tab instead of duplicating it.

## 3. Tab Search Mode

Purpose: mimic a better tab search experience.

Behavior:

1. Opens the same overlay in a tab-focused mode.
2. Immediately shows all open tabs.
3. Excludes the current tab.
4. Prefers tabs from the current window in ranking.
5. Enter switches to the highlighted tab.
6. `Cmd+X` closes the highlighted tab only while the list is active.
7. Rows should include a visible close affordance so tab closing is discoverable.

## Result Sources

Zenbar supports a fuzzy blend of these sources.

1. Search action row
2. Open tabs
3. Bookmarks
4. History
5. Optional remote suggestions

## Source Ranking

1. Default ranking is a fuzzy blend across enabled sources.
2. The search action row should remain highly ranked for non-URL queries.
3. In Tab Search Mode, current-window tabs receive extra weight.
4. Users will be able to prefer certain source types in settings.

## Result Metadata

Results must be visually distinguishable with lightweight metadata.

1. Open tabs show favicon plus a small tab indicator.
2. Bookmarks show favicon plus a small star indicator.
3. History rows show favicon plus a small history-style indicator.
4. Tab rows in Tab Search Mode include a visible close affordance.

## Search Execution And Suggestions

Search execution:

1. All search submissions use the browser default search engine.
2. Zenbar uses Chromium's search API for execution where appropriate.

Suggestion providers:

1. `Off`
2. `DuckDuckGo`

Rules:

1. DuckDuckGo suggestions are opt-in.
2. DuckDuckGo suggestions do not need explicit per-row labels once the user opts in.
3. If the user chooses a DuckDuckGo suggestion, Zenbar uses that text but still executes search with the browser default engine.
4. Remote suggestion requests must be debounced and cancellable.

## Fallback For Restricted Pages

1. Some browser-owned or restricted pages will block overlay injection.
2. On those pages, Zenbar should open a small standalone extension window with the same UI and mode behavior.

## Visual System

1. Dark, blurred, floating glass surface.
2. Centered layout with soft edges and subtle borders.
3. Compact pill-like idle state.
4. Expanded state with thin divider and compact result rows.
5. Sparse empty state.
6. Minimal chrome, icon-led metadata, tight rhythm.

## Typography

1. Primary font: `Bricolage Grotesque`
2. Fallback font: user/default sans-serif stack

## Build Toolchain

1. Zenbar uses `bun` as the local project toolchain for build and developer scripts.
2. Extension runtime code must remain browser-compatible and cannot depend on Bun runtime APIs.
3. The unpacked extension load target is the generated `dist/` directory.

## Settings

Settings are implemented as a full options tab.

The settings UI should use the same luxury dark-glass visual language as the search bar.

Settings include:

1. Enable or disable result sources
2. Source weighting and source preference controls
3. Suggestion provider selection
4. Privacy explanation for remote suggestions
5. Import/export JSON
6. Keyboard shortcuts section

## Keyboard Shortcuts In Settings

1. Show current shortcut assignments for all three modes.
2. Show when a shortcut is missing or unassigned.
3. Provide a `Change Shortcuts` action that routes users to the browser shortcut manager.
4. The extension settings page does not directly rebind shortcuts.

## Permissions

Required install-time permissions:

1. `activeTab`
2. `scripting`
3. `storage`
4. `tabs`
5. `search`

Optional permissions:

1. `bookmarks`
2. `history`
3. Host permission for DuckDuckGo suggestions when enabled

## Privacy Model

1. Default state is local-first.
2. Bookmarks and history are opt-in.
3. Remote suggestions are opt-in.
4. When remote suggestions are enabled, typed queries may be sent to DuckDuckGo.
5. Settings and preferences are stored locally and can be exported/imported as JSON.

## Browser Support Target

Primary target:

1. Chrome
2. Arc
3. Edge
4. Helium

Expectation:

1. Zenbar should work across Chromium browsers where MV3 APIs and extension commands behave consistently.
