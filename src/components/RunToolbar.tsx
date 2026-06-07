import { useStore } from '../store/useStore';
import { api } from '../lib/tauri';
import type { RunResult } from '../lib/types';

const STATUS_MAP = {
  ready:         { label: 'Ready',          cls: 'badge-neutral' },
  compiling:     { label: 'Compiling…',     cls: 'badge-warning' },
  running:       { label: 'Running…',       cls: 'badge-warning' },
  ok:            { label: 'OK',             cls: 'badge-neutral' },
  success:       { label: 'AC',             cls: 'badge-ok'      },
  wa:            { label: 'WA',             cls: 'badge-error'   },
  compile_error: { label: 'Compile Error',  cls: 'badge-error'   },
  runtime_error: { label: 'Runtime Error',  cls: 'badge-error'   },
  tle:           { label: 'TLE',            cls: 'badge-error'   },
} as const;

type RunStatus = keyof typeof STATUS_MAP;

function tokensMatch(actual: string, expected: string): boolean {
  return actual.trim().split(/\s+/).join(' ') === expected.trim().split(/\s+/).join(' ');
}

function getStatus(
  isCompiling: boolean,
  isRunning: boolean,
  result: RunResult | null,
  expected: string | null | undefined,
): RunStatus {
  if (isCompiling) return 'compiling';
  if (isRunning)   return 'running';
  if (!result)     return 'ready';
  if (result.compile_errors.length > 0) return 'compile_error';
  if (result.timed_out) return 'tle';
  if (result.exit_code !== 0) return 'runtime_error';
  if (!expected) return 'ok';
  return tokensMatch(result.stdout, expected) ? 'success' : 'wa';
}

interface RunToolbarProps {
  onRun: () => void;
  onBuildOnly: () => void;
}

export default function RunToolbar({ onRun, onBuildOnly }: RunToolbarProps) {
  const isCompiling    = useStore(s => s.isCompiling);
  const isRunning      = useStore(s => s.isRunning);
  const lastResult     = useStore(s => s.lastRunResult);
  const currentProblem = useStore(s => s.currentProblem);
  const testCases      = useStore(s => s.testCases);
  const activeId       = useStore(s => s.activeTestCaseId);
  const isActive = isCompiling || isRunning;

  const activeCase = testCases.find(tc => tc.id === activeId);
  const status = getStatus(isCompiling, isRunning, lastResult, activeCase?.expected);
  const { label, cls } = STATUS_MAP[status];

  const handleStop = async () => {
    try { await api.stopProcess(); } catch { /* ignore */ }
  };

  return (
    <div className="run-toolbar">
      <button
        className="btn btn-run btn-sm"
        onClick={onRun}
        disabled={isActive || !currentProblem}
        title="Run (Cmd+Enter)"
      >
        ▶ Run
      </button>
      <button
        className="btn btn-ghost btn-sm"
        onClick={onBuildOnly}
        disabled={isActive || !currentProblem}
        title="Build only (compile without running)"
      >
        Build
      </button>
      {isActive && (
        <button className="btn btn-danger btn-sm" onClick={handleStop}>
          ■ Stop
        </button>
      )}
      <span className={`badge ${cls}`}>{label}</span>
      {lastResult && !isActive && (
        <span className="text-xs text-secondary" style={{ marginLeft: 4 }}>
          {lastResult.runtime_ms}ms · {(lastResult.memory_kb / 1024).toFixed(1)}MB
        </span>
      )}
    </div>
  );
}
