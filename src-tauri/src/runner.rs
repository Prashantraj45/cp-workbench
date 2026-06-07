use crate::error::AppResult;
use crate::models::RunResult;
use crate::compiler::compile;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use std::io::Write;

const DEFAULT_TIMEOUT_MS: u64 = 10_000;

pub fn run_solution(
    source_path: &Path,
    input: &str,
    standard: &str,
    timeout_ms: Option<u64>,
) -> AppResult<RunResult> {
    // Step 1: Compile
    let compile_result = compile(source_path, standard)?;

    if !compile_result.success {
        return Ok(RunResult {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: -1,
            runtime_ms: 0,
            memory_kb: 0,
            compile_time_ms: compile_result.elapsed_ms,
            compile_errors: compile_result.errors,
            timed_out: false,
        });
    }

    // Step 2: Execute with timeout via thread
    let binary = compile_result.binary_path.clone();
    let input_owned = input.to_string();
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));

    let start = Instant::now();

    let mut child = Command::new(&binary)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    // Write stdin
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input_owned.as_bytes());
        // stdin dropped here, sending EOF
    }

    // Poll for completion with timeout
    let timed_out;
    let exit_code;
    loop {
        match child.try_wait()? {
            Some(status) => {
                exit_code = status.code().unwrap_or(-1);
                timed_out = false;
                break;
            }
            None if start.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                exit_code = -1;
                timed_out = true;
                break;
            }
            None => {
                std::thread::sleep(Duration::from_millis(5));
            }
        }
    }

    let runtime_ms = start.elapsed().as_millis() as u64;

    // Read stdout/stderr from the process (they're captured in pipes)
    // After try_wait/kill, collect remaining output
    let (stdout_bytes, stderr_bytes) = {
        use std::io::Read;
        let mut out = Vec::new();
        let mut err = Vec::new();
        // stdout/stderr pipes: read what's available
        if let Some(ref mut stdout) = child.stdout {
            let _ = stdout.read_to_end(&mut out);
        }
        if let Some(ref mut stderr) = child.stderr {
            let _ = stderr.read_to_end(&mut err);
        }
        (out, err)
    };

    let memory_kb = get_peak_memory_kb();

    Ok(RunResult {
        stdout: String::from_utf8_lossy(&stdout_bytes).to_string(),
        stderr: String::from_utf8_lossy(&stderr_bytes).to_string(),
        exit_code,
        runtime_ms,
        memory_kb,
        compile_time_ms: compile_result.elapsed_ms,
        compile_errors: compile_result.errors,
        timed_out,
    })
}

fn get_peak_memory_kb() -> u64 {
    #[cfg(target_os = "macos")]
    {
        unsafe {
            let mut rusage: libc::rusage = std::mem::zeroed();
            if libc::getrusage(libc::RUSAGE_CHILDREN, &mut rusage) == 0 {
                return (rusage.ru_maxrss as u64) / 1024;
            }
        }
    }
    0
}
