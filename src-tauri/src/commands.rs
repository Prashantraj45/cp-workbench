use crate::db;
use crate::error::AppResult;
use crate::models::{Problem, RunResult, StressResult, TestCase};
use crate::runner;
use crate::workspace;
use std::path::Path;

// ── Problems ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_problems() -> AppResult<Vec<Problem>> {
    let conn = db::open()?;
    db::get_all_problems(&conn)
}

#[tauri::command]
pub fn get_problem(id: String) -> AppResult<Option<Problem>> {
    let conn = db::open()?;
    db::get_problem(&conn, &id)
}

#[tauri::command]
pub fn create_blank_problem(
    name: String,
    path: String,
    template: String,
    cpp_standard: String,
) -> AppResult<Problem> {
    let conn = db::open()?;
    workspace::scaffold_blank(&conn, &name, Path::new(&path), &template, &cpp_standard)
}

#[tauri::command]
pub fn scaffold_cf_problem(url: String, base_dir: String, template: String) -> AppResult<Problem> {
    let conn = db::open()?;
    workspace::scaffold_workspace(&conn, &url, Path::new(&base_dir), &template)
}

#[tauri::command]
pub fn set_problem_standard(id: String, standard: String) -> AppResult<()> {
    let conn = db::open()?;
    db::update_problem_standard(&conn, &id, &standard)
}

#[tauri::command]
pub fn open_problem(id: String) -> AppResult<Problem> {
    let conn = db::open()?;
    db::touch_problem(&conn, &id)?;
    db::get_problem(&conn, &id)?
        .ok_or_else(|| crate::error::AppError::Generic(format!("Problem {} not found", id)))
}

// ── Test Cases ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_test_cases(problem_id: String) -> AppResult<Vec<TestCase>> {
    let conn = db::open()?;
    db::get_test_cases(&conn, &problem_id)
}

#[tauri::command]
pub fn create_test_case(
    problem_id: String,
    name: String,
    input: String,
    expected: Option<String>,
) -> AppResult<TestCase> {
    let conn = db::open()?;
    let cases = db::get_test_cases(&conn, &problem_id)?;
    let position = cases.len() as i64;
    let tc = TestCase {
        id: uuid::Uuid::new_v4().to_string(),
        problem_id,
        name,
        input,
        expected,
        position,
        created_at: db::now_ms(),
    };
    db::insert_test_case(&conn, &tc)?;
    Ok(tc)
}

#[tauri::command]
pub fn update_test_case(
    id: String,
    name: String,
    input: String,
    expected: Option<String>,
) -> AppResult<()> {
    let conn = db::open()?;
    db::update_test_case(&conn, &id, &name, &input, expected.as_deref())
}

#[tauri::command]
pub fn delete_test_case(id: String) -> AppResult<()> {
    let conn = db::open()?;
    db::delete_test_case(&conn, &id)
}

// ── Run ────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn run_solution(problem_id: String, test_case_id: String) -> AppResult<RunResult> {
    let conn = db::open()?;

    let problem = db::get_problem(&conn, &problem_id)?
        .ok_or_else(|| crate::error::AppError::Generic(format!("Problem {} not found", problem_id)))?;

    let test_case = db::get_test_cases(&conn, &problem_id)?
        .into_iter()
        .find(|tc| tc.id == test_case_id)
        .ok_or_else(|| crate::error::AppError::Generic(format!("TestCase {} not found", test_case_id)))?;

    let source_path = Path::new(&problem.path).join("main.cpp");
    let timeout_ms = problem.time_limit.map(|t| t as u64 + 2000); // 2s grace over time limit

    let result = runner::run_solution(
        &source_path,
        &test_case.input,
        &problem.cpp_standard,
        timeout_ms,
    )?;

    // Persist run
    let run = crate::models::Run {
        id: uuid::Uuid::new_v4().to_string(),
        problem_id: problem_id.clone(),
        test_case_id: Some(test_case_id),
        stdout: Some(result.stdout.clone()),
        stderr: Some(result.stderr.clone()),
        exit_code: Some(result.exit_code),
        runtime_ms: Some(result.runtime_ms as i64),
        memory_kb: Some(result.memory_kb as i64),
        compile_time_ms: Some(result.compile_time_ms as i64),
        ran_at: db::now_ms(),
    };
    db::insert_run(&conn, &run)?;

    Ok(result)
}

// ── Save ───────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn save_code(problem_id: String, code: String) -> AppResult<()> {
    let conn = db::open()?;
    let problem = db::get_problem(&conn, &problem_id)?
        .ok_or_else(|| crate::error::AppError::Generic(format!("Problem {} not found", problem_id)))?;
    let path = Path::new(&problem.path).join("main.cpp");
    std::fs::write(path, code)?;
    Ok(())
}

#[tauri::command]
pub fn load_code(problem_id: String) -> AppResult<String> {
    let conn = db::open()?;
    let problem = db::get_problem(&conn, &problem_id)?
        .ok_or_else(|| crate::error::AppError::Generic(format!("Problem {} not found", problem_id)))?;
    let path = Path::new(&problem.path).join("main.cpp");
    Ok(std::fs::read_to_string(path)?)
}

// ── Stress Test ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn run_stress_test(
    problem_id: String,
    max_iterations: u32,
    standard: String,
) -> AppResult<StressResult> {
    let conn = db::open()?;
    let problem = db::get_problem(&conn, &problem_id)?
        .ok_or_else(|| crate::error::AppError::Generic(format!("Problem {} not found", problem_id)))?;

    let dir = Path::new(&problem.path);
    let gen = dir.join("gen.cpp");
    let brute = dir.join("brute.cpp");
    let solution = dir.join("main.cpp");

    crate::stress::run_stress(&gen, &brute, &solution, &standard, max_iterations, |_| {})
}

// ── Stress File Save ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn save_stress_file(problem_id: String, filename: String, content: String) -> AppResult<()> {
    let allowed = ["gen.cpp", "brute.cpp"];
    if !allowed.contains(&filename.as_str()) {
        return Err(crate::error::AppError::Generic(format!("Not allowed: {}", filename)));
    }
    let conn = db::open()?;
    let problem = db::get_problem(&conn, &problem_id)?
        .ok_or_else(|| crate::error::AppError::Generic(format!("Problem {} not found", problem_id)))?;
    let path = Path::new(&problem.path).join(&filename);
    std::fs::write(path, content)?;
    Ok(())
}

// ── Settings ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_setting(key: String) -> AppResult<Option<String>> {
    let conn = db::open()?;
    db::get_setting(&conn, &key)
}

#[tauri::command]
pub fn set_setting(key: String, value: String) -> AppResult<()> {
    let conn = db::open()?;
    db::set_setting(&conn, &key, &value)
}

// ── Template loading ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_template(name: String) -> AppResult<String> {
    // Templates are bundled with the app in src-tauri/templates/
    // In dev, relative to CARGO_MANIFEST_DIR; in release, use resource path
    let template_name = match name.as_str() {
        "blank_cpp17" => "blank_cpp17.cpp",
        "blank_cpp20" => "blank_cpp20.cpp",
        "codeforces" => "codeforces.cpp",
        "atcoder" => "atcoder.cpp",
        "fast_io" => "fast_io.cpp",
        "pbds" => "pbds.cpp",
        _ => "blank_cpp20.cpp",
    };

    // Try dev path first, then release resource path
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("templates")
        .join(template_name);

    if dev_path.exists() {
        return Ok(std::fs::read_to_string(dev_path)?);
    }

    Err(crate::error::AppError::Generic(format!("Template {} not found", name)))
}

// ── AI (stubs) ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn ai_review(_code: String) -> AppResult<String> {
    Ok(String::new())
}

#[tauri::command]
pub fn ai_complexity(_code: String) -> AppResult<String> {
    Ok(String::new())
}

#[tauri::command]
pub fn ai_generate_tests(_problem_id: String) -> AppResult<String> {
    Ok(String::new())
}

#[tauri::command]
pub fn ai_optimize(_code: String) -> AppResult<String> {
    Ok(String::new())
}
