# Bug Fix A — Parser Whitespace + AC Verdict

Date: 2026-06-07

## Overview

Two correctness fixes: (1) sample test case text arrives with a leading newline from CF's HTML `<pre>` tags; (2) the run status badge says "AC" on any clean exit instead of comparing output to expected.

---

## Fix 1: Parser Whitespace

**File:** `src-tauri/src/workspace.rs` — `extract_sample_text()`

**Root cause:** CF's `<pre>` elements contain `\n3\n1 2 3\n` — the leading and trailing newlines are part of the HTML formatting, not the test data.

**Fix:** Call `.trim()` on the string returned by both code paths inside `extract_sample_text`, then return the trimmed string. No other changes.

```rust
fn extract_sample_text(el: scraper::ElementRef) -> String {
    let pre_sel = Selector::parse("pre").unwrap();
    if let Some(pre) = el.select(&pre_sel).next() {
        return pre.text().collect::<Vec<_>>().join("").trim().to_string();
    }
    let line_sel = Selector::parse(".test-example-line").unwrap();
    el.select(&line_sel)
        .map(|line| line.text().collect::<String>())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}
```

---

## Fix 2: AC Verdict

**File:** `src/components/RunToolbar.tsx`

**Root cause:** `getStatus()` returns `'success'` (shown as "AC") whenever `exit_code === 0 && !timed_out && compile_errors.length === 0`. This is wrong — AC requires the output to match expected.

**Fix:** Add two new statuses and update `getStatus()`:

| Status | Label | Badge | Condition |
|--------|-------|-------|-----------|
| `ok` | OK | neutral | Clean exit, no expected set |
| `success` (AC) | AC | green | Clean exit, tokens match expected |
| `wa` | WA | red | Clean exit, tokens do NOT match expected |

**Token comparison** (matches how online judges work):
```typescript
function tokensMatch(actual: string, expected: string): boolean {
  return actual.trim().split(/\s+/).join(' ') === expected.trim().split(/\s+/).join(' ');
}
```

`RunToolbar` reads `activeTestCaseId` and `testCases` from the store to get the active case's `expected` field. No Rust changes required.

**Updated STATUS_MAP:**
```typescript
const STATUS_MAP = {
  ready:         { label: 'Ready',         cls: 'badge-neutral' },
  compiling:     { label: 'Compiling…',    cls: 'badge-warning' },
  running:       { label: 'Running…',      cls: 'badge-warning' },
  ok:            { label: 'OK',            cls: 'badge-neutral' },
  success:       { label: 'AC',            cls: 'badge-ok'      },
  wa:            { label: 'WA',            cls: 'badge-error'   },
  compile_error: { label: 'Compile Error', cls: 'badge-error'   },
  runtime_error: { label: 'Runtime Error', cls: 'badge-error'   },
  tle:           { label: 'TLE',           cls: 'badge-error'   },
} as const;
```

**Updated getStatus():**
```typescript
function getStatus(
  isCompiling: boolean,
  isRunning: boolean,
  result: RunResult | null,
  expected: string | null | undefined,
): RunStatus {
  if (isCompiling) return 'compiling';
  if (isRunning)   return 'running';
  if (!result)     return 'ready';
  if (result.compile_errors.length > 0) return 'compile_error';
  if (result.timed_out) return 'tle';
  if (result.exit_code !== 0) return 'runtime_error';
  if (!expected) return 'ok';
  return tokensMatch(result.stdout, expected) ? 'success' : 'wa';
}
```

---

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/src/workspace.rs` | `.trim()` in `extract_sample_text` |
| `src/components/RunToolbar.tsx` | New statuses, token comparison, read `expected` from store |

## Non-Goals

- No server-side verdict comparison
- No special-judge / checker support
- No diff highlighting changes (OutputPanel diff tab unchanged)
