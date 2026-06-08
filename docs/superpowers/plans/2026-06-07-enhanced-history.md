# Enhanced History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tags, groups, and filters to the problem history view — including auto-scraped tags from CF/LC and new LC/CSES scaffold commands.

**Architecture:** Additive DB migration adds 4 tables; Rust commands expose CRUD for tags/groups; WorkspaceGenerator gains platform detection; DataManagement is rewritten as a full-screen two-column filter+list view; two new components (TagManager, GroupManager) handle tag/group editing.

**Tech Stack:** Rust + rusqlite + scraper + reqwest (blocking), Tauri v2 IPC, React + Zustand, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `src-tauri/src/db.rs` | Additive migration (4 tables) + 13 new CRUD functions |
| `src-tauri/src/models.rs` | Add `Tag`, `Group` structs |
| `src-tauri/src/workspace.rs` | Add CF tag scraping; add `fetch_lc_problem`, `scaffold_lc_problem`, `fetch_cses_problem`, `scaffold_cses_problem` |
| `src-tauri/src/commands.rs` | Add 14 new commands |
| `src-tauri/src/lib.rs` | Register 14 new commands |
| `src/lib/types.ts` | Add `Tag`, `Group`, `ProblemWithMeta` |
| `src/store/useStore.ts` | Add `tags`, `groups`, `setTags`, `setGroups` |
| `src/lib/tauri.ts` | Add 14 new API calls |
| `src/components/WorkspaceGenerator.tsx` | Platform detection → LC/CSES scaffold commands |
| `src/components/DataManagement.tsx` | Full rewrite: full-screen two-column filter+list |
| `src/components/TagManager.tsx` | New: tag CRUD modal |
| `src/components/GroupManager.tsx` | New: per-problem group membership panel |

---

### Task 1: DB Migration — 4 New Tables

**Files:**
- Modify: `src-tauri/src/db.rs:28-71` (migrate function)

- [ ] **Step 1: Add 4 tables to migrate()**

In `src-tauri/src/db.rs`, append to the `migrate` function's `execute_batch` string (after the `settings` table, before the closing `"`):

```rust
fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS problems (
            id            TEXT PRIMARY KEY,
            name          TEXT NOT NULL,
            path          TEXT NOT NULL,
            url           TEXT,
            time_limit    INTEGER,
            memory_limit  INTEGER,
            cpp_standard  TEXT NOT NULL DEFAULT 'c++20',
            created_at    INTEGER NOT NULL,
            last_opened   INTEGER
        );

        CREATE TABLE IF NOT EXISTS test_cases (
            id          TEXT PRIMARY KEY,
            problem_id  TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            input       TEXT NOT NULL,
            expected    TEXT,
            position    INTEGER NOT NULL,
            created_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS runs (
            id              TEXT PRIMARY KEY,
            problem_id      TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
            test_case_id    TEXT REFERENCES test_cases(id) ON DELETE SET NULL,
            stdout          TEXT,
            stderr          TEXT,
            exit_code       INTEGER,
            runtime_ms      INTEGER,
            memory_kb       INTEGER,
            compile_time_ms INTEGER,
            ran_at          INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tags (
            id    TEXT PRIMARY KEY,
            name  TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL DEFAULT '#58a6ff'
        );

        CREATE TABLE IF NOT EXISTS problem_tags (
            problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
            tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            source     TEXT NOT NULL DEFAULT 'manual',
            PRIMARY KEY (problem_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS groups (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS problem_group_memberships (
            problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
            group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
            PRIMARY KEY (problem_id, group_id)
        );",
    )?;
    Ok(())
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd src-tauri && cargo build 2>&1 | tail -5
```
Expected: `Finished` with no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat: additive DB migration — tags, problem_tags, groups, memberships"
```

---

### Task 2: Rust Models — Tag and Group

**Files:**
- Modify: `src-tauri/src/models.rs`

- [ ] **Step 1: Add Tag and Group structs**

Append to end of `src-tauri/src/models.rs`:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd src-tauri && cargo build 2>&1 | tail -5
```
Expected: `Finished` with no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/models.rs
git commit -m "feat: add Tag and Group models"
```

---

### Task 3: DB CRUD — Tags and Groups

**Files:**
- Modify: `src-tauri/src/db.rs`

- [ ] **Step 1: Add import for OptionalExtension**

At the top of `src-tauri/src/db.rs`, change the imports line:

```rust
use crate::error::AppResult;
use crate::models::{Problem, Run, Tag, Group, TestCase};
use rusqlite::{Connection, OptionalExtension, params};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
```

- [ ] **Step 2: Add tag CRUD functions**

Append to `src-tauri/src/db.rs` after the Settings section:

```rust
// ── Tags ───────────────────────────────────────────────────────────────────────

pub fn get_all_tags(conn: &Connection) -> AppResult<Vec<Tag>> {
    let mut stmt = conn.prepare("SELECT id,name,color FROM tags ORDER BY name ASC")?;
    let rows = stmt.query_map([], |row| {
        Ok(Tag { id: row.get(0)?, name: row.get(1)?, color: row.get(2)? })
    })?;
    rows.map(|r| r.map_err(Into::into)).collect()
}

pub fn create_tag(conn: &Connection, name: &str, color: &str) -> AppResult<Tag> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO tags (id, name, color) VALUES (?1, ?2, ?3)",
        params![id, name, color],
    )?;
    Ok(Tag { id, name: name.to_string(), color: color.to_string() })
}

pub fn delete_tag(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM tags WHERE id=?1", params![id])?;
    Ok(())
}

pub fn get_problem_tags(conn: &Connection, problem_id: &str) -> AppResult<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color FROM tags t
         JOIN problem_tags pt ON pt.tag_id = t.id
         WHERE pt.problem_id = ?1
         ORDER BY t.name ASC"
    )?;
    let rows = stmt.query_map(params![problem_id], |row| {
        Ok(Tag { id: row.get(0)?, name: row.get(1)?, color: row.get(2)? })
    })?;
    rows.map(|r| r.map_err(Into::into)).collect()
}

pub fn set_problem_tags(conn: &Connection, problem_id: &str, tag_ids: &[String]) -> AppResult<()> {
    conn.execute("DELETE FROM problem_tags WHERE problem_id=?1", params![problem_id])?;
    for tag_id in tag_ids {
        conn.execute(
            "INSERT OR IGNORE INTO problem_tags (problem_id, tag_id, source) VALUES (?1, ?2, 'manual')",
            params![problem_id, tag_id],
        )?;
    }
    Ok(())
}

/// Upsert tags by name (create if not exists) and attach to problem with source='scraped'.
/// Called from scaffold functions. Failures are silent per spec.
pub fn insert_scraped_tags(conn: &Connection, problem_id: &str, tag_names: &[String]) -> AppResult<()> {
    for name in tag_names {
        if name.is_empty() { continue; }
        let existing: Option<String> = conn.query_row(
            "SELECT id FROM tags WHERE name=?1",
            params![name],
            |r| r.get(0),
        ).optional()?;

        let tag_id = match existing {
            Some(id) => id,
            None => {
                let id = uuid::Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT OR IGNORE INTO tags (id, name, color) VALUES (?1, ?2, '#58a6ff')",
                    params![id, name],
                )?;
                // Re-query in case name already existed (race-safe)
                conn.query_row(
                    "SELECT id FROM tags WHERE name=?1",
                    params![name],
                    |r| r.get(0),
                )?
            }
        };

        conn.execute(
            "INSERT OR IGNORE INTO problem_tags (problem_id, tag_id, source) VALUES (?1, ?2, 'scraped')",
            params![problem_id, tag_id],
        )?;
    }
    Ok(())
}

// ── Groups ─────────────────────────────────────────────────────────────────────

pub fn get_all_groups(conn: &Connection) -> AppResult<Vec<Group>> {
    let mut stmt = conn.prepare("SELECT id,name,created_at FROM groups ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], |row| {
        Ok(Group { id: row.get(0)?, name: row.get(1)?, created_at: row.get(2)? })
    })?;
    rows.map(|r| r.map_err(Into::into)).collect()
}

pub fn create_group(conn: &Connection, name: &str) -> AppResult<Group> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = now_ms();
    conn.execute(
        "INSERT INTO groups (id, name, created_at) VALUES (?1, ?2, ?3)",
        params![id, name, created_at],
    )?;
    Ok(Group { id, name: name.to_string(), created_at })
}

pub fn delete_group(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM groups WHERE id=?1", params![id])?;
    Ok(())
}

pub fn rename_group(conn: &Connection, id: &str, name: &str) -> AppResult<()> {
    conn.execute("UPDATE groups SET name=?1 WHERE id=?2", params![name, id])?;
    Ok(())
}

pub fn get_group_members(conn: &Connection, group_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT problem_id FROM problem_group_memberships WHERE group_id=?1"
    )?;
    let rows = stmt.query_map(params![group_id], |row| row.get(0))?;
    rows.map(|r| r.map_err(Into::into)).collect()
}

pub fn set_group_members(conn: &Connection, group_id: &str, problem_ids: &[String]) -> AppResult<()> {
    conn.execute("DELETE FROM problem_group_memberships WHERE group_id=?1", params![group_id])?;
    for problem_id in problem_ids {
        conn.execute(
            "INSERT OR IGNORE INTO problem_group_memberships (problem_id, group_id) VALUES (?1, ?2)",
            params![problem_id, group_id],
        )?;
    }
    Ok(())
}

pub fn get_run_count(conn: &Connection, problem_id: &str) -> AppResult<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM runs WHERE problem_id=?1",
        params![problem_id],
        |r| r.get(0),
    ).map_err(Into::into)
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd src-tauri && cargo build 2>&1 | tail -10
```
Expected: `Finished` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat: DB CRUD for tags and groups"
```

---

### Task 4: CF Tag Scraping in workspace.rs

**Files:**
- Modify: `src-tauri/src/workspace.rs`

- [ ] **Step 1: Add `tags` field to CfProblem and import db**

At the top of `src-tauri/src/workspace.rs`, the existing imports are fine. Add `tags` to `CfProblem`:

```rust
#[derive(Debug)]
pub struct CfProblem {
    pub contest_id: String,
    pub problem_id: String,
    pub title: String,
    pub time_limit_ms: Option<i64>,
    pub memory_limit_mb: Option<i64>,
    pub samples: Vec<(String, String)>,
    pub tags: Vec<String>,
}
```

- [ ] **Step 2: Scrape tags inside fetch_cf_problem**

In `fetch_cf_problem`, before the `Ok(CfProblem { ... })` return, add:

```rust
    let tag_sel = Selector::parse(".tag-box a").unwrap();
    let tags: Vec<String> = document
        .select(&tag_sel)
        .map(|e| e.text().collect::<String>().trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(CfProblem {
        contest_id,
        problem_id,
        title,
        time_limit_ms,
        memory_limit_mb,
        samples,
        tags,
    })
```

- [ ] **Step 3: Attach scraped tags in scaffold_workspace**

In `scaffold_workspace`, after `db::insert_problem(conn, &problem)?;` and the test case loop, add:

```rust
    // Attach scraped tags (silent failure per spec)
    let _ = db::insert_scraped_tags(conn, &folder_name, &cf.tags);
```

The full `scaffold_workspace` end should look like:

```rust
    db::insert_problem(conn, &problem)?;

    for (i, (input, expected)) in cf.samples.iter().enumerate() {
        let tc = TestCase {
            id: Uuid::new_v4().to_string(),
            problem_id: folder_name.clone(),
            name: format!("Sample {}", i + 1),
            input: input.clone(),
            expected: Some(expected.clone()),
            position: i as i64,
            created_at: now_ms(),
        };
        db::insert_test_case(conn, &tc)?;
    }

    let _ = db::insert_scraped_tags(conn, &folder_name, &cf.tags);

    Ok(problem)
```

- [ ] **Step 4: Add db import to workspace.rs**

Ensure the top of `workspace.rs` has:

```rust
use crate::db;
```

(It already imports `crate::db` — confirm line 3 reads `use crate::db;`.)

- [ ] **Step 5: Verify compilation**

```bash
cd src-tauri && cargo build 2>&1 | tail -10
```
Expected: `Finished` with no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/workspace.rs
git commit -m "feat: scrape CF tags and attach on scaffold"
```

---

### Task 5: LC Scaffold in workspace.rs

**Files:**
- Modify: `src-tauri/src/workspace.rs`

- [ ] **Step 1: Add LcProblem struct and parse_lc_url**

Append to `src-tauri/src/workspace.rs`:

```rust
#[derive(Debug)]
struct LcProblem {
    slug: String,
    title: String,
    tags: Vec<String>,
    sample_input: String,
}

fn parse_lc_url(url: &str) -> Option<String> {
    url.split("leetcode.com/problems/")
        .nth(1)
        .and_then(|s| s.split('/').next())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

fn fetch_lc_problem(url: &str) -> AppResult<LcProblem> {
    let slug = parse_lc_url(url)
        .ok_or_else(|| AppError::Generic(format!("Invalid LeetCode URL: {}", url)))?;

    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; CP-Workbench/1.0)")
        .timeout(std::time::Duration::from_secs(15))
        .build()?;

    let query = format!(
        r#"{{ "query": "{{ question(titleSlug: \"{}\") {{ title topicTags {{ name }} sampleTestCase }} }}" }}"#,
        slug
    );

    let resp = client
        .post("https://leetcode.com/graphql")
        .header("Content-Type", "application/json")
        .body(query)
        .send()?;

    if !resp.status().is_success() {
        return Err(AppError::Generic(format!("LC HTTP {}", resp.status())));
    }

    let json: serde_json::Value = resp.json()?;
    let q = &json["data"]["question"];

    let title = q["title"].as_str()
        .unwrap_or(&slug)
        .to_string();

    let tags = q["topicTags"].as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let sample_input = q["sampleTestCase"].as_str()
        .unwrap_or("")
        .to_string();

    Ok(LcProblem { slug, title, tags, sample_input })
}

pub fn scaffold_lc_problem(
    conn: &rusqlite::Connection,
    url: &str,
    base_dir: &Path,
    template_content: &str,
) -> AppResult<Problem> {
    let lc = fetch_lc_problem(url)?;
    let folder_name = format!("LC_{}", lc.slug);
    let problem_path = base_dir.join(&folder_name);
    std::fs::create_dir_all(&problem_path)?;

    std::fs::write(problem_path.join("main.cpp"), template_content)?;
    std::fs::write(problem_path.join("input.txt"), &lc.sample_input)?;
    std::fs::write(problem_path.join("output.txt"), "")?;
    std::fs::write(problem_path.join("notes.md"), format!("# {}\n\n{}\n", lc.title, url))?;

    let metadata = serde_json::json!({
        "title": lc.title,
        "url": url,
        "slug": lc.slug,
    });
    std::fs::write(problem_path.join("metadata.json"), serde_json::to_string_pretty(&metadata)?)?;

    let problem = Problem {
        id: folder_name.clone(),
        name: lc.title.clone(),
        path: problem_path.to_str().unwrap().to_string(),
        url: Some(url.to_string()),
        time_limit: Some(2000),
        memory_limit: Some(256),
        cpp_standard: "c++20".to_string(),
        created_at: now_ms(),
        last_opened: Some(now_ms()),
    };

    db::insert_problem(conn, &problem)?;

    // Add sample test case (no expected output — LC doesn't expose it)
    let tc = TestCase {
        id: Uuid::new_v4().to_string(),
        problem_id: folder_name.clone(),
        name: "Sample 1".to_string(),
        input: lc.sample_input.clone(),
        expected: None,
        position: 0,
        created_at: now_ms(),
    };
    db::insert_test_case(conn, &tc)?;

    let _ = db::insert_scraped_tags(conn, &folder_name, &lc.tags);

    Ok(problem)
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd src-tauri && cargo build 2>&1 | tail -10
```
Expected: `Finished` with no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/workspace.rs
git commit -m "feat: LC scaffold with GraphQL tag scraping"
```

---

### Task 6: CSES Scaffold in workspace.rs

**Files:**
- Modify: `src-tauri/src/workspace.rs`

- [ ] **Step 1: Add CsesProblem struct and scaffold function**

Append to `src-tauri/src/workspace.rs`:

```rust
#[derive(Debug)]
struct CsesProblem {
    id: String,
    title: String,
}

fn parse_cses_url(url: &str) -> Option<String> {
    url.split("cses.fi/problemset/task/")
        .nth(1)
        .and_then(|s| s.split('/').next())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

fn fetch_cses_problem(url: &str) -> AppResult<CsesProblem> {
    let id = parse_cses_url(url)
        .ok_or_else(|| AppError::Generic(format!("Invalid CSES URL: {}", url)))?;

    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; CP-Workbench/1.0)")
        .timeout(std::time::Duration::from_secs(15))
        .build()?;

    let resp = client.get(url).send()?;
    if !resp.status().is_success() {
        return Err(AppError::Generic(format!("CSES HTTP {}", resp.status())));
    }
    let html = resp.text()?;
    let document = Html::parse_document(&html);

    let title = document
        .select(&Selector::parse("h1.title").unwrap())
        .next()
        .map(|e| e.text().collect::<String>().trim().to_string())
        .unwrap_or_else(|| format!("CSES_{}", id));

    Ok(CsesProblem { id, title })
}

pub fn scaffold_cses_problem(
    conn: &rusqlite::Connection,
    url: &str,
    base_dir: &Path,
    template_content: &str,
) -> AppResult<Problem> {
    let cses = fetch_cses_problem(url)?;
    let folder_name = format!("CSES_{}", cses.id);
    let problem_path = base_dir.join(&folder_name);
    std::fs::create_dir_all(&problem_path)?;

    std::fs::write(problem_path.join("main.cpp"), template_content)?;
    std::fs::write(problem_path.join("input.txt"), "")?;
    std::fs::write(problem_path.join("output.txt"), "")?;
    std::fs::write(problem_path.join("notes.md"), format!("# {}\n\n{}\n", cses.title, url))?;

    let metadata = serde_json::json!({
        "title": cses.title,
        "url": url,
        "problem_id": cses.id,
    });
    std::fs::write(problem_path.join("metadata.json"), serde_json::to_string_pretty(&metadata)?)?;

    let problem = Problem {
        id: folder_name.clone(),
        name: cses.title.clone(),
        path: problem_path.to_str().unwrap().to_string(),
        url: Some(url.to_string()),
        time_limit: Some(1000),
        memory_limit: Some(256),
        cpp_standard: "c++20".to_string(),
        created_at: now_ms(),
        last_opened: Some(now_ms()),
    };

    db::insert_problem(conn, &problem)?;

    let tc = TestCase {
        id: Uuid::new_v4().to_string(),
        problem_id: folder_name.clone(),
        name: "Sample 1".to_string(),
        input: String::new(),
        expected: None,
        position: 0,
        created_at: now_ms(),
    };
    db::insert_test_case(conn, &tc)?;

    Ok(problem)
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd src-tauri && cargo build 2>&1 | tail -10
```
Expected: `Finished` with no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/workspace.rs
git commit -m "feat: CSES scaffold"
```

---

### Task 7: Rust Commands + lib.rs Registration

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Update commands.rs imports**

Change the top import line in `src-tauri/src/commands.rs`:

```rust
use crate::db;
use crate::error::AppResult;
use crate::models::{Problem, RunResult, StressResult, Tag, Group, TestCase};
use crate::runner;
use crate::workspace;
use std::path::Path;
```

- [ ] **Step 2: Add 14 new commands to commands.rs**

Append after the existing `rename_problem` command:

```rust
// ── Tags ──────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_tags() -> AppResult<Vec<Tag>> {
    let conn = db::open()?;
    db::get_all_tags(&conn)
}

#[tauri::command]
pub fn create_tag(name: String, color: String) -> AppResult<Tag> {
    let conn = db::open()?;
    db::create_tag(&conn, &name, &color)
}

#[tauri::command]
pub fn delete_tag(id: String) -> AppResult<()> {
    let conn = db::open()?;
    db::delete_tag(&conn, &id)
}

#[tauri::command]
pub fn get_problem_tags(problem_id: String) -> AppResult<Vec<Tag>> {
    let conn = db::open()?;
    db::get_problem_tags(&conn, &problem_id)
}

#[tauri::command]
pub fn set_problem_tags(problem_id: String, tag_ids: Vec<String>) -> AppResult<()> {
    let conn = db::open()?;
    db::set_problem_tags(&conn, &problem_id, &tag_ids)
}

// ── Groups ─────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_groups() -> AppResult<Vec<Group>> {
    let conn = db::open()?;
    db::get_all_groups(&conn)
}

#[tauri::command]
pub fn create_group(name: String) -> AppResult<Group> {
    let conn = db::open()?;
    db::create_group(&conn, &name)
}

#[tauri::command]
pub fn delete_group(id: String) -> AppResult<()> {
    let conn = db::open()?;
    db::delete_group(&conn, &id)
}

#[tauri::command]
pub fn rename_group(id: String, name: String) -> AppResult<()> {
    let conn = db::open()?;
    db::rename_group(&conn, &id, &name)
}

#[tauri::command]
pub fn get_group_members(group_id: String) -> AppResult<Vec<String>> {
    let conn = db::open()?;
    db::get_group_members(&conn, &group_id)
}

#[tauri::command]
pub fn set_group_members(group_id: String, problem_ids: Vec<String>) -> AppResult<()> {
    let conn = db::open()?;
    db::set_group_members(&conn, &group_id, &problem_ids)
}

#[tauri::command]
pub fn get_run_count(problem_id: String) -> AppResult<i64> {
    let conn = db::open()?;
    db::get_run_count(&conn, &problem_id)
}

// ── LC / CSES scaffold ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn scaffold_lc_problem(url: String, base_dir: String, template: String) -> AppResult<Problem> {
    let conn = db::open()?;
    workspace::scaffold_lc_problem(&conn, &url, Path::new(&base_dir), &template)
}

#[tauri::command]
pub fn scaffold_cses_problem(url: String, base_dir: String, template: String) -> AppResult<Problem> {
    let conn = db::open()?;
    workspace::scaffold_cses_problem(&conn, &url, Path::new(&base_dir), &template)
}
```

- [ ] **Step 3: Register commands in lib.rs**

Replace the invoke_handler in `src-tauri/src/lib.rs`:

```rust
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_problems,
            commands::get_problem,
            commands::create_blank_problem,
            commands::scaffold_cf_problem,
            commands::set_problem_standard,
            commands::open_problem,
            commands::get_test_cases,
            commands::create_test_case,
            commands::update_test_case,
            commands::delete_test_case,
            commands::run_solution,
            commands::save_code,
            commands::load_code,
            commands::run_stress_test,
            commands::save_stress_file,
            commands::get_setting,
            commands::set_setting,
            commands::get_template,
            commands::ai_review,
            commands::ai_complexity,
            commands::ai_generate_tests,
            commands::ai_optimize,
            commands::stop_process,
            commands::delete_problem,
            commands::rename_problem,
            commands::get_tags,
            commands::create_tag,
            commands::delete_tag,
            commands::get_problem_tags,
            commands::set_problem_tags,
            commands::get_groups,
            commands::create_group,
            commands::delete_group,
            commands::rename_group,
            commands::get_group_members,
            commands::set_group_members,
            commands::get_run_count,
            commands::scaffold_lc_problem,
            commands::scaffold_cses_problem,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Verify compilation**

```bash
cd src-tauri && cargo build 2>&1 | tail -10
```
Expected: `Finished` with no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: 14 new Tauri commands for tags, groups, LC/CSES scaffold"
```

---

### Task 8: TypeScript Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add Tag, Group, ProblemWithMeta**

Append to `src/lib/types.ts`:

```typescript
export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Group {
  id: string;
  name: string;
  created_at: number;
}

export interface ProblemWithMeta extends Problem {
  tags: Tag[];
  groupIds: string[];
  runCount: number;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npm run build 2>&1 | tail -10
```
Expected: build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add Tag, Group, ProblemWithMeta TypeScript types"
```

---

### Task 9: Store + API Additions

**Files:**
- Modify: `src/store/useStore.ts`
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Add tags and groups to useStore.ts**

In `src/store/useStore.ts`, update the `AppState` interface to add after `stressResult: StressResult | null;`:

```typescript
  // Tags and groups (global predefined lists)
  tags: Tag[];
  groups: Group[];
  setTags: (tags: Tag[]) => void;
  setGroups: (groups: Group[]) => void;
```

Update the import at the top:

```typescript
import type { Problem, TestCase, RunResult, StressResult, Tag, Group } from '../lib/types';
```

Update the initial state in `create<AppState>((set) => ({`:
- Add after `stressResult: null,`:

```typescript
  tags: [],
  groups: [],
  setTags: (tags) => set({ tags }),
  setGroups: (groups) => set({ groups }),
```

- [ ] **Step 2: Add API calls to tauri.ts**

In `src/lib/tauri.ts`, update the import line:

```typescript
import type { Problem, TestCase, RunResult, StressResult, Tag, Group } from './types';
```

Append to the `api` object (before the closing `}`):

```typescript
  // Tags
  getTags: () => invoke<Tag[]>('get_tags'),
  createTag: (name: string, color: string) => invoke<Tag>('create_tag', { name, color }),
  deleteTag: (id: string) => invoke<void>('delete_tag', { id }),
  getProblemTags: (problemId: string) => invoke<Tag[]>('get_problem_tags', { problemId }),
  setProblemTags: (problemId: string, tagIds: string[]) => invoke<void>('set_problem_tags', { problemId, tagIds }),

  // Groups
  getGroups: () => invoke<Group[]>('get_groups'),
  createGroup: (name: string) => invoke<Group>('create_group', { name }),
  deleteGroup: (id: string) => invoke<void>('delete_group', { id }),
  renameGroup: (id: string, name: string) => invoke<void>('rename_group', { id, name }),
  getGroupMembers: (groupId: string) => invoke<string[]>('get_group_members', { groupId }),
  setGroupMembers: (groupId: string, problemIds: string[]) => invoke<void>('set_group_members', { groupId, problemIds }),
  getRunCount: (problemId: string) => invoke<number>('get_run_count', { problemId }),

  // LC / CSES scaffold
  scaffoldLcProblem: (url: string, baseDir: string, template: string) =>
    invoke<Problem>('scaffold_lc_problem', { url, baseDir, template }),
  scaffoldCsesProblem: (url: string, baseDir: string, template: string) =>
    invoke<Problem>('scaffold_cses_problem', { url, baseDir, template }),
```

- [ ] **Step 3: Verify TypeScript**

```bash
npm run build 2>&1 | tail -10
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/store/useStore.ts src/lib/tauri.ts
git commit -m "feat: store + API additions for tags, groups, LC/CSES"
```

---

### Task 10: WorkspaceGenerator — Platform Detection

**Files:**
- Modify: `src/components/WorkspaceGenerator.tsx`

- [ ] **Step 1: Detect platform and route to correct scaffold command**

In `src/components/WorkspaceGenerator.tsx`, replace the entire `if (mode === 'cf')` block inside `handleSubmit`:

```typescript
      if (mode === 'cf') {
        const url = cfUrl.trim();
        if (url.includes('codeforces.com')) {
          if (!url.includes('codeforces.com/contest/') && !url.includes('codeforces.com/problemset/')) {
            throw new Error('Invalid Codeforces URL — expected /contest/ or /problemset/ format');
          }
          await api.setSetting('base_dir', dir);
          const problem = await api.scaffoldCfProblem(url, dir, tmplContent);
          problemId = problem.id;
        } else if (url.includes('leetcode.com/problems/')) {
          await api.setSetting('base_dir', dir);
          const problem = await api.scaffoldLcProblem(url, dir, tmplContent);
          problemId = problem.id;
        } else if (url.includes('cses.fi/problemset/task/')) {
          await api.setSetting('base_dir', dir);
          const problem = await api.scaffoldCsesProblem(url, dir, tmplContent);
          problemId = problem.id;
        } else {
          throw new Error('Unsupported URL — paste a Codeforces, LeetCode, or CSES problem URL');
        }
      }
```

Also update the mode tab label for `cf` from `'Codeforces URL'` to `'Problem URL'` and the placeholder to `'https://codeforces.com/... or leetcode.com/... or cses.fi/...'`:

In the JSX, find:
```tsx
              {m === 'cf' ? 'Codeforces URL' : 'Blank Problem'}
```
Change to:
```tsx
              {m === 'cf' ? 'Problem URL' : 'Blank Problem'}
```

Find the URL input placeholder:
```tsx
                placeholder="https://codeforces.com/contest/1234/problem/A"
```
Change to:
```tsx
                placeholder="codeforces.com/contest/... · leetcode.com/problems/... · cses.fi/problemset/task/..."
```

Also update the validation in the old CF-only check — it's now replaced by the block above so no separate validation is needed.

- [ ] **Step 2: Verify TypeScript**

```bash
npm run build 2>&1 | tail -10
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/WorkspaceGenerator.tsx
git commit -m "feat: WorkspaceGenerator routes CF/LC/CSES URLs to correct scaffold"
```

---

### Task 11: DataManagement Rewrite

**Files:**
- Modify: `src/components/DataManagement.tsx` (full rewrite)

- [ ] **Step 1: Write full-screen two-column DataManagement**

Replace the entire contents of `src/components/DataManagement.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../lib/tauri';
import type { Problem, Tag, Group, ProblemWithMeta } from '../lib/types';
import ConfirmDialog from './ConfirmDialog';
import TagManager from './TagManager';
import GroupManager from './GroupManager';

interface DataManagementProps {
  onClose: () => void;
  onOpenProblem: (id: string) => void;
}

const PRESET_COLORS = ['#58a6ff', '#3fb950', '#f78166', '#d2a8ff', '#ffa657', '#79c0ff'];

function getPlatform(url: string | null): string {
  if (!url) return 'Other';
  if (url.includes('codeforces.com')) return 'CF';
  if (url.includes('leetcode.com')) return 'LC';
  if (url.includes('cses.fi')) return 'CSES';
  return 'Other';
}

function getCfContestId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/codeforces\.com\/contest\/(\d+)/);
  return match ? match[1] : null;
}

export default function DataManagement({ onClose, onOpenProblem }: DataManagementProps) {
  const problems = useStore(s => s.problems);
  const setProblems = useStore(s => s.setProblems);
  const tags = useStore(s => s.tags);
  const setTags = useStore(s => s.setTags);
  const groups = useStore(s => s.groups);
  const setGroups = useStore(s => s.setGroups);

  const [enriched, setEnriched] = useState<ProblemWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [platformFilter, setPlatformFilter] = useState<string>('All');
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [groupFilter, setGroupFilter] = useState<string>('All'); // group id or 'All' or auto-group key

  // UI state
  const [deleteTarget, setDeleteTarget] = useState<Problem | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [showTagManager, setShowTagManager] = useState(false);
  const [groupManagerProblemId, setGroupManagerProblemId] = useState<string | null>(null);

  // Load enriched data on open
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [fetchedTags, fetchedGroups] = await Promise.all([
          api.getTags(),
          api.getGroups(),
        ]);
        if (cancelled) return;
        setTags(fetchedTags);
        setGroups(fetchedGroups);

        const allGroupMembers: Record<string, string[]> = {};
        await Promise.all(
          fetchedGroups.map(async (g) => {
            const members = await api.getGroupMembers(g.id);
            allGroupMembers[g.id] = members;
          })
        );

        const enrichedProblems = await Promise.all(
          problems.map(async (p) => {
            const [problemTags, runCount] = await Promise.all([
              api.getProblemTags(p.id),
              api.getRunCount(p.id),
            ]);
            const groupIds = fetchedGroups
              .filter(g => allGroupMembers[g.id]?.includes(p.id))
              .map(g => g.id);
            return { ...p, tags: problemTags, groupIds, runCount } as ProblemWithMeta;
          })
        );

        if (!cancelled) setEnriched(enrichedProblems);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [problems, setTags, setGroups]);

  // Compute auto-groups from URLs
  const platforms = ['All', 'CF', 'LC', 'CSES', 'Other'];
  const cfContests = Array.from(
    new Set(problems.map(p => getCfContestId(p.url)).filter(Boolean) as string[])
  ).sort();

  // Filter problems
  const filtered = enriched.filter(p => {
    if (platformFilter !== 'All' && getPlatform(p.url) !== platformFilter) return false;
    if (selectedTagIds.size > 0) {
      const problemTagIds = new Set(p.tags.map(t => t.id));
      for (const tid of selectedTagIds) {
        if (!problemTagIds.has(tid)) return false;
      }
    }
    if (groupFilter !== 'All') {
      if (groupFilter.startsWith('contest:')) {
        const contestId = groupFilter.replace('contest:', '');
        if (getCfContestId(p.url) !== contestId) return false;
      } else {
        if (!p.groupIds.includes(groupFilter)) return false;
      }
    }
    return true;
  });

  const handleDelete = async (p: Problem) => {
    try {
      await api.deleteProblem(p.id);
      const updated = await api.getProblems();
      setProblems(updated);
      setDeleteTarget(null);
    } catch (e) { console.error(e); }
  };

  const handleRename = async (id: string) => {
    if (!renameName.trim()) { setRenaming(null); return; }
    try {
      await api.renameProblem(id, renameName.trim());
      const updated = await api.getProblems();
      setProblems(updated);
      setRenaming(null);
    } catch (e) { console.error(e); }
  };

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId); else next.add(tagId);
      return next;
    });
  };

  const refreshAfterTagChange = useCallback(async () => {
    const [newTags] = await Promise.all([api.getTags()]);
    setTags(newTags);
    // Re-enrich with updated tags
    const enrichedProblems = await Promise.all(
      problems.map(async (p) => {
        const [problemTags, runCount] = await Promise.all([
          api.getProblemTags(p.id),
          api.getRunCount(p.id),
        ]);
        const allGroupMembers = await Promise.all(groups.map(g => api.getGroupMembers(g.id)));
        const groupIds = groups
          .filter((g, i) => allGroupMembers[i].includes(p.id))
          .map(g => g.id);
        return { ...p, tags: problemTags, groupIds, runCount } as ProblemWithMeta;
      })
    );
    setEnriched(enrichedProblems);
  }, [problems, groups, setTags]);

  const refreshAfterGroupChange = useCallback(async () => {
    const newGroups = await api.getGroups();
    setGroups(newGroups);
    // Re-compute group memberships
    const allGroupMembers: Record<string, string[]> = {};
    await Promise.all(newGroups.map(async g => {
      allGroupMembers[g.id] = await api.getGroupMembers(g.id);
    }));
    setEnriched(prev => prev.map(p => ({
      ...p,
      groupIds: newGroups.filter(g => allGroupMembers[g.id]?.includes(p.id)).map(g => g.id),
    })));
  }, [setGroups]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', zIndex: 200 }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontWeight: 500, fontSize: 14 }}>Data &amp; History</span>
        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          {filtered.length} / {problems.length} problems
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn-icon" onClick={onClose} style={{ fontSize: 16 }}>✕</button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Filter panel */}
        <div style={{ width: 220, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '16px 12px', flexShrink: 0 }}>

          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>PLATFORM</div>
          {platforms.map(p => (
            <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
              <input type="radio" name="platform" checked={platformFilter === p} onChange={() => setPlatformFilter(p)} />
              {p}
            </label>
          ))}

          <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>TAGS</span>
            <button
              className="btn-icon"
              style={{ fontSize: 10, color: 'var(--text-accent)' }}
              onClick={() => setShowTagManager(true)}
            >
              Manage
            </button>
          </div>
          {tags.map(tag => (
            <label key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedTagIds.has(tag.id)}
                onChange={() => toggleTagFilter(tag.id)}
              />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
              {tag.name}
            </label>
          ))}
          {tags.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No tags yet</div>
          )}

          <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />

          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>GROUPS</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
            <input type="radio" name="group" checked={groupFilter === 'All'} onChange={() => setGroupFilter('All')} />
            All
          </label>
          {groups.map(g => (
            <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
              <input type="radio" name="group" checked={groupFilter === g.id} onChange={() => setGroupFilter(g.id)} />
              {g.name}
            </label>
          ))}

          {cfContests.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, marginBottom: 4, fontWeight: 500 }}>CF CONTESTS</div>
              {cfContests.map(id => (
                <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
                  <input type="radio" name="group" checked={groupFilter === `contest:${id}`} onChange={() => setGroupFilter(`contest:${id}`)} />
                  Contest {id}
                </label>
              ))}
            </>
          )}
        </div>

        {/* Right: Problem list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>
              Loading…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>
              No problems match the current filters.
            </div>
          )}
          {!loading && filtered.map(p => (
            <div key={p.id}>
              <div className="data-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {renaming === p.id ? (
                    <input
                      className="input input-sm"
                      autoFocus
                      value={renameName}
                      onChange={e => setRenameName(e.target.value)}
                      onBlur={() => handleRename(p.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(p.id);
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span className="text-sm font-medium truncate">{p.name}</span>
                      <span className="badge badge-neutral" style={{ fontSize: 10 }}>{getPlatform(p.url)}</span>
                      {p.tags.map(tag => (
                        <span
                          key={tag.id}
                          style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 10,
                            background: tag.color + '33',
                            color: tag.color,
                            border: `1px solid ${tag.color}55`,
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-tertiary" style={{ marginTop: 2 }}>
                    {p.runCount} run{p.runCount !== 1 ? 's' : ''} · {p.cpp_standard}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { onOpenProblem(p.id); onClose(); }}>Open</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setRenaming(p.id); setRenameName(p.name); }}>Rename</button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setGroupManagerProblemId(groupManagerProblemId === p.id ? null : p.id)}
                  >
                    Groups
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(p)}>Delete</button>
                </div>

                {/* Inline tag editor */}
                <TagEditor
                  problem={p}
                  allTags={tags}
                  onSave={async (tagIds) => {
                    await api.setProblemTags(p.id, tagIds);
                    setEnriched(prev => prev.map(ep =>
                      ep.id === p.id
                        ? { ...ep, tags: tags.filter(t => tagIds.includes(t.id)) }
                        : ep
                    ));
                  }}
                />
              </div>

              {/* Inline group manager */}
              {groupManagerProblemId === p.id && (
                <div style={{ padding: '0 16px 12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <GroupManager
                    problemId={p.id}
                    currentGroupIds={p.groupIds}
                    groups={groups}
                    onGroupsChanged={refreshAfterGroupChange}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Problem"
          message={`Delete "${deleteTarget.name}"? This removes all test cases and run history. Files on disk are NOT deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {showTagManager && (
        <TagManager
          tags={tags}
          onClose={() => setShowTagManager(false)}
          onChanged={refreshAfterTagChange}
        />
      )}
    </div>
  );
}

// Inline tag editor shown per problem row
function TagEditor({
  problem,
  allTags,
  onSave,
}: {
  problem: ProblemWithMeta;
  allTags: Tag[];
  onSave: (tagIds: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(problem.tags.map(t => t.id)));
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(Array.from(selected));
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        style={{ fontSize: 10, color: 'var(--text-secondary)' }}
        onClick={() => { setSelected(new Set(problem.tags.map(t => t.id))); setOpen(true); }}
      >
        + Tags
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', padding: '4px 0', width: '100%' }}>
      {allTags.map(tag => (
        <button
          key={tag.id}
          onClick={() => toggle(tag.id)}
          style={{
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 10,
            border: `1px solid ${tag.color}`,
            background: selected.has(tag.id) ? tag.color : 'transparent',
            color: selected.has(tag.id) ? 'white' : tag.color,
            cursor: 'pointer',
          }}
        >
          {tag.name}
        </button>
      ))}
      <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={save} disabled={saving}>
        {saving ? '…' : 'Save'}
      </button>
      <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npm run build 2>&1 | tail -15
```
Expected: build succeeds (TagManager and GroupManager will be missing — create them in Tasks 12/13 first if build fails).

- [ ] **Step 3: Commit**

```bash
git add src/components/DataManagement.tsx
git commit -m "feat: DataManagement full-screen rewrite with filter panel and tag chips"
```

---

### Task 12: TagManager Component

**Files:**
- Create: `src/components/TagManager.tsx`

- [ ] **Step 1: Write TagManager**

Create `src/components/TagManager.tsx`:

```tsx
import { useState } from 'react';
import { api } from '../lib/tauri';
import type { Tag } from '../lib/types';

const PRESET_COLORS = ['#58a6ff', '#3fb950', '#f78166', '#d2a8ff', '#ffa657', '#79c0ff'];

interface TagManagerProps {
  tags: Tag[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}

export default function TagManager({ tags, onClose, onChanged }: TagManagerProps) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.createTag(newName.trim(), newColor);
      setNewName('');
      await onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteTag(id);
      await onChanged();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, width: 400, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 500, fontSize: 14 }}>Manage Tags</span>
          <div style={{ flex: 1 }} />
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Create new tag */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Tag name"
            style={{
              flex: 1,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: 'inherit',
              padding: '6px 8px',
              borderRadius: 4,
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: c,
                  border: newColor === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
          <button
            className="btn btn-sm"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            style={{ background: 'var(--accent)', color: 'white', border: 'none' }}
          >
            Add
          </button>
        </div>

        {error && <div style={{ fontSize: 11, color: 'var(--error)', marginBottom: 8 }}>{error}</div>}

        {/* Tag list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {tags.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>
              No tags yet. Create one above.
            </div>
          )}
          {tags.map(tag => (
            <div
              key={tag.id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, flex: 1 }}>{tag.name}</span>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDelete(tag.id)}
                style={{ fontSize: 10 }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npm run build 2>&1 | tail -10
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/TagManager.tsx
git commit -m "feat: TagManager component for creating and deleting tags"
```

---

### Task 13: GroupManager Component

**Files:**
- Create: `src/components/GroupManager.tsx`

- [ ] **Step 1: Write GroupManager**

Create `src/components/GroupManager.tsx`:

```tsx
import { useState } from 'react';
import { api } from '../lib/tauri';
import type { Group } from '../lib/types';

interface GroupManagerProps {
  problemId: string;
  currentGroupIds: string[];
  groups: Group[];
  onGroupsChanged: () => Promise<void>;
}

export default function GroupManager({ problemId, currentGroupIds, groups, onGroupsChanged }: GroupManagerProps) {
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMember = (groupId: string) => currentGroupIds.includes(groupId);

  const toggleMembership = async (group: Group) => {
    setSaving(group.id);
    setError(null);
    try {
      const members = await api.getGroupMembers(group.id);
      const next = isMember(group.id)
        ? members.filter(id => id !== problemId)
        : [...members, problemId];
      await api.setGroupMembers(group.id, next);
      await onGroupsChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(null);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newGroupName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const group = await api.createGroup(newGroupName.trim());
      await api.setGroupMembers(group.id, [problemId]);
      setNewGroupName('');
      await onGroupsChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, fontSize: 11 }}>GROUPS</div>

      {groups.length === 0 && (
        <div style={{ color: 'var(--text-tertiary)', marginBottom: 8 }}>No groups yet.</div>
      )}

      {groups.map(g => (
        <label
          key={g.id}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: saving === g.id ? 'wait' : 'pointer' }}
        >
          <input
            type="checkbox"
            checked={isMember(g.id)}
            disabled={saving === g.id}
            onChange={() => toggleMembership(g)}
          />
          <span>{g.name}</span>
        </label>
      ))}

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input
          value={newGroupName}
          onChange={e => setNewGroupName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreateAndAdd()}
          placeholder="New group name"
          style={{
            flex: 1,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: 11,
            fontFamily: 'inherit',
            padding: '4px 8px',
            borderRadius: 4,
            outline: 'none',
          }}
        />
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleCreateAndAdd}
          disabled={creating || !newGroupName.trim()}
          style={{ fontSize: 11 }}
        >
          {creating ? '…' : '+ Create & Add'}
        </button>
      </div>

      {error && <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 4 }}>{error}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify full build**

```bash
npm run build 2>&1 | tail -15
```
Expected: build succeeds with no errors.

- [ ] **Step 3: Verify Rust still clean**

```bash
cd src-tauri && cargo build 2>&1 | tail -5
```
Expected: `Finished` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/GroupManager.tsx
git commit -m "feat: GroupManager inline component for per-problem group membership"
```

---

## Self-Review

**Spec coverage:**
- ✅ 4 new DB tables with FK cascades
- ✅ CF tag scraping via `.tag-box a` selector
- ✅ LC scaffold via GraphQL (title, tags, sample input)
- ✅ CSES scaffold via `h1.title` scrape
- ✅ 12 Rust commands (get/create/delete tag, get/set problem tags, get/create/delete/rename group, get/set group members, get run count) + 2 scaffold commands
- ✅ Tag + Group TypeScript types + ProblemWithMeta
- ✅ Store additions (tags, groups)
- ✅ API additions (14 calls)
- ✅ WorkspaceGenerator platform detection for LC/CSES
- ✅ DataManagement full-screen two-column filter+list
- ✅ TagManager modal (create tag with 6 preset colors, delete)
- ✅ GroupManager inline (toggle membership, create new group)
- ✅ Auto-groups: platform filter + CF contest grouping
- ✅ All filtering client-side
- ✅ Tag scraping failure is silent (uses `let _ = ...`)

**Type consistency:**
- `ProblemWithMeta` extends `Problem` and adds `tags: Tag[]`, `groupIds: string[]`, `runCount: number` — used consistently in DataManagement
- `Tag` and `Group` defined in `types.ts`, imported in store, tauri, all components
- Rust `Tag` and `Group` match TypeScript field names (serde defaults to snake_case, but Tauri serializes to camelCase for JS — fields are simple enough that `id/name/color/created_at` work as-is)

**Placeholder scan:** None found.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-07-enhanced-history.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review between each task, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
