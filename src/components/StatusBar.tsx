import { useStore } from '../store/useStore';
import { api } from '../lib/tauri';

const STANDARDS = ['c++17', 'c++20', 'c++23'];

interface StatusBarProps {
  onSetTheme: (t: 'system' | 'dark' | 'light') => void;
}

export default function StatusBar({ onSetTheme }: StatusBarProps) {
  const currentProblem = useStore((s) => s.currentProblem);
  const setCurrentProblem = useStore((s) => s.setCurrentProblem);
  const lastRunResult = useStore((s) => s.lastRunResult);
  const isCompiling = useStore((s) => s.isCompiling);
  const isRunning = useStore((s) => s.isRunning);
  const activeView = useStore((s) => s.activeView);
  const setActiveView = useStore((s) => s.setActiveView);
  const toggleMinimap = useStore((s) => s.toggleMinimap);
  const theme = useStore((s) => s.theme);
  const testCases = useStore((s) => s.testCases);
  const activeId = useStore((s) => s.activeTestCaseId);

  const handleStandardChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!currentProblem) return;
    const standard = e.target.value;
    try {
      await api.setProblemStandard(currentProblem.id, standard);
      setCurrentProblem({ ...currentProblem, cpp_standard: standard });
    } catch { /* ignore */ }
  };

  function tokensMatch(actual: string, expected: string): boolean {
    return actual.trim().split(/\s+/).join(' ') === expected.trim().split(/\s+/).join(' ');
  }

  const activeCase = testCases.find(tc => tc.id === activeId);

  const cleanExit = lastRunResult
    && lastRunResult.compile_errors.length === 0
    && !lastRunResult.timed_out
    && lastRunResult.exit_code === 0;

  const verdictText = cleanExit
    ? (!activeCase?.expected
        ? 'OK'
        : tokensMatch(lastRunResult!.stdout ?? '', activeCase.expected) ? 'AC' : 'WA')
    : null;

  const statusBadgeClass = isCompiling || isRunning
    ? 'badge badge-warning'
    : lastRunResult
    ? (cleanExit
        ? (verdictText === 'AC' ? 'badge badge-ok' : verdictText === 'WA' ? 'badge badge-error' : 'badge badge-neutral')
        : 'badge badge-error')
    : 'badge badge-neutral';

  const statusText = isCompiling
    ? 'Compiling…'
    : isRunning
    ? 'Running…'
    : lastRunResult
    ? lastRunResult.compile_errors.length > 0
      ? `${lastRunResult.compile_errors.length} error(s)`
      : lastRunResult.timed_out
      ? 'TLE'
      : lastRunResult.exit_code !== 0
      ? `Exit ${lastRunResult.exit_code}`
      : (verdictText ?? 'OK')
    : 'Ready';

  return (
    <div className="statusbar">
      <span className="font-medium truncate" style={{ maxWidth: 200 }}>
        {currentProblem?.name ?? 'No problem open'}
      </span>

      <div className="statusbar-divider" />

      <select
        value={currentProblem?.cpp_standard ?? 'c++20'}
        onChange={handleStandardChange}
        disabled={!currentProblem}
        className="text-xs text-secondary"
        style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: 'inherit', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}
      >
        {STANDARDS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <div className="statusbar-divider" />

      <span className={statusBadgeClass}>{statusText}</span>

      {lastRunResult && !isCompiling && !isRunning && lastRunResult.compile_errors.length === 0 && (
        <>
          <span className="text-xs text-secondary">{lastRunResult.runtime_ms}ms</span>
          <span className="text-xs text-secondary">{(lastRunResult.memory_kb / 1024).toFixed(1)}MB</span>
          <span className="text-xs text-secondary">compile: {lastRunResult.compile_time_ms}ms</span>
        </>
      )}

      <div style={{ flex: 1 }} />

      <button className="btn-icon" onClick={toggleMinimap} title="Toggle minimap (Cmd+M)" style={{ fontSize: 11 }}>
        Map
      </button>

      <button
        className="btn-icon"
        onClick={() => setActiveView(activeView === 'stress' ? 'main' : 'stress')}
        title="Toggle stress test (Cmd+Shift+S)"
        style={{ fontSize: 11, color: activeView === 'stress' ? 'var(--text-accent)' : undefined }}
      >
        Stress
      </button>

      <div className="statusbar-divider" />

      <select
        value={theme}
        onChange={e => onSetTheme(e.target.value as 'system' | 'dark' | 'light')}
        className="text-xs"
        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}
      >
        <option value="system">System</option>
        <option value="dark">Dark</option>
        <option value="light">Light</option>
      </select>

      <div className="statusbar-divider" />

      <span className="text-xs text-tertiary">g++-15</span>
    </div>
  );
}
