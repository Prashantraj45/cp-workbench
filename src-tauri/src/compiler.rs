use crate::error::AppResult;
use crate::models::CompileError;
use regex::Regex;
use std::path::Path;
use std::process::Command;
use std::time::Instant;

const GCC_PATH: &str = "/opt/homebrew/bin/g++-15";

/// Maps "c++17" | "c++20" | "c++23" to g++ flag
fn std_flag(standard: &str) -> &'static str {
    match standard {
        "c++17" => "-std=c++17",
        "c++23" => "-std=c++23",
        _ => "-std=c++20",
    }
}

pub struct CompileResult {
    pub success: bool,
    pub errors: Vec<CompileError>,
    pub elapsed_ms: u64,
    pub binary_path: String,
}

pub fn compile(source_path: &Path, standard: &str) -> AppResult<CompileResult> {
    let dir = source_path.parent().ok_or_else(|| crate::error::AppError::Generic("no parent dir".into()))?;
    let binary = dir.join("main");
    let start = Instant::now();

    let output = Command::new(GCC_PATH)
        .args([
            std_flag(standard),
            "-O2",
            "-o",
            binary.to_str().unwrap(),
            source_path.to_str().unwrap(),
        ])
        .output()?;

    let elapsed_ms = start.elapsed().as_millis() as u64;
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let errors = parse_errors(&stderr);
    let success = output.status.success();

    Ok(CompileResult {
        success,
        errors,
        elapsed_ms,
        binary_path: binary.to_str().unwrap().to_string(),
    })
}

/// Parse GCC/G++ error output into structured CompileError list.
/// Format: filename:line:col: severity: message
fn parse_errors(stderr: &str) -> Vec<CompileError> {
    let re = Regex::new(r"^(.+):(\d+):(\d+):\s+(error|warning|note):\s+(.+)$").unwrap();
    stderr
        .lines()
        .filter_map(|line| {
            re.captures(line).map(|cap| CompileError {
                file: cap[1].to_string(),
                line: cap[2].parse().unwrap_or(0),
                col: cap[3].parse().unwrap_or(0),
                severity: cap[4].to_string(),
                message: cap[5].to_string(),
            })
        })
        .collect()
}
