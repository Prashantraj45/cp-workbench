// Tauri v2: command args are deserialized with camelCase keys from JS → snake_case Rust params
import { invoke } from '@tauri-apps/api/core';
import type { Problem, TestCase, RunResult, StressResult } from './types';

export const api = {
  // Problems
  getProblems: () => invoke<Problem[]>('get_problems'),
  getProblem: (id: string) => invoke<Problem | null>('get_problem', { id }),
  createBlankProblem: (name: string, path: string, template: string, cppStandard: string) =>
    invoke<Problem>('create_blank_problem', { name, path, template, cppStandard }),
  scaffoldCfProblem: (url: string, baseDir: string, template: string) =>
    invoke<Problem>('scaffold_cf_problem', { url, baseDir, template }),
  setProblemStandard: (id: string, standard: string) =>
    invoke<void>('set_problem_standard', { id, standard }),
  openProblem: (id: string) => invoke<Problem>('open_problem', { id }),

  // Test cases
  getTestCases: (problemId: string) =>
    invoke<TestCase[]>('get_test_cases', { problemId }),
  createTestCase: (problemId: string, name: string, input: string, expected?: string) =>
    invoke<TestCase>('create_test_case', { problemId, name, input, expected }),
  updateTestCase: (id: string, name: string, input: string, expected?: string) =>
    invoke<void>('update_test_case', { id, name, input, expected }),
  deleteTestCase: (id: string) => invoke<void>('delete_test_case', { id }),

  // Run
  runSolution: (problemId: string, testCaseId: string) =>
    invoke<RunResult>('run_solution', { problemId, testCaseId }),
  saveCode: (problemId: string, code: string) =>
    invoke<void>('save_code', { problemId, code }),
  loadCode: (problemId: string) =>
    invoke<string>('load_code', { problemId }),

  // Stress
  runStressTest: (problemId: string, maxIterations: number, standard: string) =>
    invoke<StressResult>('run_stress_test', { problemId, maxIterations, standard }),
  saveStressFile: (problemId: string, filename: string, content: string) =>
    invoke<void>('save_stress_file', { problemId, filename, content }),

  // Settings
  getSetting: (key: string) => invoke<string | null>('get_setting', { key }),
  setSetting: (key: string, value: string) => invoke<void>('set_setting', { key, value }),

  // Templates
  getTemplate: (name: string) => invoke<string>('get_template', { name }),

  // AI stubs
  aiReview: (code: string) => invoke<string>('ai_review', { code }),
  aiComplexity: (code: string) => invoke<string>('ai_complexity', { code }),
  aiGenerateTests: (problemId: string) => invoke<string>('ai_generate_tests', { problemId }),
  aiOptimize: (code: string) => invoke<string>('ai_optimize', { code }),

  // Process control
  stopProcess: () => invoke<void>('stop_process'),
  deleteProblem: (id: string) => invoke<void>('delete_problem', { id }),
  renameProblem: (id: string, name: string) => invoke<void>('rename_problem', { id, name }),
};
