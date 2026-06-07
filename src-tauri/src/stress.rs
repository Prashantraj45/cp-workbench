use crate::compiler::compile;
use crate::error::AppResult;
use crate::models::StressResult;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

const STRESS_TIMEOUT_MS: u64 = 5_000;

/// Run stress test: compile gen/brute/solution, loop until mismatch or max_iterations.
/// All three source files must exist in the same directory.
pub fn run_stress(
    gen_path: &Path,
    brute_path: &Path,
    solution_path: &Path,
    standard: &str,
    max_iterations: u32,
    on_progress: impl Fn(u32),
) -> AppResult<StressResult> {
    // Compile all three
    let gen_result = compile(gen_path, standard)?;
    if !gen_result.success {
        return Err(crate::error::AppError::Generic("Generator compilation failed".into()));
    }
    let brute_result = compile(brute_path, standard)?;
    if !brute_result.success {
        return Err(crate::error::AppError::Generic("Brute force compilation failed".into()));
    }
    let sol_result = compile(solution_path, standard)?;
    if !sol_result.success {
        return Err(crate::error::AppError::Generic("Solution compilation failed".into()));
    }

    for i in 1..=max_iterations {
        on_progress(i);

        // Run generator (no input, outputs random test)
        let gen_out = run_binary(&gen_result.binary_path, "", STRESS_TIMEOUT_MS)?;
        let test_input = gen_out.stdout;

        // Run brute and solution with the generated input
        let brute_out = run_binary(&brute_result.binary_path, &test_input, STRESS_TIMEOUT_MS)?;
        let sol_out = run_binary(&sol_result.binary_path, &test_input, STRESS_TIMEOUT_MS)?;

        let expected = brute_out.stdout.trim().to_string();
        let actual = sol_out.stdout.trim().to_string();

        if expected != actual {
            return Ok(StressResult {
                iteration: i,
                mismatch_found: true,
                input: test_input,
                expected,
                actual,
            });
        }
    }

    Ok(StressResult {
        iteration: max_iterations,
        mismatch_found: false,
        input: String::new(),
        expected: String::new(),
        actual: String::new(),
    })
}

struct BinaryOutput {
    stdout: String,
}

fn run_binary(binary: &str, input: &str, timeout_ms: u64) -> AppResult<BinaryOutput> {
    let mut child = Command::new(binary)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input.as_bytes());
    }

    let timeout = Duration::from_millis(timeout_ms);
    let start = std::time::Instant::now();
    loop {
        match child.try_wait()? {
            Some(_) => break,
            None if start.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                break;
            }
            None => std::thread::sleep(Duration::from_millis(5)),
        }
    }

    let mut stdout = Vec::new();
    if let Some(ref mut out) = child.stdout {
        use std::io::Read;
        let _ = out.read_to_end(&mut stdout);
    }

    Ok(BinaryOutput {
        stdout: String::from_utf8_lossy(&stdout).to_string(),
    })
}
