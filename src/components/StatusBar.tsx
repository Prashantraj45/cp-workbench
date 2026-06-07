import { useStore } from '../store/useStore';
import { api } from '../lib/tauri';

const STANDARDS = ['c++17', 'c++20', 'c++23'];

interface StatusBarProps {
  isDark: boolean;
}

export default function StatusBar({ isDark: _isDark }: StatusBarProps) {
  const currentProblem = useStore((s) => s.currentProblem);
  const setCurrentProblem = useStore((s) => s.setCurrentProblem);
  const lastRunResult = useStore((s) => s.lastRunResult);
  const isCompiling = useStore((s) => s.isCompiling);
  const isRunning = useStore((s) => s.isRunning);
  const activeView = useStore((s) => s.activeView);
  const setActiveView = useStore((s) => s.setActiveView);
  const toggleMinimap = useStore((s) => s.toggleMinimap);

  const handleStandardChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!currentProblem) return;
    const standard = e.target.value;
    try {
      await api.setProblemStandard(currentProblem.id, standard);
      setCurrentProblem({ ...currentProblem, cpp_standard: standard });
    } catch {
      // ignore
    }
  };

  const statusText = isCompiling
    ? 'Compiling...'
    : isRunning
    ? 'Running...'
    : lastRunResult
    ? lastRunResult.compile_errors.length > 0
      ? `${lastRunResult.compile_errors.length} error(s)`
      : lastRunResult.timed_out
      ? 'TLE'
      : lastRunResult.exit_code !== 0
      ? `Exit ${lastRunResult.exit_code}`
      : 'OK'
    : 'Ready';

  const statusColor =
    lastRunResult && lastRunResult.compile_errors.length === 0 && !lastRunResult.timed_out && lastRunResult.exit_code === 0
      ? 'var(--success)'
      : lastRunResult
      ? 'var(--error)'
      : 'var(--text-secondary)';

  return (
    <div
      style={{
        height: 28,
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 16,
        fontSize: 12,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* Problem name */}
      <span style={{ fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {currentProblem?.name ?? 'No problem open'}
      </span>

      <span style={{ color: 'var(--border)' }}>|</span>

      {/* Compiler standard */}
      <select
        value={currentProblem?.cpp_standard ?? 'c++20'}
        onChange={handleStandardChange}
        disabled={!currentProblem}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-primary)',
          fontSize: 12,
          fontFamily: 'inherit',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {STANDARDS.map((s) => (
          <option key={s} value={s} style={{ background: 'var(--bg-secondary)' }}>
            {s}
          </option>
        ))}
      </select>

      <span style={{ color: 'var(--border)' }}>|</span>

      {/* Status */}
      <span style={{ color: statusColor }}>{statusText}</span>

      {/* Run stats */}
      {lastRunResult && lastRunResult.compile_errors.length === 0 && (
        <>
          <span style={{ color: 'var(--text-secondary)' }}>
            {lastRunResult.runtime_ms}ms
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            {(lastRunResult.memory_kb / 1024).toFixed(1)}MB
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            compile: {lastRunResult.compile_time_ms}ms
          </span>
        </>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Minimap toggle */}
      <button
        onClick={toggleMinimap}
        title="Toggle minimap (Cmd+M)"
        style={btnStyle}
      >
        Map
      </button>

      {/* Stress test toggle */}
      <button
        onClick={() => setActiveView(activeView === 'stress' ? 'main' : 'stress')}
        title="Toggle stress test (Cmd+Shift+S)"
        style={{
          ...btnStyle,
          color: activeView === 'stress' ? 'var(--accent)' : undefined,
        }}
      >
        Stress
      </button>

      {/* g++ indicator */}
      <span style={{ color: 'var(--text-secondary)' }}>g++-15</span>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-secondary)',
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
  padding: '2px 6px',
  borderRadius: 3,
};
