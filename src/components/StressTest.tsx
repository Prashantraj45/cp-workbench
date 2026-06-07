import { useState, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useStore } from '../store/useStore';
import { api } from '../lib/tauri';
import type { StressResult } from '../lib/types';

interface StressTestProps {
  isDark: boolean;
}

const DEFAULT_GEN = `#include <bits/stdc++.h>
using namespace std;
int main() {
    mt19937 rng(chrono::steady_clock::now().time_since_epoch().count());
    int n = rng() % 10 + 1;
    cout << n << "\\n";
    for (int i = 0; i < n; i++)
        cout << (int)(rng() % 200 - 100) << " \\n"[i==n-1];
}`;

const DEFAULT_BRUTE = `#include <bits/stdc++.h>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    // Brute force solution here
    return 0;
}`;

const EDITOR_OPTS = {
  fontSize: 13,
  fontFamily: "'JetBrains Mono', monospace",
  fontLigatures: false,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  padding: { top: 6, bottom: 6 },
};

const LABEL_STYLE: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 11,
  color: 'var(--text-secondary)',
  background: 'var(--bg-tertiary)',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
  userSelect: 'none',
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
};

export default function StressTest({ isDark }: StressTestProps) {
  const currentProblem = useStore((s) => s.currentProblem);
  const stressRunning = useStore((s) => s.stressRunning);
  const stressResult = useStore((s) => s.stressResult);
  const setStressRunning = useStore((s) => s.setStressRunning);
  const setStressResult = useStore((s) => s.setStressResult);

  const [genCode, setGenCode] = useState(DEFAULT_GEN);
  const [bruteCode, setBruteCode] = useState(DEFAULT_BRUTE);
  const [maxIterations, setMaxIterations] = useState(100);
  const [runError, setRunError] = useState<string | null>(null);

  const handleRun = useCallback(async () => {
    if (!currentProblem || stressRunning) return;
    setRunError(null);
    setStressResult(null);
    setStressRunning(true);
    try {
      await api.saveStressFile(currentProblem.id, 'gen.cpp', genCode);
      await api.saveStressFile(currentProblem.id, 'brute.cpp', bruteCode);
      const result = await api.runStressTest(
        currentProblem.id,
        maxIterations,
        currentProblem.cpp_standard,
      );
      setStressResult(result);
    } catch (e) {
      setRunError(String(e));
    } finally {
      setStressRunning(false);
    }
  }, [currentProblem, stressRunning, genCode, bruteCode, maxIterations, setStressRunning, setStressResult]);

  const theme = isDark ? 'vs-dark' : 'vs';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Controls bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 12px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          height: 36,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>Stress Test</span>
        <span style={{ color: 'var(--border)' }}>|</span>
        <label
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          Iterations:
          <input
            type="number"
            value={maxIterations}
            min={1}
            max={10000}
            onChange={(e) => setMaxIterations(Math.max(1, parseInt(e.target.value) || 1))}
            style={{
              width: 70,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: 'inherit',
              padding: '2px 6px',
              borderRadius: 3,
              outline: 'none',
            }}
          />
        </label>
        <button
          onClick={handleRun}
          disabled={!currentProblem || stressRunning}
          style={{
            background: stressRunning ? 'var(--bg-tertiary)' : 'var(--run-btn)',
            color: 'var(--text-primary)',
            border: 'none',
            borderRadius: 4,
            padding: '4px 14px',
            fontSize: 12,
            fontFamily: 'inherit',
            cursor: stressRunning || !currentProblem ? 'not-allowed' : 'pointer',
          }}
        >
          {stressRunning ? 'Running...' : '▶ Run Stress'}
        </button>
        {stressResult && (
          <span
            style={{
              fontSize: 12,
              color: stressResult.mismatch_found ? 'var(--error)' : 'var(--success)',
            }}
          >
            {stressResult.mismatch_found
              ? `✗ Mismatch found at iteration ${stressResult.iteration}`
              : `✓ No mismatch in ${stressResult.iteration} iterations`}
          </span>
        )}
        {runError && (
          <span
            style={{
              fontSize: 12,
              color: 'var(--error)',
              maxWidth: 300,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {runError}
          </span>
        )}
      </div>

      {/* Three column layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Generator */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--border)',
          }}
        >
          <div style={LABEL_STYLE}>Generator — gen.cpp</div>
          <div style={{ flex: 1 }}>
            <MonacoEditor
              height="100%"
              language="cpp"
              value={genCode}
              onChange={(v) => setGenCode(v ?? '')}
              theme={theme}
              options={EDITOR_OPTS}
            />
          </div>
        </div>

        {/* Brute Force */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--border)',
          }}
        >
          <div style={LABEL_STYLE}>Brute Force — brute.cpp</div>
          <div style={{ flex: 1 }}>
            <MonacoEditor
              height="100%"
              language="cpp"
              value={bruteCode}
              onChange={(v) => setBruteCode(v ?? '')}
              theme={theme}
              options={EDITOR_OPTS}
            />
          </div>
        </div>

        {/* Mismatch Result */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={LABEL_STYLE}>Mismatch Result</div>
          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            {stressResult?.mismatch_found ? (
              <MismatchView result={stressResult} />
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                }}
              >
                {stressRunning ? 'Testing...' : 'Mismatch will appear here'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MismatchView({ result }: { result: StressResult }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Input (iteration {result.iteration})
        </div>
        <pre
          style={{
            background: 'var(--bg-secondary)',
            padding: 8,
            borderRadius: 4,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            border: '1px solid var(--border)',
            margin: 0,
          }}
        >
          {result.input || '(empty)'}
        </pre>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--success)',
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Expected (brute)
          </div>
          <pre
            style={{
              background: 'rgba(78,201,176,0.1)',
              border: '1px solid var(--success)',
              padding: 8,
              borderRadius: 4,
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}
          >
            {result.expected || '(empty)'}
          </pre>
        </div>
        <div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--error)',
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Actual (solution)
          </div>
          <pre
            style={{
              background: 'rgba(244,71,71,0.1)',
              border: '1px solid var(--error)',
              padding: 8,
              borderRadius: 4,
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}
          >
            {result.actual || '(empty)'}
          </pre>
        </div>
      </div>
    </div>
  );
}
