import { useEffect, useState } from 'react';
import { useTheme } from './hooks/useTheme';
import { useKeyBindings } from './hooks/useKeyBindings';
import { useStore } from './store/useStore';
import { api } from './lib/tauri';
import Layout from './components/Layout';
import WorkspaceGenerator from './components/WorkspaceGenerator';
import './index.css';

export default function App() {
  const { isDark } = useTheme();
  const setCurrentProblem = useStore((s) => s.setCurrentProblem);
  const setCode = useStore((s) => s.setCode);
  const setProblems = useStore((s) => s.setProblems);
  const setTestCases = useStore((s) => s.setTestCases);
  const setActiveTestCaseId = useStore((s) => s.setActiveTestCaseId);
  const currentProblem = useStore((s) => s.currentProblem);
  const setCompiling = useStore((s) => s.setCompiling);
  const setRunning = useStore((s) => s.setRunning);
  const setLastRunResult = useStore((s) => s.setLastRunResult);
  const activeTestCaseId = useStore((s) => s.activeTestCaseId);
  const setActiveView = useStore((s) => s.setActiveView);
  const activeView = useStore((s) => s.activeView);
  const toggleMinimap = useStore((s) => s.toggleMinimap);
  const testCases = useStore((s) => s.testCases);
  const addTestCase = useStore((s) => s.addTestCase);
  const problems = useStore((s) => s.problems);

  const [showProblemList, setShowProblemList] = useState(false);

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Session recovery: load last opened problem on startup
  useEffect(() => {
    const init = async () => {
      try {
        const probs = await api.getProblems();
        setProblems(probs);

        const lastId = await api.getSetting('last_opened_problem_id');
        const target = lastId
          ? probs.find((p) => p.id === lastId)
          : probs[0];

        if (target) {
          await loadProblem(target.id);
        }
      } catch {
        // fresh start
      }
    };
    init();
  }, []);

  const loadProblem = async (id: string) => {
    try {
      const problem = await api.openProblem(id);
      setCurrentProblem(problem);
      const [code, cases] = await Promise.all([
        api.loadCode(id),
        api.getTestCases(id),
      ]);
      setCode(code);
      setTestCases(cases);
      setActiveTestCaseId(cases[0]?.id ?? null);
      await api.setSetting('last_opened_problem_id', id);
    } catch {
      // ignore
    }
  };

  const handleRun = async () => {
    if (!currentProblem || !activeTestCaseId) return;
    setCompiling(true);
    setLastRunResult(null);
    try {
      const result = await api.runSolution(currentProblem.id, activeTestCaseId);
      setLastRunResult(result);
    } finally {
      setCompiling(false);
      setRunning(false);
    }
  };

  // Global key bindings
  useKeyBindings([
    {
      key: 's',
      metaKey: true,
      shiftKey: true,
      handler: () => setActiveView(activeView === 'stress' ? 'main' : 'stress'),
    },
    {
      key: 'm',
      metaKey: true,
      handler: () => toggleMinimap(),
    },
    {
      key: 't',
      metaKey: true,
      handler: () => {
        if (currentProblem) {
          const name = `Case ${testCases.length + 1}`;
          api.createTestCase(currentProblem.id, name, '').then((tc) => {
            addTestCase(tc);
            setActiveTestCaseId(tc.id);
          }).catch(() => {});
        }
      },
    },
    {
      key: 'o',
      metaKey: true,
      handler: () => setShowProblemList(true),
    },
  ]);

  return (
    <>
      <Layout isDark={isDark} onRun={handleRun} />
      <WorkspaceGenerator onOpen={loadProblem} />
      {showProblemList && (
        <div
          onClick={() => setShowProblemList(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: 80, zIndex: 300,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 8, width: 400, maxHeight: 400, overflow: 'auto',
            }}
          >
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)' }}>
              Open Problem (↑↓ to navigate, Enter to open)
            </div>
            {problems.map((p) => (
              <div
                key={p.id}
                onClick={() => { loadProblem(p.id); setShowProblemList(false); }}
                style={{
                  padding: '10px 14px', cursor: 'pointer', fontSize: 13,
                  borderBottom: '1px solid var(--border)',
                  background: p.id === currentProblem?.id ? 'var(--accent)' : 'transparent',
                  color: p.id === currentProblem?.id ? 'white' : 'var(--text-primary)',
                }}
                onMouseEnter={(e) => { if (p.id !== currentProblem?.id) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-tertiary)'; }}
                onMouseLeave={(e) => { if (p.id !== currentProblem?.id) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                <div>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{p.path}</div>
              </div>
            ))}
            {problems.length === 0 && (
              <div style={{ padding: 16, color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center' }}>
                No problems yet. Press Cmd+N to create one.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
