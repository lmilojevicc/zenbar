# Firefox-Style Urlbar Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Zenbar's picker pipeline to a Firefox-style architecture with heuristic providers, normal providers, a muxer, and a distinct default-result selection model.

**Architecture:** Build a shared query context, split candidate generation into heuristic and normal providers, compose results in a muxer, and separate execution from ranking. Update the UI to track the default associated result independently from explicit row selection, and add an opt-in adaptive learner backed by local extension storage.

**Tech Stack:** TypeScript, Bun test, Chrome extension APIs, `chrome.storage.local`

---

## Batches

### Batch 1: Foundation And Contracts

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/settings.ts`
- Modify: `src/shared/utils.ts`
- Create: `src/background/query-context.ts`
- Create: `src/background/submit.ts`
- Create: `src/background/providers/base.ts`
- Create: `src/background/query-engine.ts`
- Test: `test/settings.test.ts`
- Test: `test/background/query-context.test.ts`
- Test: `test/background/submit.test.ts`
- Test: `test/background/query-engine.test.ts`

- [ ] Expand shared result, settings, and query-engine types
- [ ] Add `adaptiveHistoryEnabled: false` to default settings and merge logic
- [ ] Add Firefox-style parsing/classification helpers
- [ ] Create `QueryContext`
- [ ] Extract submit/execution behavior from the service worker
- [ ] Create provider contract and query-engine skeleton
- [ ] Verify Batch 1 with targeted tests and typecheck

### Batch 2: Heuristic Providers And Adaptive Learner

**Files:**
- Create: `src/background/providers/heuristic/autofill.ts`
- Create: `src/background/providers/heuristic/history-url.ts`
- Create: `src/background/providers/heuristic/fallback.ts`
- Create: `src/background/adaptive-history-store.ts`
- Modify: `src/background/submit.ts`
- Test: `test/background/providers/heuristics.test.ts`
- Test: `test/background/adaptive-history-store.test.ts`

- [ ] Implement autofill heuristic
- [ ] Implement history URL heuristic
- [ ] Implement fallback heuristic
- [ ] Add opt-in adaptive learner store and clear operation
- [ ] Gate learner reads and writes on `adaptiveHistoryEnabled`
- [ ] Verify heuristic order with tests

### Batch 3: Normal Providers And Muxer

**Files:**
- Create: `src/background/providers/results/tabs.ts`
- Create: `src/background/providers/results/bookmarks.ts`
- Create: `src/background/providers/results/history.ts`
- Create: `src/background/providers/results/suggestions.ts`
- Create: `src/background/providers/results/input-history.ts`
- Create: `src/background/muxer.ts`
- Test: `test/background/providers/results.test.ts`
- Test: `test/background/muxer.test.ts`
- Test: `test/background/query-engine.test.ts`

- [ ] Port current builders into normal providers
- [ ] Build the muxer and replace flat score sorting
- [ ] Add group ordering and dedupe rules
- [ ] Keep `tab-search` on its separate explicit provider path
- [ ] Verify Batch 3 with targeted tests and typecheck

### Batch 4: UI Selection Model And Service Worker Integration

**Files:**
- Create: `src/ui/selection-model.ts`
- Modify: `src/ui/command-app.ts`
- Modify: `src/background/service-worker.ts`
- Modify: `src/shared/types.ts`
- Test: `test/ui/selection-model.test.ts`
- Test: `test/command-app.test.ts`
- Test: `test/background/query-engine.test.ts`

- [ ] Separate default-result state from explicit row selection
- [ ] Make Enter submit the default result unless explicit selection exists
- [ ] Make arrows enter explicit row selection mode
- [ ] Return `results`, `defaultResult`, and `allowEmptySelection` from the query API
- [ ] Add clear-learned-history background action
- [ ] Verify Batch 4 with targeted tests and typecheck

### Batch 5: Options UI For Adaptive Learning

**Files:**
- Modify: `src/ui/options.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/settings.ts`
- Test: `test/settings.test.ts`

- [ ] Add adaptive learning toggle in Options
- [ ] Add explanatory copy for local storage behavior
- [ ] Add `Clear learned history` control
- [ ] Preserve the setting in import/export
- [ ] Verify Batch 5 with targeted tests and typecheck

### Batch 6: Final Verification

- [ ] Verify `cats` defaults to search heuristic unless stronger autofill/adaptive match exists
- [ ] Verify `example.com` prefers autofill, then history URL heuristic, then fallback visit
- [ ] Verify `example.com/foo` follows the same order
- [ ] Verify URL heuristics can show a lower search alternative
- [ ] Verify current/new-tab use default-result semantics
- [ ] Verify tab-search remains explicit-only
- [ ] Verify adaptive learning is off by default and resettable
- [ ] Run `bun run typecheck`
- [ ] Run `bun test`
- [ ] Run `bun run build`
