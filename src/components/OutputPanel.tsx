import { useState } from 'react';
import { useStore } from '../store/useStore';
import type { CompileError } from '../lib/types';

type OutputTab = 'stdout' | 'diff' | 'stats';

export default function OutputPanel() {
  const lastRunResult = useStore((s) => s.lastRunResult);
  const isCompiling = useStore((s) => s.isCompiling);
  const isRunning = useStore((s) => s.isRunning);
  const testCases = useStore((s) => s.testCases);
  const activeTestCaseId = useStore((s) => s.activeTestCaseId);
  const [activeTab, setActiveTab] = useState<OutputTab>('stdout');

  const activeCase = testCases.find((tc) => tc.id === activeTestCaseId);
  const hasErrors = (lastRunResult?.compile_errors?.length ?? 0) > 0;

  const tabs: OutputTab[] = ['stdout', 'diff', 'stats'];

  const renderContent = () => {
    if (isCompiling) {
      return <StatusMessage text="Compiling..." color="var(--text-secondary)" />;
    }
    if (isRunning) {
      return <StatusMessage text="Running..." color="var(--text-secondary)" />;
    }
    if (!lastRunResult) {
      return <StatusMessage text="Press Cmd+Enter to run" color="var(--text-secondary)" />;
    }

    if (hasErrors && activeTab !== 'stats') {
      return <CompileErrors errors={lastRunResult.compile_errors} />;
    }

    if (activeTab === 'stdout') {
      return (
        <div style={{ height: '100%', overflow: 'auto', padding: 10 }}>
          {lastRunResult.timed_out && (
            <div style={{ color: 'var(--warning)', marginBottom: 8, fontSize: 12 }}>
              ⏱ Time Limit Exceeded ({lastRunResult.runtime_ms}ms)
            </div>
          )}
          {lastRunResult.stderr && (
            <div style={{ color: 'var(--error)', marginBottom: 8, fontSize: 12, whiteSpace: 'pre-wrap' }}>
              {lastRunResult.stderr}
            </div>
          )}
          <pre style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-primary)' }}>
            {lastRunResult.stdout || <span style={{ color: 'var(--text-secondary)' }}>(no output)</span>}
          </pre>
        </div>
      );
    }

    if (activeTab === 'diff') {
      if (!activeCase?.expected) {
        return <StatusMessage text="No expected output set. Double-click tab to rename, set expected in test case." color="var(--text-secondary)" />;
      }
      return <DiffView expected={activeCase.expected} actual={lastRunResult.stdout} />;
    }

    if (activeTab === 'stats') {
      return (
        <div style={{ padding: 10, fontSize: 13 }}>
          <StatRow label="Status" value={getStatusText(lastRunResult)} color={getStatusColor(lastRunResult)} />
          <StatRow label="Exit code" value={String(lastRunResult.exit_code)} />
          <StatRow label="Runtime" value={`${lastRunResult.runtime_ms} ms`} />
          <StatRow label="Peak memory" value={`${(lastRunResult.memory_kb / 1024).toFixed(2)} MB`} />
          <StatRow label="Compile time" value={`${lastRunResult.compile_time_ms} ms`} />
          {lastRunResult.compile_errors.length > 0 && (
            <StatRow label="Compile errors" value={String(lastRunResult.compile_errors.length)} color="var(--error)" />
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)' }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-tertiary)',
          height: 32,
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: tab === activeTab ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === activeTab ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: 12,
              fontFamily: 'inherit',
              cursor: 'pointer',
              padding: '0 12px',
              height: '100%',
              textTransform: 'capitalize',
            }}
          >
            {tab}
            {tab === 'stdout' && hasErrors && (
              <span style={{ color: 'var(--error)', marginLeft: 4 }}>●</span>
            )}
          </button>
        ))}

        {/* Quick stats in tab bar */}
        {lastRunResult && !hasErrors && (
          <div style={{ marginLeft: 'auto', paddingRight: 8, fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 10 }}>
            <span style={{ color: getStatusColor(lastRunResult) }}>{getStatusText(lastRunResult)}</span>
            <span>{lastRunResult.runtime_ms}ms</span>
            <span>{(lastRunResult.memory_kb / 1024).toFixed(1)}MB</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg-primary)' }}>
        {renderContent()}
      </div>
    </div>
  );
}

function StatusMessage({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontSize: 13 }}>
      {text}
    </div>
  );
}

function CompileErrors({ errors }: { errors: CompileError[] }) {
  return (
    <div style={{ padding: 10, overflow: 'auto', height: '100%' }}>
      {errors.map((err, i) => (
        <div
          key={i}
          style={{
            marginBottom: 8,
            padding: '6px 8px',
            background: err.severity === 'error' ? 'rgba(244,71,71,0.1)' : 'rgba(206,145,120,0.1)',
            borderLeft: `3px solid ${err.severity === 'error' ? 'var(--error)' : 'var(--warning)'}`,
            borderRadius: '0 4px 4px 0',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>
            {err.file}:{err.line}:{err.col}
          </div>
          <div style={{ fontSize: 13, color: err.severity === 'error' ? 'var(--error)' : 'var(--warning)' }}>
            {err.message}
          </div>
        </div>
      ))}
    </div>
  );
}

function DiffView({ expected, actual }: { expected: string; actual: string }) {
  const expectedLines = expected.trim().split('\n');
  const actualLines = actual.trim().split('\n');
  const maxLen = Math.max(expectedLines.length, actualLines.length);
  const isMatch = expected.trim() === actual.trim();

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 8 }}>
      {isMatch ? (
        <div style={{ color: 'var(--success)', padding: 8, fontSize: 13 }}>✓ Output matches expected</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
            ✗ Mismatch — {maxLen} line(s)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--success)', marginBottom: 4 }}>Expected</div>
              {expectedLines.map((line, i) => (
                <pre key={i} style={{ fontSize: 12, margin: 0, padding: '1px 4px', background: line !== actualLines[i] ? 'rgba(78,201,176,0.15)' : 'transparent', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {line}
                </pre>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--error)', marginBottom: 4 }}>Actual</div>
              {actualLines.map((line, i) => (
                <pre key={i} style={{ fontSize: 12, margin: 0, padding: '1px 4px', background: line !== expectedLines[i] ? 'rgba(244,71,71,0.15)' : 'transparent', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {line}
                </pre>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
      <span style={{ color: 'var(--text-secondary)', width: 120, flexShrink: 0 }}>{label}</span>
      <span style={{ color: color ?? 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function getStatusText(r: { exit_code: number; timed_out: boolean; compile_errors: unknown[] }): string {
  if (r.compile_errors.length > 0) return 'Compile Error';
  if (r.timed_out) return 'TLE';
  if (r.exit_code !== 0) return `RE (exit ${r.exit_code})`;
  return 'AC';
}

function getStatusColor(r: { exit_code: number; timed_out: boolean; compile_errors: unknown[] }): string {
  if (r.compile_errors.length > 0 || r.exit_code !== 0 || r.timed_out) return 'var(--error)';
  return 'var(--success)';
}
