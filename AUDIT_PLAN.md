# RxRotation Lite - Code Audit & Correction Plan

**Date:** 2026-03-30
**Audited by:** Claude Code (10 parallel audit agents)
**Scope:** All source files in `/src/`

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 5     |
| HIGH     | 10    |
| MEDIUM   | 10    |
| LOW      | 3     |
| **Total** | **28** |

---

## CRITICAL ERRORS

### C1. Uncaught errors in nested setTimeout phases during schedule generation
- **File:** `src/App.jsx` : lines 107-151
- **Description:** The `doGenerate()` function wraps Phase 1 & 2 in a try/catch (lines 101-152), but Phases 3 and 4 execute inside nested `setTimeout` callbacks (lines 107, 113). JavaScript try/catch does NOT catch errors thrown inside asynchronous callbacks. Any error in Phase 3 (all-honored generation) or Phase 4 (preference impact analysis) will be an **unhandled exception** that silently fails. The `setGenerating(false)` in the catch block will never execute, leaving the UI permanently stuck in the "Generating..." state.
- **Confirmed:** Yes. This is a fundamental JavaScript behavior - try/catch cannot span async boundaries.

### C2. Modulo-by-zero crash in overlap budget distribution
- **File:** `src/logic/scheduler.js` : line 174
- **Description:** `var overlapOffset = w % candidates2.length;` — the `candidates2` array is filtered from `openDays` where `assignMap[d].length === 1`. When all open days have 0 or 2+ pharmacists assigned, `candidates2` is empty, making `candidates2.length === 0`. The modulo operation `w % 0` produces `NaN`, which then corrupts `Math.min()` and `Array.splice()` calls on lines 177-178.
- **Confirmed:** Yes. Reproducible when overlap budget > 0 and all days already have multiple pharmacists assigned.

### C3. Side effect during React render — `setTheme(dark)` called outside useEffect
- **File:** `src/App.jsx` : line 19
- **Description:** `setTheme(dark)` is called directly in the component function body during every render. This mutates module-level exported variables (`Co`, `shadow` in `theme.js`). This violates React's rule that render functions must be pure. In React StrictMode (which this app uses — see `main.jsx` line 8), the render function is called twice, causing double mutation. This can cause visual inconsistencies and breaks the React concurrent rendering contract.
- **Confirmed:** Yes. `setTheme()` reassigns `Co` and `shadow` module exports, which is a side effect during render.

### C4. Math.max/Math.min on empty arrays in scoreTemplate
- **File:** `src/logic/scheduler.js` : line 556
- **Description:** `var heaviest = Math.max.apply(null, wkHrs)` — when `wkHrs` is empty (0-week rotation edge case) or all zeros, `Math.max.apply(null, [])` returns `-Infinity`. Then `wkHrs.filter(function (h) { return h > 0; })` returns an empty array, and `Math.min.apply(null, [])` returns `Infinity`. The resulting `spread` calculation produces nonsensical values. Same pattern exists at lines 488, 495, 502 for fairness scoring arrays.
- **Confirmed:** Yes. `Math.max.apply(null, [])` returns `-Infinity` in all JS engines.

### C5. Unsafe `store.hours[d].open` access without null check in clopening detection
- **File:** `src/logic/scheduler.js` : line 538
- **Description:** `thisStart <= t2m(store.hours[d].open) + 60` accesses `.open` directly on `store.hours[d]` without verifying that `store.hours[d]` exists. If a day key is missing from the hours object, this throws `TypeError: Cannot read property 'open' of undefined`. The variable `dh2` (which references the previous day's hours) is checked, but `store.hours[d]` for the current day is not.
- **Confirmed:** Yes. Crash path: a day exists in the DAYS array but is missing from `store.hours`.

---

## HIGH ERRORS

### H1. Race condition in doGenerate with nested setTimeouts
- **File:** `src/App.jsx` : lines 99-153
- **Description:** If `doGenerate` is somehow invoked again while previous setTimeout callbacks from Phases 2/3/4 are still pending in the event queue, the old callbacks will still fire and call `setResults()`, `setWhatIf()`, etc., potentially overwriting the new generation's results. The `generating` flag check on line 95 only guards the initial call, not the pending async callbacks.
- **Confirmed:** Yes. The guard `if (generating) return` prevents re-entry at the top, but doesn't cancel pending timeouts from a prior invocation.

### H2. Validation uses wrong pharmacist list for "all honored" schedules
- **File:** `src/App.jsx` : line 111
- **Description:** `validateCandidate(sc2, pharms, store)` validates the "all honored" schedule against the **original** `pharms` array, but the schedule `sc2` was generated using `allHonoredPharms` (which has promoted preferences). The validation should use the same pharmacist configuration that generated the schedule, or the mismatch may incorrectly reject valid schedules.
- **Confirmed:** Yes. Logic mismatch between generation and validation inputs.

### H3. Duplicate React sibling keys in pharmacist grid
- **File:** `src/App.jsx` : lines 718-726
- **Description:** The pharmacist schedule grid uses `[<div key={p.id + "-n"}>...</div>].concat(DAYS.map(...))` where the DAYS map produces elements with `key={p.id + d}`. Both the closed-day branch (line 720) and the open-day branch (line 725) use the same key pattern `p.id + d`. When the array is flattened, React sees duplicate keys for the same pharmacist across different branches, causing incorrect DOM reconciliation.
- **Confirmed:** Yes. React requires unique keys among siblings in the same array.

### H4. Null dereference on `hero.schedule.weeks` without full null chain
- **File:** `src/App.jsx` : line 802
- **Description:** `hero.schedule ? hero.schedule.weeks.length : 2` — checks if `hero.schedule` is truthy, then immediately accesses `.weeks.length`. If `hero.schedule` exists but `weeks` is null/undefined, this throws TypeError. The guard is incomplete.
- **Confirmed:** Yes. Partial null check on a nested property chain.

### H5. Null dereference on `curScore.components` and `allHonored.score.components`
- **File:** `src/App.jsx` : lines 878, 911, 915
- **Description:** Multiple locations access deeply nested properties like `curScore.components.coverage` and `allHonored.score.components.coverage` after checking only the top-level object. If `.components` is missing, TypeError is thrown during render.
- **Confirmed:** Yes. Only top-level null check exists, not nested property checks.

### H6. Potential null dereference on `store.hours[d]` in operating hours rendering
- **File:** `src/App.jsx` : line 465
- **Description:** `var dh = srcHours[d]; var dayHrs = dh.isOpen ? ...` accesses `dh.isOpen` without checking if `dh` is defined. If `srcHours` (which could be `store.hours` or `store._originalHours`) is missing a day key, this crashes.
- **Confirmed:** Yes. No null guard before property access.

### H7. NaN propagation from `t2m()` corrupts downstream calculations
- **File:** `src/utils.js` : line 1
- **Description:** `t2m()` returns `NaN` for malformed time strings (no colon, non-numeric parts). This NaN silently propagates through `hSpan()`, `tL()`, `opHrs()`, and all scheduler math. No function in the chain guards against NaN input, causing invisible corruption of schedule scores and shift times.
- **Confirmed:** Yes. `t2m("abc")` → NaN, which infects every downstream calculation.

### H8. `scriptVolume()` crashes when `store.hours` is undefined
- **File:** `src/utils.js` : line 8
- **Description:** The fallback ranking computation `DAYS.filter(function (d) { var dh = store.hours[d]; ... })` accesses `store.hours[d]` without checking if `store.hours` exists. If `store.hours` is undefined, this throws TypeError.
- **Confirmed:** Yes. No guard on the `store.hours` object itself.

### H9. `curSched` null dereference in grid rendering
- **File:** `src/App.jsx` : line 738
- **Description:** `pharms.filter(function (p) { return curSched[wi + "-" + p.id + "-" + d]; })` — if `curSched` is null (which it is initially, set on line 28), accessing it with bracket notation throws TypeError. The grid rendering code doesn't guard against this.
- **Confirmed:** Yes. `curSched` starts as `null` and is only initialized when entering improve mode step 4.

### H10. `m2t()` produces malformed time strings for non-integer minutes
- **File:** `src/utils.js` : line 2
- **Description:** When `m` is a non-integer (e.g., 90.7 from imprecise arithmetic), `m % 60` produces 30.7, and the resulting time string becomes "1:30.7" instead of "1:30". The function lacks `Math.floor()` on the minutes component, producing invalid time strings that break `t2m()` round-trips.
- **Confirmed:** Yes. `m2t(90.7)` → "01:30.7" which is not a valid HH:MM string.

---

## MEDIUM ERRORS

### M1. Weekend preference threshold `weekendDays > R` is too lenient
- **File:** `src/logic/scheduler.js` : line 559
- **Description:** The condition `weekendDays > R` flags a violation for "every_other_off" weekend preference. With a 2-week rotation, this only triggers when someone works >2 weekend days — but "every other weekend off" should mean ~2 weekend days max across 2 weeks (1 per week). The threshold should be approximately `R` (works every weekend) to catch the right violations. Currently, working 2 weekend days in a 2-week rotation is never flagged even though it means working every single weekend.
- **Confirmed:** Yes. The math doesn't align with the semantic meaning of "every other weekend off."

### M2. `weekH > 0` guard in minHours check prevents flagging 0-hour violations
- **File:** `src/logic/scheduler.js` : line 555
- **Description:** `if (p.minHours && weekH < p.minHours && weekH > 0)` — the `weekH > 0` condition means that if a pharmacist is scheduled 0 hours in a week (completely absent), the minimum hours violation is NOT reported. This is arguably the most severe violation case and is silently ignored.
- **Confirmed:** Yes. A pharmacist with `minHours: 32` scheduled 0 hours in a week produces no tradeoff.

### M3. Negative `snap30()` result creates invalid shift start times in `buildSchedFromGrid`
- **File:** `src/App.jsx` : line 90
- **Description:** When role === "C", the calculation `snap30(owC - 60)` can produce negative values when `owC` is small (e.g., overridden to early morning). `m2t()` wraps negatives via modulo (e.g., -30 → "23:30"), creating an overnight shift start that doesn't match the intended day shift.
- **Confirmed:** Yes. `snap30(-30)` = -30, `m2t(-30)` = "23:30".

### M4. `maxShiftLength || 13` treats 0 as falsy
- **File:** `src/App.jsx` : lines 89-90; `src/logic/scheduler.js` : lines 187, 207, 231, 238, 251
- **Description:** The pattern `p.maxShiftLength || 13` uses falsy-coalescing. If `maxShiftLength` is explicitly set to 0, it falls through to 13 hours. While the UI likely prevents setting 0, the defensive pattern is incorrect.
- **Confirmed:** Yes. `0 || 13` evaluates to `13` in JavaScript.

### M5. Overlap toggle UI doesn't account for automatic length-based overlap
- **File:** `src/App.jsx` : line 741
- **Description:** `isOverlap` is `curOverrides[ovlKey] || assignedP.length >= 3`, but the toggle only manages the explicit override key. Toggling off when `assignedP.length >= 3` has no effect because the length condition still evaluates true.
- **Confirmed:** Yes. UI toggle and computed state are conflated.

### M6. `snap30()` with negative values in scheduler shift calculations
- **File:** `src/logic/scheduler.js` : line 238
- **Description:** `var cStart = Math.max(owC - 60, cEnd - closer.maxShiftLength * 60)` can produce negative values when `owC` is small. These are then passed to `snap30()` which doesn't clamp to 0, producing negative minute values that wrap incorrectly through `m2t()`.
- **Confirmed:** Yes. Same root cause as M3.

### M7. `sustainScore = 100` when all pharmacists have 0 hours
- **File:** `src/logic/scheduler.js` : line 478
- **Description:** When `mx > 0` is false (all burden scores are 0), `sustainScore` remains 100. A schedule where nobody works shouldn't score as perfectly sustainable.
- **Confirmed:** Yes. Edge case produces misleading score.

### M8. Non-unique React keys using array indices
- **File:** `src/App.jsx` : lines 784, 851
- **Description:** `failReasons.map(function (r, i) { return <div key={i}...` and assignment grid uses `key={i}`. If lists reorder or items are added/removed, React mismatches DOM nodes with data, causing rendering bugs.
- **Confirmed:** Yes. React docs explicitly warn against index keys for dynamic lists.

### M9. Missing null check on `store.peak` spread in peak hours editor
- **File:** `src/App.jsx` : lines 550-551
- **Description:** `var p = { ...s.peak }` — if `s.peak` is undefined (store state corruption or missing initialization), this produces an empty object rather than crashing, but subsequent operations on `p[grp.key]` may produce unexpected results. More importantly, `Array.isArray(p[grp.key]) ? p[grp.key].slice() : [p[grp.key] || {...}]` can create arrays containing non-array truthy values.
- **Confirmed:** Partially. Spread of undefined produces `{}` safely in modern JS, but downstream logic is fragile.

### M10. Stale closure risk in Escape key handler
- **File:** `src/App.jsx` : line 50
- **Description:** The keydown handler captures `showHelp` in a closure and the effect re-runs on `[showHelp]` changes. While functionally correct, rapid toggling of `showHelp` causes the event listener to be removed and re-added on every state change, which is inefficient and can miss key events during the transition.
- **Confirmed:** Partially. The dependency array is correct, but the pattern causes unnecessary listener churn.

---

## LOW ERRORS

### L1. `fmtH()` fragile with string-typed numbers
- **File:** `src/utils.js` : line 4
- **Description:** `fmtH("5")` works due to JS coercion but relies on implicit type conversion for the `% 1 === 0` check and `.toFixed()` call. Not a crash, but semantically fragile.
- **Confirmed:** Low risk. Works via coercion.

### L2. Week tabs use positional numeric keys
- **File:** `src/App.jsx` : line 844
- **Description:** `key={wi}` for week tabs. If tab count `R` changes dynamically, React may reuse DOM nodes incorrectly. Low risk since `R` is stable within a session.
- **Confirmed:** Low risk in practice.

### L3. `firstName()` returns "?" for empty-string names
- **File:** `src/utils.js` : line 9
- **Description:** When `p.name` is `""`, the function returns `"?"`. This is intentional behavior but can be confusing in the UI when a pharmacist is saved without a name.
- **Confirmed:** By design, but worth noting.

---

## Correction Plan (Prioritized)

### Phase 1: Critical Crash Fixes
| ID | Action | Files |
|----|--------|-------|
| C1 | Wrap each setTimeout callback in its own try/catch, or restructure doGenerate to use a single async flow with proper error boundaries | `src/App.jsx` |
| C2 | Add `if (candidates2.length === 0) return;` guard before the modulo operation | `src/logic/scheduler.js` |
| C3 | Move `setTheme(dark)` into `useEffect(() => { setTheme(dark); }, [dark])` | `src/App.jsx` |
| C4 | Add empty-array guards before all `Math.max.apply` / `Math.min.apply` calls, or use default values | `src/logic/scheduler.js` |
| C5 | Add null check: `if (!store.hours[d]) continue;` before accessing `.open` | `src/logic/scheduler.js` |

### Phase 2: High-Severity Logic Fixes
| ID | Action | Files |
|----|--------|-------|
| H1 | Store setTimeout IDs and clear them on re-entry or component unmount | `src/App.jsx` |
| H2 | Pass `allHonoredPharms` to `validateCandidate` instead of `pharms` | `src/App.jsx` |
| H3 | Add unique key prefixes to differentiate closed-day vs open-day branches | `src/App.jsx` |
| H4 | Change to `hero.schedule && hero.schedule.weeks ? hero.schedule.weeks.length : 2` | `src/App.jsx` |
| H5 | Add `?.` or explicit null checks for `.components` before accessing nested properties | `src/App.jsx` |
| H6 | Add `if (!dh) continue;` or `if (!dh) return 0;` guard | `src/App.jsx` |
| H7 | Add NaN guard in `t2m()`: return 0 if result is NaN | `src/utils.js` |
| H8 | Add `if (!store.hours) return 5;` guard at top of `scriptVolume()` | `src/utils.js` |
| H9 | Add `if (!curSched) return null;` guard before grid filtering | `src/App.jsx` |
| H10 | Apply `Math.round()` to the minutes component in `m2t()` | `src/utils.js` |

### Phase 3: Medium-Severity Logic Fixes
| ID | Action | Files |
|----|--------|-------|
| M1 | Adjust weekend threshold to flag when `weekendDays >= R` (works every weekend) | `src/logic/scheduler.js` |
| M2 | Remove the `weekH > 0` guard so 0-hour weeks are flagged | `src/logic/scheduler.js` |
| M3 | Clamp `snap30()` results to `Math.max(0, snap30(...))` for shift start calculations | `src/App.jsx` |
| M4 | Change `p.maxShiftLength || 13` to `p.maxShiftLength ?? 13` or explicit check | Multiple files |
| M5 | Disable overlap toggle when `assignedP.length >= 3` (always forced overlap) | `src/App.jsx` |
| M6 | Add lower bound clamp on closer start calculation | `src/logic/scheduler.js` |
| M7 | Return `sustainScore = 0` when all burden scores are 0 | `src/logic/scheduler.js` |
| M8 | Replace index keys with stable unique keys derived from data | `src/App.jsx` |
| M9 | Add explicit null check for `s.peak` before spreading | `src/App.jsx` |
| M10 | Consider using a ref-based handler to avoid listener churn | `src/App.jsx` |

### Phase 4: Low-Severity Cleanup
| ID | Action | Files |
|----|--------|-------|
| L1 | Add explicit `Number()` coercion in `fmtH()` | `src/utils.js` |
| L2 | Use string-based keys like `"week-" + wi` | `src/App.jsx` |
| L3 | No action needed (by design) | — |

---

## Files Affected

| File | Error Count | Criticals |
|------|-------------|-----------|
| `src/App.jsx` | 17 | 2 (C1, C3) |
| `src/logic/scheduler.js` | 8 | 2 (C2, C4, C5) |
| `src/utils.js` | 5 | 0 |
| `src/theme.js` | 1 (C3 related) | 0 |
| `src/components/ui.jsx` | 0 | 0 |
| `src/components/ErrorBoundary.jsx` | 0 | 0 |

---

*This audit identifies errors only. No changes have been made to the codebase.*
