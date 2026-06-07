use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Problem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub url: Option<String>,
    pub time_limit: Option<i64>,   // ms
    pub memory_limit: Option<i64>, // MB
    pub cpp_standard: String,      // "c++17" | "c++20" | "c++23"
    pub created_at: i64,
    pub last_opened: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestCase {
    pub id: String,
    pub problem_id: String,
    pub name: String,
    pub input: String,
    pub expected: Option<String>,
    pub position: i64,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Run {
    pub id: String,
    pub problem_id: String,
    pub test_case_id: Option<String>,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub exit_code: Option<i32>,
    pub runtime_ms: Option<i64>,
    pub memory_kb: Option<i64>,
    pub compile_time_ms: Option<i64>,
    pub ran_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CompileError {
    pub file: String,
    pub line: u32,
    pub col: u32,
    pub message: String,
    pub severity: String, // "error" | "warning"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RunResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub runtime_ms: u64,
    pub memory_kb: u64,
    pub compile_time_ms: u64,
    pub compile_errors: Vec<CompileError>,
    pub timed_out: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StressResult {
    pub iteration: u32,
    pub mismatch_found: bool,
    pub input: String,
    pub expected: String,
    pub actual: String,
}

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
