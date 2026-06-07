import { invoke } from '@tauri-apps/api/core';
import type { Problem, TestCase, RunResult, StressResult } from './types';

export const api = {
  // Problems
  getProblems: () => invoke<Problem[]>('get_problems'),
  getProblem: (id: string) => invoke<Problem | null>('get_problem', { id }),
  createBlankProblem: (name: string, path: string, template: string, cppStandard: string) =>
    invoke<Problem>('create_blank_problem', { name, path, template, cpp_standard: cppStandard }),
  scaffoldCfProblem: (url: string, baseDir: string, template: string) =>
    invoke<Problem>('scaffold_cf_problem', { url, base_dir: baseDir, template }),
  setProblemStandard: (id: string, standard: string) =>
    invoke<void>('set_problem_standard', { id, standard }),
  openProblem: (id: string) => invoke<Problem>('open_problem', { id }),

  // Test cases
  getTestCases: (problemId: string) =>
    invoke<TestCase[]>('get_test_cases', { problem_id: problemId }),
  createTestCase: (problemId: string, name: string, input: string, expected?: string) =>
    invoke<TestCase>('create_test_case', { problem_id: problemId, name, input, expected }),
  updateTestCase: (id: string, name: string, input: string, expected?: string) =>
    invoke<void>('update_test_case', { id, name, input, expected }),
  deleteTestCase: (id: string) => invoke<void>('delete_test_case', { id }),

  // Run
  runSolution: (problemId: string, testCaseId: string) =>
    invoke<RunResult>('run_solution', { problem_id: problemId, test_case_id: testCaseId }),
  saveCode: (problemId: string, code: string) =>
    invoke<void>('save_code', { problem_id: problemId, code }),
  loadCode: (problemId: string) =>
    invoke<string>('load_code', { problem_id: problemId }),

  // Stress
  runStressTest: (problemId: string, maxIterations: number, standard: string) =>
    invoke<StressResult>('run_stress_test', { problem_id: problemId, max_iterations: maxIterations, standard }),

  // Settings
  getSetting: (key: string) => invoke<string | null>('get_setting', { key }),
  setSetting: (key: string, value: string) => invoke<void>('set_setting', { key, value }),

  // Templates
  getTemplate: (name: string) => invoke<string>('get_template', { name }),

  // AI stubs
  aiReview: (code: string) => invoke<string>('ai_review', { code }),
  aiComplexity: (code: string) => invoke<string>('ai_complexity', { code }),
  aiGenerateTests: (problemId: string) => invoke<string>('ai_generate_tests', { problem_id: problemId }),
  aiOptimize: (code: string) => invoke<string>('ai_optimize', { code }),
};
