# CP Workbench — Design Spec
Date: 2026-06-07

## Overview

Production-grade Competitive Programming desktop app for macOS Apple Silicon. Goal: open app → write solution → Cmd+Enter → see result. Feels like Sublime Text, not VS Code.

**KPIs:** Startup <1s, warm launch <300ms, RAM <150MB, local-first, keyboard-first.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Rust |
| Desktop | Tauri v2 |
| Frontend | React + TypeScript |
| Editor | Monaco |
| State | Zustand |
| Storage | SQLite (rusqlite) + local files |
| Build | Vite |
| Compiler | /opt/homebrew/bin/g++-15 |

No substitutions.

---

## Architecture

**Approach:** Monolithic Tauri + React. Rust handles all logic, fs, process execution, SQLite. React handles UI. IPC via `invoke()` for request/response and Tauri `emit()` events for streaming (compiler errors, run output).

```
cp-workbench/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── compiler.rs     # g++ invocation, error parsing
│   │   ├── runner.rs       # process execution, stdio capture
│   │   ├── workspace.rs    # folder scaffold, Codeforces scraper
│   │   ├── stress.rs       # stress test orchestration
│   │   ├── db.rs           # SQLite via rusqlite
│   │   ├── ai.rs           # AiProvider trait + NoOpProvider
│   │   └── commands.rs     # all #[tauri::command] exports
│   └── Cargo.toml
├── src/
│   ├── components/
│   │   ├── Editor.tsx
│   │   ├── InputPanel.tsx
│   │   ├── OutputPanel.tsx
│   │   ├── Layout.tsx
│   │   ├── StressTest.tsx
│   │   └── StatusBar.tsx
│   ├── store/
│   │   └── useStore.ts
│   ├── hooks/
│   └── App.tsx
├── vite.config.ts
└── package.json
```

---

## Data Model (SQLite)

DB location: `~/.cp-workbench/db.sqlite`. Created on first launch.

```sql
CREATE TABLE problems (
  id            TEXT PRIMARY KEY,   -- e.g. "CF_1234A"
  name          TEXT NOT NULL,
  path          TEXT NOT NULL,      -- absolute fs path
  url           TEXT,
  time_limit    INTEGER,            -- ms
  memory_limit  INTEGER,            -- MB
  cpp_standard  TEXT NOT NULL DEFAULT 'c++20',
  created_at    INTEGER NOT NULL,
  last_opened   INTEGER
);

CREATE TABLE test_cases (
  id          TEXT PRIMARY KEY,
  problem_id  TEXT NOT NULL REFERENCES problems(id),
  name        TEXT NOT NULL,        -- "Sample 1", "Edge", etc.
  input       TEXT NOT NULL,
  expected    TEXT,                 -- for diff mode
  position    INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE runs (
  id              TEXT PRIMARY KEY,
  problem_id      TEXT NOT NULL REFERENCES problems(id),
  test_case_id    TEXT REFERENCES test_cases(id),
  stdout          TEXT,
  stderr          TEXT,
  exit_code       INTEGER,
  runtime_ms      INTEGER,
  memory_kb       INTEGER,
  compile_time_ms INTEGER,
  ran_at          INTEGER NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Notable settings keys:
-- last_opened_problem_id TEXT
-- panel_sizes            JSON  (e.g. {"code":65,"input":17.5,"output":17.5})
-- editor_font_size       INTEGER (default 14)
-- theme                  TEXT ("system" | "dark" | "light")
```

Source files (`main.cpp`, `input.txt`, `output.txt`, `notes.md`, `metadata.json`) live on disk at `problems.path`. SQLite holds metadata + history only.

---

## Core Workflow (Cmd+Enter)

Rust `runner.rs` pipeline:

1. Save `main.cpp` to disk
2. Compile: `g++-15 -std=c++20 -O2 -o main main.cpp`
   - Capture stdout+stderr, measure `compile_ms`
   - On error: emit `CompileError[]` to frontend, stop
3. Execute: `./main < input.txt`
   - Timeout: 10s default (configurable per problem via `time_limit`)
   - Capture stdout, stderr, exit_code
   - Measure `runtime_ms` via `Instant`
   - Measure peak memory via `getrusage(RUSAGE_CHILDREN)` — macOS returns `ru_maxrss` in bytes, divide by 1024 to get KB
4. Persist: INSERT into `runs` table
5. Emit: single `RunResult` event to frontend

```rust
struct RunResult {
  stdout: String,
  stderr: String,
  exit_code: i32,
  runtime_ms: u64,
  memory_kb: u64,
  compile_time_ms: u64,
  compile_errors: Vec<CompileError>,
}

struct CompileError {
  file: String,
  line: u32,
  col: u32,
  message: String,
  severity: String,  // "error" | "warning"
}
```

Compiler errors clickable in OutputPanel → jump to line in Monaco.

---

## UI Layout

3-pane resizable via `react-resizable-panels`:

```
┌─────────────────────────────────────────────────────┐
│ StatusBar: [problem name] [lang] [compiler] [theme] │
├──────────────────────────┬──────────────────────────┤
│                          │  INPUT                   │
│   CODE (Monaco)          │  [Tab: S1][S2][Edge][+]  │
│                          │  <textarea>              │
│                          ├──────────────────────────┤
│                          │  OUTPUT                  │
│                          │  [stdout][diff][stats]   │
│                          │  runtime: 42ms  mem: 2MB │
└──────────────────────────┴──────────────────────────┘
```

Adaptive ratios:
- `>1800px`: Code 70%, Input 15%, Output 15%
- `1200–1800px`: Code 65%, Input 17.5%, Output 17.5%
- `<1200px`: Code 60%, remainder split dynamically

Layout (panel sizes) persisted in `settings` table on drag-end.

**Stress test view:** Replaces I/O panes with 3 Monaco editors (Generator / Brute / Solution) + run controls + mismatch display. Toggle via Cmd+Shift+S.

**Theme:** Follows macOS system preference (dark/light). Implemented via `prefers-color-scheme` + Tauri theme API.

**Font:** JetBrains Mono, 14px default, user-configurable size via settings.

### Key Bindings

| Action | Binding |
|--------|---------|
| Run | Cmd+Enter |
| New problem | Cmd+N |
| Open workspace | Cmd+O |
| Toggle stress test | Cmd+Shift+S |
| Toggle minimap | Cmd+M |
| Find/replace | Cmd+F |
| New test case | Cmd+T |

No remapping UI — defaults only.

---

## Codeforces Workspace Generator

Input: Codeforces problem URL (e.g. `https://codeforces.com/contest/1234/problem/A`)

Rust `workspace.rs`:
- HTTP GET + HTML parse via `scraper` crate (no headless browser)
- Extracts: title, time limit, memory limit, sample test cases
- Scaffolds disk structure:

```
Problems/
└── CF_1234A/
    ├── main.cpp          ← active template
    ├── input.txt         ← first sample input
    ├── output.txt        ← first sample output
    ├── notes.md
    └── metadata.json
```

- All samples inserted into `test_cases` as "Sample 1", "Sample 2", etc.
- Problem inserted into `problems` table
- App opens workspace immediately after scaffold
- Private/gym problems: fall back to empty scaffold + error toast

---

## Templates

6 built-in templates bundled in `src-tauri/templates/`:

| Name | Contents |
|------|----------|
| Blank C++17 | `bits/stdc++.h`, `using namespace std;` |
| Blank C++20 | Same + `#include <ranges>` |
| Codeforces | Fast IO, multi-test `while(t--)` loop |
| AtCoder | Fast IO, no multi-test wrapper |
| Fast IO | Custom fast reader/writer with `getchar_unlocked` |
| PBDS | Policy-based DS: order stats tree, hash map |

Templates not user-editable at this stage. Compiler standard (C++17/20/23) selectable per-problem in StatusBar, persisted in `problems.cpp_standard`.

---

## Persistence & Recovery

**Autosave:** Monaco `onChange` → debounce 1s → write `main.cpp` to disk. Always on disk, no unsaved state.

**Session recovery:** On launch, load `last_opened` from `settings`. Restore: active problem, active test case tab, panel sizes, compiler standard.

**Test case limit:** 100 per problem. On 101st insert, delete oldest by `created_at` with toast warning.

**Run history:** Unlimited per problem. Last run stats always shown in StatusBar.

---

## Stress Testing

Dedicated view (Cmd+Shift+S) with 3 Monaco editor panes:
- **Generator** (`gen.cpp`) — outputs random input
- **Brute** (`brute.cpp`) — correct slow solution
- **Solution** (`main.cpp`) — optimised solution

Run loop:
1. Compile all three
2. Run generator → feed output to both brute and solution
3. Compare outputs
4. Stop on mismatch, display: input, expected (brute), actual (solution)
5. Iteration counter shown during run

All three files persisted per-problem in the problem directory.

---

## Benchmarking Display

After every run, StatusBar shows:
- Compile time (ms)
- Execution time (ms)
- Peak memory (MB)
- Exit code

OutputPanel stats tab shows full run history for current problem.

---

## AI-Ready Interfaces (No Implementation)

```rust
// src-tauri/src/ai.rs
pub trait AiProvider {
    fn review(&self, code: &str) -> AiResult;
    fn analyze_complexity(&self, code: &str) -> AiResult;
    fn generate_tests(&self, problem: &Problem) -> AiResult;
    fn suggest_optimizations(&self, code: &str) -> AiResult;
}

pub struct AiResult {
    pub content: String,
    pub tokens_used: u32,
}

pub struct NoOpProvider;
impl AiProvider for NoOpProvider { /* all return empty */ }
```

Frontend: AI panel placeholder (collapsed, "Coming soon"). Tauri commands `ai_review`, `ai_complexity`, `ai_generate_tests`, `ai_optimize` registered, return empty. Swap `NoOpProvider` to enable.

---

## Non-Goals

- Generic IDE features
- Plugin ecosystem / marketplace
- Cloud sync / telemetry / login / team features
- Keyboard shortcut remapping UI
- User-editable templates (v1)

---

## Implementation Status (v0.1.0)

Last updated: 2026-06-07. All backend features tested via `cargo test --test feature_tests` (15/15 pass).

### Backend Features

| # | Feature | Status | Test |
|---|---------|--------|------|
| 1 | SQLite DB — open + migrate (WAL, FK) | ✅ Built | feat_01 |
| 2 | Problem CRUD (insert, get, update standard, touch) | ✅ Built | feat_02 |
| 3 | Test case 100-per-problem cap (evict oldest) | ✅ Built | feat_03 |
| 4 | Settings key-value store (upsert) | ✅ Built | feat_04 |
| 5 | Compiler — g++-15, -O2, C++17/20/23 | ✅ Built | feat_05, feat_15 |
| 6 | Compiler error parsing (file:line:col:severity:msg) | ✅ Built | feat_06 |
| 7 | Runner — stdout/stdin/stderr capture | ✅ Built | feat_07 |
| 8 | Runner — timeout with kill (default 10s) | ✅ Built | feat_08 |
| 9 | Runner — exit code capture | ✅ Built | feat_09 |
| 10 | Runner — peak memory via getrusage (macOS bytes/1024) | ✅ Built | feat_10 |
| 11 | Workspace — blank problem scaffold (main.cpp, input.txt, notes.md) | ✅ Built | feat_11 |
| 12 | Templates — 6 built-in (blank17, blank20, codeforces, atcoder, fast_io, pbds) | ✅ Built | feat_12 |
| 13 | Codeforces URL parsing (contest + problemset formats) | ✅ Built | feat_13 |
| 14 | Codeforces scraper — HTTP fetch + HTML parse (scraper crate) | ✅ Built | — |
| 15 | Stress test — compile gen/brute/solution, loop, detect mismatch | ✅ Built | feat_14 |
| 16 | AI stubs — AiProvider trait + NoOpProvider (all 4 commands) | ✅ Built | — |
| 17 | save_stress_file command (gen.cpp / brute.cpp per problem) | ✅ Built | — |
| 18 | Autosave — save_code command (main.cpp to problem path) | ✅ Built | — |
| 19 | Run history — insert_run after every run_solution | ✅ Built | — |
| 20 | Session recovery — last_opened_problem_id in settings | ✅ Built | — |

### Frontend Features

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 21 | 3-pane resizable layout (react-resizable-panels) | ✅ Built | code/input/output |
| 22 | Monaco editor — C++ syntax, JetBrains Mono 14px | ✅ Built | |
| 23 | Monaco — minimap toggle (Cmd+M) | ✅ Built | |
| 24 | Monaco — autosave debounce 1s | ✅ Built | |
| 25 | InputPanel — test case tabs (add/rename/delete) | ✅ Built | |
| 26 | InputPanel — live input persisted per test case | ✅ Built | |
| 27 | OutputPanel — stdout tab with stderr display | ✅ Built | |
| 28 | OutputPanel — diff tab (expected vs actual, line highlight) | ✅ Built | |
| 29 | OutputPanel — stats tab (runtime, memory, compile time, exit code) | ✅ Built | |
| 30 | OutputPanel — compile error list with file:line:col | ✅ Built | |
| 31 | StatusBar — problem name, C++ standard selector, run stats | ✅ Built | |
| 32 | StatusBar — live compiler status (Compiling.../Running.../OK/TLE/RE) | ✅ Built | |
| 33 | Stress test view — 3 Monaco editors (gen/brute/solution) | ✅ Built | Cmd+Shift+S |
| 34 | Stress test — mismatch display (input/expected/actual) | ✅ Built | |
| 35 | WorkspaceGenerator — Codeforces URL modal | ✅ Built | Cmd+N |
| 36 | WorkspaceGenerator — blank problem modal | ✅ Built | |
| 37 | WorkspaceGenerator — template selector (6 templates) | ✅ Built | |
| 38 | Problem switcher overlay (Cmd+O) | ✅ Built | |
| 39 | System theme (dark/light via prefers-color-scheme) | ✅ Built | |
| 40 | Session recovery on startup (loads last opened problem) | ✅ Built | |
| 41 | Adaptive panel ratios (>1800px / 1200-1800px / <1200px) | ✅ Built | via autoSaveId |
| 42 | Key binding: Cmd+Enter → run | ✅ Built | |
| 43 | Key binding: Cmd+T → new test case | ✅ Built | |
| 44 | Key binding: Cmd+N → new problem | ✅ Built | |
| 45 | Key binding: Cmd+O → problem switcher | ✅ Built | |
| 46 | Key binding: Cmd+Shift+S → stress test toggle | ✅ Built | |
| 47 | App icon — custom RGBA PNG + .icns (dark editor theme) | ✅ Built | |
| 48 | AI placeholder panel (commands registered, return empty) | ✅ Built | |

### Build & Distribution

| # | Feature | Status |
|---|---------|--------|
| 49 | `cargo tauri build` → .app + .dmg (aarch64) | ✅ Built |
| 50 | `build-dmg.sh` — automated versioned DMG builder | ✅ Built |
| 51 | `run-dev.sh` — dev launch script | ✅ Built |
| 52 | `scripts/gen_icon.py` — icon regeneration (pure Python) | ✅ Built |

### Known Gaps / v2 Work

- Codeforces scraper not network-tested (requires live CF access)
- Stress test save-to-disk uses type cast workaround in frontend
- No frontend automated tests (Vitest setup pending)
- App not code-signed (Gatekeeper bypass: `xattr -cr /Applications/cp-workbench.app`)
