use crate::error::AppResult;
use crate::models::{Problem, Run, TestCase};
use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn db_path() -> PathBuf {
    let home = dirs::home_dir().expect("no home dir");
    let dir = home.join(".cp-workbench");
    std::fs::create_dir_all(&dir).ok();
    dir.join("db.sqlite")
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn open() -> AppResult<Connection> {
    let conn = Connection::open(db_path())?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    migrate(&conn)?;
    Ok(conn)
}

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

// ── Problems ──────────────────────────────────────────────────────────────────

pub fn insert_problem(conn: &Connection, p: &Problem) -> AppResult<()> {
    conn.execute(
        "INSERT INTO problems (id, name, path, url, time_limit, memory_limit, cpp_standard, created_at, last_opened)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![p.id, p.name, p.path, p.url, p.time_limit, p.memory_limit, p.cpp_standard, p.created_at, p.last_opened],
    )?;
    Ok(())
}

pub fn get_all_problems(conn: &Connection) -> AppResult<Vec<Problem>> {
    let mut stmt = conn.prepare(
        "SELECT id,name,path,url,time_limit,memory_limit,cpp_standard,created_at,last_opened FROM problems ORDER BY last_opened DESC NULLS LAST, created_at DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Problem {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            url: row.get(3)?,
            time_limit: row.get(4)?,
            memory_limit: row.get(5)?,
            cpp_standard: row.get(6)?,
            created_at: row.get(7)?,
            last_opened: row.get(8)?,
        })
    })?;
    rows.map(|r| r.map_err(Into::into)).collect()
}

pub fn get_problem(conn: &Connection, id: &str) -> AppResult<Option<Problem>> {
    let mut stmt = conn.prepare(
        "SELECT id,name,path,url,time_limit,memory_limit,cpp_standard,created_at,last_opened FROM problems WHERE id=?1"
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(Problem {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            url: row.get(3)?,
            time_limit: row.get(4)?,
            memory_limit: row.get(5)?,
            cpp_standard: row.get(6)?,
            created_at: row.get(7)?,
            last_opened: row.get(8)?,
        })
    })?;
    Ok(rows.next().transpose()?)
}

pub fn update_problem_standard(conn: &Connection, id: &str, standard: &str) -> AppResult<()> {
    conn.execute("UPDATE problems SET cpp_standard=?1 WHERE id=?2", params![standard, id])?;
    Ok(())
}

pub fn touch_problem(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("UPDATE problems SET last_opened=?1 WHERE id=?2", params![now_ms(), id])?;
    Ok(())
}

// ── Test Cases ─────────────────────────────────────────────────────────────────

pub fn insert_test_case(conn: &Connection, tc: &TestCase) -> AppResult<()> {
    // Enforce max 100 per problem: delete oldest if needed
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM test_cases WHERE problem_id=?1",
        params![tc.problem_id],
        |row| row.get(0),
    )?;
    if count >= 100 {
        conn.execute(
            "DELETE FROM test_cases WHERE id=(SELECT id FROM test_cases WHERE problem_id=?1 ORDER BY created_at ASC LIMIT 1)",
            params![tc.problem_id],
        )?;
    }
    conn.execute(
        "INSERT INTO test_cases (id,problem_id,name,input,expected,position,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![tc.id, tc.problem_id, tc.name, tc.input, tc.expected, tc.position, tc.created_at],
    )?;
    Ok(())
}

pub fn get_test_cases(conn: &Connection, problem_id: &str) -> AppResult<Vec<TestCase>> {
    let mut stmt = conn.prepare(
        "SELECT id,problem_id,name,input,expected,position,created_at FROM test_cases WHERE problem_id=?1 ORDER BY position ASC"
    )?;
    let rows = stmt.query_map(params![problem_id], |row| {
        Ok(TestCase {
            id: row.get(0)?,
            problem_id: row.get(1)?,
            name: row.get(2)?,
            input: row.get(3)?,
            expected: row.get(4)?,
            position: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    rows.map(|r| r.map_err(Into::into)).collect()
}

pub fn update_test_case(conn: &Connection, id: &str, name: &str, input: &str, expected: Option<&str>) -> AppResult<()> {
    conn.execute(
        "UPDATE test_cases SET name=?1, input=?2, expected=?3 WHERE id=?4",
        params![name, input, expected, id],
    )?;
    Ok(())
}

pub fn delete_test_case(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM test_cases WHERE id=?1", params![id])?;
    Ok(())
}

// ── Runs ───────────────────────────────────────────────────────────────────────

pub fn insert_run(conn: &Connection, r: &Run) -> AppResult<()> {
    conn.execute(
        "INSERT INTO runs (id,problem_id,test_case_id,stdout,stderr,exit_code,runtime_ms,memory_kb,compile_time_ms,ran_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![r.id, r.problem_id, r.test_case_id, r.stdout, r.stderr, r.exit_code, r.runtime_ms, r.memory_kb, r.compile_time_ms, r.ran_at],
    )?;
    Ok(())
}

pub fn get_runs(conn: &Connection, problem_id: &str) -> AppResult<Vec<Run>> {
    let mut stmt = conn.prepare(
        "SELECT id,problem_id,test_case_id,stdout,stderr,exit_code,runtime_ms,memory_kb,compile_time_ms,ran_at
         FROM runs WHERE problem_id=?1 ORDER BY ran_at DESC"
    )?;
    let rows = stmt.query_map(params![problem_id], |row| {
        Ok(Run {
            id: row.get(0)?,
            problem_id: row.get(1)?,
            test_case_id: row.get(2)?,
            stdout: row.get(3)?,
            stderr: row.get(4)?,
            exit_code: row.get(5)?,
            runtime_ms: row.get(6)?,
            memory_kb: row.get(7)?,
            compile_time_ms: row.get(8)?,
            ran_at: row.get(9)?,
        })
    })?;
    rows.map(|r| r.map_err(Into::into)).collect()
}

// ── Settings ───────────────────────────────────────────────────────────────────

pub fn get_setting(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key=?1")?;
    let mut rows = stmt.query_map(params![key], |row| row.get(0))?;
    Ok(rows.next().transpose()?)
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO settings (key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    )?;
    Ok(())
}
