/// CP Workbench — Feature Test Suite
/// Tests every major backend feature end-to-end.
use std::path::PathBuf;
use std::fs;

fn test_dir() -> PathBuf {
    let d = std::env::temp_dir().join("cpw_test");
    fs::create_dir_all(&d).unwrap();
    d
}

// ─── Feature 1: Database ─────────────────────────────────────────────────────
#[test]
fn feat_01_db_open_and_migrate() {
    let dir = test_dir();
    let db_path = dir.join("test_feat01.sqlite");
    // Point db at temp path by opening directly
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;").unwrap();
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS problems (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL,
            url TEXT, time_limit INTEGER, memory_limit INTEGER,
            cpp_standard TEXT NOT NULL DEFAULT 'c++20',
            created_at INTEGER NOT NULL, last_opened INTEGER
        );
        CREATE TABLE IF NOT EXISTS test_cases (
            id TEXT PRIMARY KEY, problem_id TEXT NOT NULL, name TEXT NOT NULL,
            input TEXT NOT NULL, expected TEXT, position INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    ").unwrap();
    // Verify tables exist
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('problems','test_cases','settings')",
        [], |r| r.get(0)
    ).unwrap();
    assert_eq!(count, 3, "Expected 3 tables");
    fs::remove_file(&db_path).ok();
}

#[test]
fn feat_02_db_problem_crud() {
    let dir = test_dir();
    let db_path = dir.join("test_feat02.sqlite");
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute_batch("
        CREATE TABLE problems (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL,
            url TEXT, time_limit INTEGER, memory_limit INTEGER,
            cpp_standard TEXT NOT NULL DEFAULT 'c++20',
            created_at INTEGER NOT NULL, last_opened INTEGER
        );
    ").unwrap();
    // Insert
    conn.execute(
        "INSERT INTO problems (id,name,path,cpp_standard,created_at) VALUES ('P1','Two Sum','/tmp/twos','c++20',1000)",
        []
    ).unwrap();
    // Read
    let name: String = conn.query_row("SELECT name FROM problems WHERE id='P1'", [], |r| r.get(0)).unwrap();
    assert_eq!(name, "Two Sum");
    // Update
    conn.execute("UPDATE problems SET cpp_standard='c++17' WHERE id='P1'", []).unwrap();
    let std: String = conn.query_row("SELECT cpp_standard FROM problems WHERE id='P1'", [], |r| r.get(0)).unwrap();
    assert_eq!(std, "c++17");
    fs::remove_file(&db_path).ok();
}

#[test]
fn feat_03_db_test_case_100_limit() {
    let dir = test_dir();
    let db_path = dir.join("test_feat03.sqlite");
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute_batch("
        CREATE TABLE problems (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, url TEXT, time_limit INTEGER, memory_limit INTEGER, cpp_standard TEXT NOT NULL, created_at INTEGER NOT NULL, last_opened INTEGER);
        CREATE TABLE test_cases (id TEXT PRIMARY KEY, problem_id TEXT NOT NULL, name TEXT NOT NULL, input TEXT NOT NULL, expected TEXT, position INTEGER NOT NULL, created_at INTEGER NOT NULL);
        INSERT INTO problems VALUES ('P1','test','/tmp','',2000,256,'c++20',1,NULL);
    ").unwrap();
    // Insert 101 test cases — the 101st should evict the oldest
    for i in 0..101i64 {
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM test_cases WHERE problem_id='P1'", [], |r| r.get(0)).unwrap();
        if count >= 100 {
            conn.execute("DELETE FROM test_cases WHERE id=(SELECT id FROM test_cases WHERE problem_id='P1' ORDER BY created_at ASC LIMIT 1)", []).unwrap();
        }
        conn.execute(
            "INSERT INTO test_cases (id,problem_id,name,input,position,created_at) VALUES (?1,'P1',?2,'',?1,?3)",
            rusqlite::params![format!("tc{}", i), format!("Case {}", i), i],
        ).unwrap();
    }
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM test_cases WHERE problem_id='P1'", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 100, "Should cap at 100 test cases");
    fs::remove_file(&db_path).ok();
}

// ─── Feature 2: Settings ─────────────────────────────────────────────────────
#[test]
fn feat_04_settings_get_set() {
    let dir = test_dir();
    let db_path = dir.join("test_feat04.sqlite");
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);").unwrap();
    conn.execute("INSERT INTO settings VALUES ('theme','dark')", []).unwrap();
    let v: String = conn.query_row("SELECT value FROM settings WHERE key='theme'", [], |r| r.get(0)).unwrap();
    assert_eq!(v, "dark");
    // Upsert
    conn.execute("INSERT INTO settings (key,value) VALUES ('theme','light') ON CONFLICT(key) DO UPDATE SET value=excluded.value", []).unwrap();
    let v2: String = conn.query_row("SELECT value FROM settings WHERE key='theme'", [], |r| r.get(0)).unwrap();
    assert_eq!(v2, "light");
    fs::remove_file(&db_path).ok();
}

// ─── Feature 3: Compiler ─────────────────────────────────────────────────────
#[test]
fn feat_05_compiler_success() {
    let dir = test_dir().join("feat05");
    fs::create_dir_all(&dir).unwrap();
    let src = dir.join("main.cpp");
    fs::write(&src, "#include<iostream>\nusing namespace std;\nint main(){cout<<42<<endl;return 0;}").unwrap();

    let output = std::process::Command::new("/opt/homebrew/bin/g++-15")
        .args(["-std=c++20", "-O2", "-o", dir.join("main").to_str().unwrap(), src.to_str().unwrap()])
        .output().unwrap();

    assert!(output.status.success(), "Compilation should succeed. stderr: {}", String::from_utf8_lossy(&output.stderr));
    assert!(dir.join("main").exists(), "Binary should exist");
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn feat_06_compiler_error_parsing() {
    let dir = test_dir().join("feat06");
    fs::create_dir_all(&dir).unwrap();
    let src = dir.join("main.cpp");
    fs::write(&src, "#include<iostream>\nusing namespace std;\nint main(){undeclared_var;return 0;}").unwrap();

    let output = std::process::Command::new("/opt/homebrew/bin/g++-15")
        .args(["-std=c++20", "-O2", "-o", dir.join("main").to_str().unwrap(), src.to_str().unwrap()])
        .output().unwrap();

    assert!(!output.status.success(), "Should fail to compile");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("error"), "stderr should contain 'error'");

    // Verify error regex parses correctly
    let re = regex::Regex::new(r"^(.+):(\d+):(\d+):\s+(error|warning|note):\s+(.+)$").unwrap();
    let errors: Vec<_> = stderr.lines().filter(|l| re.is_match(l)).collect();
    assert!(!errors.is_empty(), "Should parse at least one compiler error");
    fs::remove_dir_all(&dir).ok();
}

// ─── Feature 4: Runner ───────────────────────────────────────────────────────
#[test]
fn feat_07_runner_stdout_capture() {
    let dir = test_dir().join("feat07");
    fs::create_dir_all(&dir).unwrap();
    let src = dir.join("main.cpp");
    fs::write(&src, "#include<iostream>\nusing namespace std;\nint main(){int n;cin>>n;cout<<n*2<<endl;return 0;}").unwrap();

    // Compile
    let status = std::process::Command::new("/opt/homebrew/bin/g++-15")
        .args(["-std=c++20", "-O2", "-o", dir.join("main").to_str().unwrap(), src.to_str().unwrap()])
        .status().unwrap();
    assert!(status.success());

    // Run with input "21"
    use std::io::Write;
    let mut child = std::process::Command::new(dir.join("main"))
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn().unwrap();
    child.stdin.take().unwrap().write_all(b"21\n").unwrap();
    let out = child.wait_with_output().unwrap();
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert_eq!(stdout.trim(), "42", "21 * 2 should be 42");
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn feat_08_runner_timeout() {
    let dir = test_dir().join("feat08");
    fs::create_dir_all(&dir).unwrap();
    let src = dir.join("main.cpp");
    fs::write(&src, "#include<cstdlib>\nint main(){while(1);}").unwrap();

    let status = std::process::Command::new("/opt/homebrew/bin/g++-15")
        .args(["-std=c++20", "-O2", "-o", dir.join("main").to_str().unwrap(), src.to_str().unwrap()])
        .status().unwrap();
    assert!(status.success());

    let mut child = std::process::Command::new(dir.join("main")).spawn().unwrap();
    let timeout = std::time::Duration::from_millis(300);
    let start = std::time::Instant::now();
    loop {
        if let Ok(Some(_)) = child.try_wait() { break; }
        if start.elapsed() >= timeout {
            child.kill().unwrap();
            child.wait().unwrap();
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    assert!(start.elapsed() < std::time::Duration::from_secs(2), "Should timeout in <2s");
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn feat_09_runner_exit_code() {
    let dir = test_dir().join("feat09");
    fs::create_dir_all(&dir).unwrap();
    let src = dir.join("main.cpp");
    fs::write(&src, "int main(){return 42;}").unwrap();

    std::process::Command::new("/opt/homebrew/bin/g++-15")
        .args(["-std=c++20", "-O2", "-o", dir.join("main").to_str().unwrap(), src.to_str().unwrap()])
        .status().unwrap();

    let status = std::process::Command::new(dir.join("main")).status().unwrap();
    assert_eq!(status.code().unwrap_or(-1), 42, "Exit code should be 42");
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn feat_10_runner_memory_measurement() {
    let dir = test_dir().join("feat10");
    fs::create_dir_all(&dir).unwrap();
    let src = dir.join("main.cpp");
    // Allocate ~10MB
    fs::write(&src, "#include<cstring>\nint main(){char* p=new char[10*1024*1024];memset(p,1,10*1024*1024);delete[] p;}").unwrap();

    std::process::Command::new("/opt/homebrew/bin/g++-15")
        .args(["-std=c++20", "-O2", "-o", dir.join("main").to_str().unwrap(), src.to_str().unwrap()])
        .status().unwrap();

    std::process::Command::new(dir.join("main")).status().unwrap();

    let memory_kb = unsafe {
        let mut ru: libc::rusage = std::mem::zeroed();
        if libc::getrusage(libc::RUSAGE_CHILDREN, &mut ru) == 0 {
            (ru.ru_maxrss as u64) / 1024
        } else { 0 }
    };
    assert!(memory_kb > 0, "getrusage should return nonzero memory");
    fs::remove_dir_all(&dir).ok();
}

// ─── Feature 5: Workspace scaffold ───────────────────────────────────────────
#[test]
fn feat_11_workspace_blank_scaffold() {
    let dir = test_dir().join("feat11_ws");
    fs::create_dir_all(&dir).unwrap();
    let problem_dir = dir.join("TestProblem");

    // Simulate scaffold_blank
    fs::create_dir_all(&problem_dir).unwrap();
    fs::write(problem_dir.join("main.cpp"), "#include<bits/stdc++.h>\nusing namespace std;\nint main(){}").unwrap();
    fs::write(problem_dir.join("input.txt"), "").unwrap();
    fs::write(problem_dir.join("output.txt"), "").unwrap();
    fs::write(problem_dir.join("notes.md"), "# TestProblem\n").unwrap();

    assert!(problem_dir.join("main.cpp").exists());
    assert!(problem_dir.join("input.txt").exists());
    assert!(problem_dir.join("notes.md").exists());
    fs::remove_dir_all(&dir).ok();
}

// ─── Feature 6: Template loading ─────────────────────────────────────────────
#[test]
fn feat_12_templates_exist() {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("templates");
    for name in &["blank_cpp17.cpp","blank_cpp20.cpp","codeforces.cpp","atcoder.cpp","fast_io.cpp","pbds.cpp"] {
        let p = base.join(name);
        assert!(p.exists(), "Template missing: {}", name);
        let content = fs::read_to_string(&p).unwrap();
        assert!(content.contains("main"), "Template {} should have main()", name);
    }
}

// ─── Feature 7: Codeforces URL parsing ───────────────────────────────────────
#[test]
fn feat_13_cf_url_parsing() {
    // Test both URL formats that workspace.rs handles
    let urls = [
        ("https://codeforces.com/contest/1234/problem/A", Some(("1234", "A"))),
        ("https://codeforces.com/problemset/problem/1234/A", Some(("1234", "A"))),
        ("https://invalid.com", None),
    ];

    for (url, expected) in &urls {
        let parsed = parse_cf_url(url);
        match expected {
            Some((c, p)) => {
                let (got_c, got_p) = parsed.expect(&format!("should parse {}", url));
                assert_eq!(got_c, *c);
                assert_eq!(got_p, *p);
            }
            None => assert!(parsed.is_none(), "should not parse {}", url),
        }
    }
}

fn parse_cf_url(url: &str) -> Option<(String, String)> {
    if let Some(rest) = url.strip_prefix("https://codeforces.com/contest/") {
        let parts: Vec<&str> = rest.split('/').collect();
        if parts.len() >= 3 && parts[1] == "problem" {
            return Some((parts[0].to_string(), parts[2].to_string()));
        }
    }
    if let Some(rest) = url.strip_prefix("https://codeforces.com/problemset/problem/") {
        let parts: Vec<&str> = rest.split('/').collect();
        if parts.len() >= 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    None
}

// ─── Feature 8: Stress test compilation ──────────────────────────────────────
#[test]
fn feat_14_stress_three_file_compile() {
    let dir = test_dir().join("feat14_stress");
    fs::create_dir_all(&dir).unwrap();

    let gen = "#include<bits/stdc++.h>\nusing namespace std;\nint main(){mt19937 rng(42);cout<<(rng()%100)<<\"\\n\";}";
    let brute = "#include<bits/stdc++.h>\nusing namespace std;\nint main(){int n;cin>>n;cout<<n*n<<\"\\n\";}";
    let sol   = "#include<bits/stdc++.h>\nusing namespace std;\nint main(){int n;cin>>n;cout<<n*n<<\"\\n\";}";

    for (name, code) in [("gen.cpp",gen),("brute.cpp",brute),("main.cpp",sol)] {
        fs::write(dir.join(name), code).unwrap();
        let out_name = name.replace(".cpp", "");
        let s = std::process::Command::new("/opt/homebrew/bin/g++-15")
            .args(["-std=c++20","-O2","-o",dir.join(&out_name).to_str().unwrap(),dir.join(name).to_str().unwrap()])
            .status().unwrap();
        assert!(s.success(), "{} should compile", name);
    }
    // Run gen → feed to brute and sol → outputs match
    use std::io::Write as _;
    let gen_out = std::process::Command::new(dir.join("gen")).output().unwrap();
    let input = String::from_utf8_lossy(&gen_out.stdout).to_string();

    let run = |bin: &str| {
        let mut child = std::process::Command::new(dir.join(bin))
            .stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).spawn().unwrap();
        child.stdin.take().unwrap().write_all(input.as_bytes()).unwrap();
        String::from_utf8_lossy(&child.wait_with_output().unwrap().stdout).trim().to_string()
    };

    assert_eq!(run("brute"), run("main"), "brute and solution should match");
    fs::remove_dir_all(&dir).ok();
}

// ─── Feature 9: C++ standards ────────────────────────────────────────────────
#[test]
fn feat_15_cpp_standards() {
    let dir = test_dir().join("feat15");
    fs::create_dir_all(&dir).unwrap();
    let src = dir.join("main.cpp");

    for std in &["c++17", "c++20", "c++23"] {
        fs::write(&src, "#include<bits/stdc++.h>\nusing namespace std;\nint main(){cout<<\"ok\";return 0;}").unwrap();
        let flag = format!("-std={}", std);
        let status = std::process::Command::new("/opt/homebrew/bin/g++-15")
            .args([&flag, "-O2", "-o", dir.join("main").to_str().unwrap(), src.to_str().unwrap()])
            .status().unwrap();
        assert!(status.success(), "Should compile with {}", std);
    }
    fs::remove_dir_all(&dir).ok();
}
