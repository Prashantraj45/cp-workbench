use crate::models::Problem;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiResult {
    pub content: String,
    pub tokens_used: u32,
}

pub trait AiProvider: Send + Sync {
    fn review(&self, code: &str) -> AiResult;
    fn analyze_complexity(&self, code: &str) -> AiResult;
    fn generate_tests(&self, problem: &Problem) -> AiResult;
    fn suggest_optimizations(&self, code: &str) -> AiResult;
}

pub struct NoOpProvider;

impl AiProvider for NoOpProvider {
    fn review(&self, _code: &str) -> AiResult {
        AiResult { content: String::new(), tokens_used: 0 }
    }
    fn analyze_complexity(&self, _code: &str) -> AiResult {
        AiResult { content: String::new(), tokens_used: 0 }
    }
    fn generate_tests(&self, _problem: &Problem) -> AiResult {
        AiResult { content: String::new(), tokens_used: 0 }
    }
    fn suggest_optimizations(&self, _code: &str) -> AiResult {
        AiResult { content: String::new(), tokens_used: 0 }
    }
}
