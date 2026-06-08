import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../lib/tauri';
import type { TemplateName } from '../lib/types';

interface WorkspaceGeneratorProps {
  onOpen: (id: string) => void;
}

const TEMPLATES: { value: TemplateName; label: string }[] = [
  { value: 'blank_cpp17', label: 'Blank C++17' },
  { value: 'blank_cpp20', label: 'Blank C++20' },
  { value: 'codeforces', label: 'Codeforces' },
  { value: 'atcoder', label: 'AtCoder' },
  { value: 'fast_io', label: 'Fast I/O' },
  { value: 'pbds', label: 'PBDS' },
];

const STANDARDS = ['c++17', 'c++20', 'c++23'];

const DEFAULT_BASE_DIR = '/Users/prashantraj/Desktop/Problems';

export default function WorkspaceGenerator({ onOpen }: WorkspaceGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'cf' | 'blank'>('cf');
  const [cfUrl, setCfUrl] = useState('');
  const [problemName, setProblemName] = useState('');
  const [baseDir, setBaseDir] = useState(DEFAULT_BASE_DIR);
  const [template, setTemplate] = useState<TemplateName>('codeforces');
  const [standard, setStandard] = useState('c++20');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setProblems = useStore((s) => s.setProblems);

  // Load saved base_dir from settings
  useEffect(() => {
    api.getSetting('base_dir').then((v) => {
      if (v) setBaseDir(v);
    }).catch(() => {
      // keep default
    });
  }, []);

  // Keyboard shortcuts: Cmd+N to open, Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const openHandler = () => setOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('cp:new-problem', openHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('cp:new-problem', openHandler);
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const tmplContent = await api.getTemplate(template);
      const dir = baseDir.trim() || DEFAULT_BASE_DIR;

      let problemId: string;

      if (mode === 'cf') {
        const url = cfUrl.trim();
        if (url.includes('codeforces.com')) {
          await api.setSetting('base_dir', dir);
          const problem = await api.scaffoldCfProblem(url, dir, tmplContent);
          problemId = problem.id;
        } else if (url.includes('leetcode.com/problems/')) {
          await api.setSetting('base_dir', dir);
          const problem = await api.scaffoldLcProblem(url, dir, tmplContent);
          problemId = problem.id;
        } else if (url.includes('cses.fi/problemset/task/')) {
          await api.setSetting('base_dir', dir);
          const problem = await api.scaffoldCsesProblem(url, dir, tmplContent);
          problemId = problem.id;
        } else {
          throw new Error('Unsupported URL — paste a Codeforces, LeetCode, or CSES problem URL');
        }
      } else {
        if (!problemName.trim()) {
          throw new Error('Problem name is required');
        }
        const slug = problemName.trim().replace(/\s+/g, '_');
        const problemDir = `${dir}/${slug}`;
        await api.setSetting('base_dir', dir);
        const problem = await api.createBlankProblem(
          problemName.trim(),
          problemDir,
          tmplContent,
          standard,
        );
        problemId = problem.id;
      }

      const problems = await api.getProblems();
      setProblems(problems);
      onOpen(problemId);
      setOpen(false);
      setCfUrl('');
      setProblemName('');
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [loading, mode, cfUrl, problemName, baseDir, template, standard, onOpen, setProblems]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="New problem (Cmd+N)"
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'var(--accent)',
          border: 'none',
          color: 'white',
          fontSize: 22,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          zIndex: 100,
        }}
      >
        +
      </button>
    );
  }

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 24,
          width: 480,
          maxWidth: '90vw',
        }}
      >
        <h2 style={{ fontSize: 16, marginBottom: 16, fontWeight: 500, margin: '0 0 16px 0' }}>
          New Problem
        </h2>

        {/* Mode tabs */}
        <div
          style={{
            display: 'flex',
            gap: 0,
            marginBottom: 16,
            borderRadius: 6,
            overflow: 'hidden',
            border: '1px solid var(--border)',
          }}
        >
          {(['cf', 'blank'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: '7px 0',
                background: mode === m ? 'var(--accent)' : 'transparent',
                border: 'none',
                color: mode === m ? 'white' : 'var(--text-secondary)',
                fontSize: 12,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {m === 'cf' ? 'Problem URL' : 'Blank Problem'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'cf' ? (
            <Field label="Problem URL">
              <input
                autoFocus
                value={cfUrl}
                onChange={(e) => setCfUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="codeforces.com/contest/... · leetcode.com/problems/... · cses.fi/problemset/task/..."
                style={inputStyle}
              />
            </Field>
          ) : (
            <>
              <Field label="Problem name">
                <input
                  autoFocus
                  value={problemName}
                  onChange={(e) => setProblemName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="e.g. Two Sum"
                  style={inputStyle}
                />
              </Field>
              <Field label="C++ Standard">
                <select
                  value={standard}
                  onChange={(e) => setStandard(e.target.value)}
                  style={inputStyle}
                >
                  {STANDARDS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          <Field label="Save to directory">
            <input
              value={baseDir}
              onChange={(e) => setBaseDir(e.target.value)}
              placeholder="/Users/you/Desktop/Problems"
              style={inputStyle}
            />
          </Field>

          <Field label="Template">
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as TemplateName)}
              style={inputStyle}
            >
              {TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--error)' }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setOpen(false)}
            style={{ ...btnStyle, background: 'var(--bg-tertiary)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              ...btnStyle,
              background: 'var(--accent)',
              color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  fontSize: 13,
  fontFamily: 'inherit',
  padding: '7px 10px',
  borderRadius: 4,
  outline: 'none',
  boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = {
  padding: '7px 16px',
  border: 'none',
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
  color: 'var(--text-primary)',
};
