export interface Problem {
  id: string;
  name: string;
  path: string;
  url: string | null;
  time_limit: number | null;   // ms
  memory_limit: number | null; // MB
  cpp_standard: string;
  created_at: number;
  last_opened: number | null;
}

export interface TestCase {
  id: string;
  problem_id: string;
  name: string;
  input: string;
  expected: string | null;
  position: number;
  created_at: number;
}

export interface CompileError {
  file: string;
  line: number;
  col: number;
  message: string;
  severity: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  runtime_ms: number;
  memory_kb: number;
  compile_time_ms: number;
  compile_errors: CompileError[];
  timed_out: boolean;
}

export interface StressResult {
  iteration: number;
  mismatch_found: boolean;
  input: string;
  expected: string;
  actual: string;
}

export type CppStandard = 'c++17' | 'c++20' | 'c++23';

export type TemplateName = 'blank_cpp17' | 'blank_cpp20' | 'codeforces' | 'atcoder' | 'fast_io' | 'pbds';

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Group {
  id: string;
  name: string;
  created_at: number;
}

export interface ProblemWithMeta extends Problem {
  tags: Tag[];
  groupIds: string[];
  runCount: number;
}
