import { useEffect } from 'react';
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

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Session recovery: load last opened problem on startup
  useEffect(() => {
    const init = async () => {
      try {
        const problems = await api.getProblems();
        setProblems(problems);

        const lastId = await api.getSetting('last_opened_problem_id');
        const target = lastId
          ? problems.find((p) => p.id === lastId)
          : problems[0];

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
      key: 'Enter',
      metaKey: true,
      handler: () => handleRun(),
    },
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
  ]);

  return (
    <>
      <Layout isDark={isDark} />
      <WorkspaceGenerator onOpen={loadProblem} />
    </>
  );
}
