use crate::error::{AppError, AppResult};
use crate::models::{Problem, TestCase};
use crate::db;
use scraper::{Html, Selector};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Parse Codeforces problem URL → (contest_id, problem_id)
/// Supports:
///   https://codeforces.com/contest/1234/problem/A
///   https://codeforces.com/problemset/problem/1234/A
fn parse_cf_url(url: &str) -> Option<(String, String)> {
    // contest format
    if let Some(rest) = url.strip_prefix("https://codeforces.com/contest/") {
        let parts: Vec<&str> = rest.split('/').collect();
        if parts.len() >= 3 && parts[1] == "problem" {
            return Some((parts[0].to_string(), parts[2].to_string()));
        }
    }
    // problemset format
    if let Some(rest) = url.strip_prefix("https://codeforces.com/problemset/problem/") {
        let parts: Vec<&str> = rest.split('/').collect();
        if parts.len() >= 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    None
}

#[derive(Debug)]
pub struct CfProblem {
    pub contest_id: String,
    pub problem_id: String,
    pub title: String,
    pub time_limit_ms: Option<i64>,
    pub memory_limit_mb: Option<i64>,
    pub samples: Vec<(String, String)>, // (input, output)
    pub tags: Vec<String>,
}

fn extract_sample_text(el: scraper::ElementRef) -> String {
    // Try direct <pre> first (old CF format)
    let pre_sel = Selector::parse("pre").unwrap();
    if let Some(pre) = el.select(&pre_sel).next() {
        return pre.text().collect::<Vec<_>>().join("").trim().to_string();
    }
    // Fall back to .test-example-line spans (new CF format)
    let line_sel = Selector::parse(".test-example-line").unwrap();
    el.select(&line_sel)
        .map(|line| line.text().collect::<String>())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

pub fn fetch_cf_problem(url: &str) -> AppResult<CfProblem> {
    let (contest_id, problem_id) = parse_cf_url(url)
        .ok_or_else(|| AppError::Generic(format!("Invalid Codeforces URL: {}", url)))?;

    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; CP-Workbench/1.0)")
        .timeout(std::time::Duration::from_secs(15))
        .build()?;

    let response = client.get(url).send()?;
    if !response.status().is_success() {
        return Err(AppError::Generic(format!(
            "HTTP {} fetching problem", response.status()
        )));
    }
    let html = response.text()?;

    let document = Html::parse_document(&html);

    // Title: div.title inside .problem-statement header
    let title = document
        .select(&Selector::parse(".problem-statement .header .title").unwrap())
        .next()
        .or_else(|| document.select(&Selector::parse(".title").unwrap()).next())
        .map(|e| e.text().collect::<String>().trim().to_string())
        .unwrap_or_else(|| format!("{}{}", contest_id, problem_id));

    // Time limit: extract number from "2 seconds"
    let tl_sel = Selector::parse(".time-limit").unwrap();
    let time_limit_ms = document
        .select(&tl_sel)
        .next()
        .and_then(|e| {
            let text = e.text().collect::<String>();
            text.split_whitespace()
                .find(|s| s.parse::<f64>().is_ok())
                .and_then(|s| s.parse::<f64>().ok())
                .map(|secs| (secs * 1000.0) as i64)
        });

    // Memory limit: extract number from "256 megabytes"
    let ml_sel = Selector::parse(".memory-limit").unwrap();
    let memory_limit_mb = document
        .select(&ml_sel)
        .next()
        .and_then(|e| {
            let text = e.text().collect::<String>();
            text.split_whitespace()
                .find(|s| s.parse::<i64>().is_ok())
                .and_then(|s| s.parse::<i64>().ok())
        });

    // Sample test cases — handle both old <pre> and new .test-example-line formats
    let sample_sel = Selector::parse(".sample-test").unwrap();
    let input_block_sel = Selector::parse(".input").unwrap();
    let output_block_sel = Selector::parse(".output").unwrap();

    let mut samples = Vec::new();
    for sample in document.select(&sample_sel) {
        if let (Some(inp), Some(out)) = (
            sample.select(&input_block_sel).next(),
            sample.select(&output_block_sel).next(),
        ) {
            samples.push((extract_sample_text(inp), extract_sample_text(out)));
        }
    }

    // Scrape tags from .tag-box a
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
}

/// Scaffold a problem workspace on disk and insert into DB.
/// base_dir: parent directory (e.g. ~/Desktop/Problems)
pub fn scaffold_workspace(
    conn: &rusqlite::Connection,
    url: &str,
    base_dir: &Path,
    template_content: &str,
) -> AppResult<Problem> {
    let cf = fetch_cf_problem(url)?;
    let folder_name = format!("CF_{}_{}", cf.contest_id, cf.problem_id);
    let problem_path = base_dir.join(&folder_name);
    std::fs::create_dir_all(&problem_path)?;

    // Write main.cpp with template
    std::fs::write(problem_path.join("main.cpp"), template_content)?;

    // Write first sample to input.txt / output.txt
    let (first_input, first_output) = cf.samples.first()
        .map(|(i, o)| (i.as_str(), o.as_str()))
        .unwrap_or(("", ""));
    std::fs::write(problem_path.join("input.txt"), first_input)?;
    std::fs::write(problem_path.join("output.txt"), first_output)?;
    std::fs::write(problem_path.join("notes.md"), format!("# {}\n\n{}\n", cf.title, url))?;

    // Write metadata.json
    let metadata = serde_json::json!({
        "title": cf.title,
        "url": url,
        "time_limit_ms": cf.time_limit_ms,
        "memory_limit_mb": cf.memory_limit_mb,
        "contest_id": cf.contest_id,
        "problem_id": cf.problem_id,
    });
    std::fs::write(problem_path.join("metadata.json"), serde_json::to_string_pretty(&metadata)?)?;

    let problem = Problem {
        id: folder_name.clone(),
        name: cf.title.clone(),
        path: problem_path.to_str().unwrap().to_string(),
        url: Some(url.to_string()),
        time_limit: cf.time_limit_ms,
        memory_limit: cf.memory_limit_mb,
        cpp_standard: "c++20".to_string(),
        created_at: now_ms(),
        last_opened: Some(now_ms()),
    };

    db::insert_problem(conn, &problem)?;

    // Insert all sample test cases
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

    // Attach scraped tags (silent failure per spec)
    let _ = db::insert_scraped_tags(conn, &folder_name, &cf.tags);

    Ok(problem)
}

/// Scaffold a blank workspace (no URL)
pub fn scaffold_blank(
    conn: &rusqlite::Connection,
    name: &str,
    path: &Path,
    template_content: &str,
    cpp_standard: &str,
) -> AppResult<Problem> {
    std::fs::create_dir_all(path)?;
    std::fs::write(path.join("main.cpp"), template_content)?;
    std::fs::write(path.join("input.txt"), "")?;
    std::fs::write(path.join("output.txt"), "")?;
    std::fs::write(path.join("notes.md"), format!("# {}\n", name))?;

    let id = Uuid::new_v4().to_string();
    let problem = Problem {
        id: id.clone(),
        name: name.to_string(),
        path: path.to_str().unwrap().to_string(),
        url: None,
        time_limit: Some(2000),
        memory_limit: Some(256),
        cpp_standard: cpp_standard.to_string(),
        created_at: now_ms(),
        last_opened: Some(now_ms()),
    };

    db::insert_problem(conn, &problem)?;

    // Add a default empty test case
    let tc = TestCase {
        id: Uuid::new_v4().to_string(),
        problem_id: id,
        name: "Sample 1".to_string(),
        input: String::new(),
        expected: None,
        position: 0,
        created_at: now_ms(),
    };
    db::insert_test_case(conn, &tc)?;

    Ok(problem)
}

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
        .and_then(|s| s.split('?').next())
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

    let body = serde_json::json!({
        "query": format!(
            "{{ question(titleSlug: \"{}\") {{ title topicTags {{ name }} sampleTestCase }} }}",
            slug
        )
    });

    let resp = client
        .post("https://leetcode.com/graphql")
        .header("Referer", format!("https://leetcode.com/problems/{}/", slug))
        .json(&body)
        .send()?;

    if !resp.status().is_success() {
        return Err(AppError::Generic(format!("LC HTTP {}", resp.status())));
    }

    let json: serde_json::Value = resp.json()?;

    if json["errors"].is_array() {
        let msg = json["errors"][0]["message"].as_str().unwrap_or("GraphQL error");
        return Err(AppError::Generic(format!("LC GraphQL error: {}", msg)));
    }

    let q = &json["data"]["question"];

    if q.is_null() {
        return Err(AppError::Generic(format!("LC problem not found: {}", slug)));
    }

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

#[derive(Debug)]
struct CsesProblem {
    id: String,
    title: String,
}

fn parse_cses_url(url: &str) -> Option<String> {
    url.split("cses.fi/problemset/task/")
        .nth(1)
        .and_then(|s| s.split('/').next())
        .and_then(|s| s.split('?').next())
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
