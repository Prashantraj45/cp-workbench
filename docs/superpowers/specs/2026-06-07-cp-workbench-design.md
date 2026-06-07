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
