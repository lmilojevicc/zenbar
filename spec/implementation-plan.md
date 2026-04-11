# Zenbar Implementation Plan

Status: Ready to build with Bun

## Phase 1. Extension Scaffold

Goal: create the minimal MV3 shell and routing structure.

Deliverables:

1. `package.json` with Bun scripts
2. `scripts/build.mjs` to generate `dist/`
3. `manifest.json`
4. service worker entrypoint
5. command declarations for all three modes
6. full options tab registration
7. popup-window fallback shell
8. shared asset structure for icons, font, and styles

Key decisions:

1. Use a full options page, not embedded options UI.
2. Bundle `Bricolage Grotesque` locally and use sans-serif fallback.
3. Use Bun for build orchestration while keeping runtime code browser-native.
4. Load the unpacked extension from `dist/`.
5. Keep code organization lean and modular.

## Build Workflow

Goal: keep the extension simple to load while still standardizing development around Bun.

Deliverables:

1. `bun run build` produces a clean `dist/` directory
2. `dist/` contains the extension files needed for unpacked loading
3. build steps stay lightweight and do not require a framework migration

## Phase 2. Command Routing And Fallback Window

Goal: reliably open the correct surface for each mode.

Deliverables:

1. command listener in service worker
2. mode routing for current-tab, new-tab, and tab-search behaviors
3. injection attempt into current page using `activeTab` and `scripting`
4. restricted-page detection and fallback to standalone extension window
5. message contract between service worker and UI surfaces

## Phase 3. Shared Search Core

Goal: centralize query parsing, ranking, and result shaping.

Deliverables:

1. URL detection and normalization
2. fuzzy matcher and scorer
3. result type model
4. weighted source blending
5. dedupe rules across tabs, bookmarks, history, and suggestions
6. per-mode ranking modifiers

Rules:

1. Current Tab Mode prioritizes URL edit and current-tab search behavior.
2. Open In New Tab Mode shares ranking logic but changes submission behavior.
3. Tab Search Mode excludes current tab and boosts current-window tabs.

## Phase 4. Source Adapters

Goal: add all result providers behind a common interface.

Deliverables:

1. open tabs adapter
2. bookmarks adapter
3. history adapter
4. DuckDuckGo suggestion adapter
5. search action adapter for browser-default search execution

Requirements:

1. Bookmarks and history must respect optional permission state.
2. DuckDuckGo suggestions must respect opt-in state.
3. Suggestion requests must be debounced and aborted when input changes.

## Phase 5. Overlay UI

Goal: build the main floating command surface.

Deliverables:

1. overlay mount and unmount behavior
2. centered glass shell
3. compact idle state and expanded active state
4. input control with selection and focus rules
5. keyboard navigation for list results
6. result row system with source indicators
7. visible close affordance in tab-search rows

Visual requirements:

1. dark luxury theme
2. blur and subtle border treatment
3. compact rows
4. sparse empty state

## Phase 6. Mode Behaviors

Goal: wire each mode to correct submission and interaction logic.

Deliverables:

1. Current Tab Mode submit handling
2. Open In New Tab Mode submit handling
3. Tab Search Mode switch handling
4. `Cmd+X` highlighted-tab close in Tab Search Mode
5. existing-tab detection and switch behavior in Open In New Tab Mode

## Phase 7. Settings Page

Goal: ship a minimal but premium options experience.

Deliverables:

1. full-page options UI
2. source toggles
3. source weighting controls
4. suggestion provider controls
5. privacy copy for remote suggestions
6. import/export JSON
7. keyboard shortcuts section

Shortcut section requirements:

1. read current shortcuts with `chrome.commands.getAll()`
2. show missing shortcuts when default registration failed
3. provide `Change Shortcuts` action linking or guiding users to the browser shortcut manager

## Phase 8. Permission Flows

Goal: keep core install light and request optional access only when needed.

Deliverables:

1. bookmarks permission request flow
2. history permission request flow
3. DuckDuckGo suggestion permission flow if host access is needed
4. permission-aware settings states and messaging

## Phase 9. Onboarding And Diagnostics

Goal: make Chromium limitations understandable without clutter.

Deliverables:

1. first-run shortcut explanation
2. explanation of Zenbar shortcut behavior and any browser-specific shortcut assignment caveats
3. shortcut conflict diagnostics when commands are unassigned
4. clear explanation for remote suggestion opt-in

## Phase 10. Compatibility And QA

Goal: verify consistent behavior across target Chromium browsers.

Test matrix:

1. Chrome
2. Arc
3. Edge
4. Helium

Scenarios:

1. normal pages
2. restricted pages and fallback window
3. missing shortcut registrations
4. bookmarks/history denied and granted states
5. DuckDuckGo suggestions off and on
6. tab switching and tab closing flows

## Suggested Build Order

1. Set up Bun scripts and `dist/` build flow
2. Scaffold manifest, commands, and service worker
3. Build overlay shell and fallback window shell
4. Implement shared search core
5. Implement tabs source and Tab Search Mode end-to-end
6. Implement Current Tab Mode end-to-end
7. Implement Open In New Tab Mode end-to-end
8. Add optional bookmarks and history sources
9. Add DuckDuckGo suggestions
10. Build settings page and shortcut diagnostics
11. Run browser compatibility passes and polish visuals

## Out Of Scope For V1

1. Native shortcut takeover
2. Browser-chrome URL bar replacement
3. Direct shortcut rebinding from extension UI
4. Non-DuckDuckGo remote suggestion providers
5. Cloud sync or account-backed settings
