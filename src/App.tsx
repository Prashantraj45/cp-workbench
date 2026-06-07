import { useEffect, useState } from 'react';
import { useTheme } from './hooks/useTheme';
import { useKeyBindings } from './hooks/useKeyBindings';
import { useStore } from './store/useStore';
import { api } from './lib/tauri';
import Layout from './components/Layout';
import WorkspaceGenerator from './components/WorkspaceGenerator';
import DataManagement from './components/DataManagement';
import './index.css';

export default function App() {
  const { isDark: systemDark } = useTheme();
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
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

  const [showDataView, setShowDataView] = useState(false);

  // Compute effective dark mode from theme setting
  const isDark = theme === 'system' ? systemDark : theme === 'dark';

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Session recovery on startup
  useEffect(() => {
    const init = async () => {
      try {
        // Restore saved theme
        const savedTheme = await api.getSetting('theme').catch(() => null);
        if (savedTheme === 'dark' || savedTheme === 'light' || savedTheme === 'system') {
          setTheme(savedTheme);
        }

        const probs = await api.getProblems();
        setProblems(probs);

        const lastId = await api.getSetting('last_opened_problem_id').catch(() => null);
        const target = lastId ? probs.find((p) => p.id === lastId) : probs[0];
        if (target) await loadProblem(target.id);
      } catch { /* fresh start */ }
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
    } catch { /* ignore */ }
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

  const handleBuildOnly = async () => {
    if (!currentProblem) return;
    setCompiling(true);
    setLastRunResult(null);
    try {
      // Run with empty input and a very short timeout — we only care about compile result
      const result = await api.runSolution(currentProblem.id, activeTestCaseId ?? '');
      setLastRunResult(result);
    } finally {
      setCompiling(false);
      setRunning(false);
    }
  };

  const handleSetTheme = async (t: 'system' | 'dark' | 'light') => {
    setTheme(t);
    try { await api.setSetting('theme', t); } catch { /* ignore */ }
  };

  // Global key bindings (Cmd+Enter is handled by Monaco addAction in Editor)
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
      key: 'n',
      metaKey: true,
      handler: () => {
        // WorkspaceGenerator listens on its own via Cmd+N
      },
    },
  ]);

  return (
    <>
      <Layout
        isDark={isDark}
        onRun={handleRun}
        onBuildOnly={handleBuildOnly}
        onSetTheme={handleSetTheme}
        onOpenProblem={(id) => loadProblem(id)}
        onNewProblem={() => {
          // Trigger WorkspaceGenerator via custom event
          window.dispatchEvent(new CustomEvent('cp:new-problem'));
        }}
        onDataView={() => setShowDataView(true)}
      />
      <WorkspaceGenerator onOpen={loadProblem} />
      {showDataView && (
        <DataManagement
          onClose={() => setShowDataView(false)}
          onOpenProblem={(id) => { loadProblem(id); setShowDataView(false); }}
        />
      )}
    </>
  );
}
