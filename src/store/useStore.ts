import { create } from 'zustand';
import type { Problem, TestCase, RunResult, StressResult } from '../lib/types';

interface AppState {
  // Current problem
  currentProblem: Problem | null;
  problems: Problem[];

  // Editor state
  code: string;
  fontSize: number;
  showMinimap: boolean;

  // Test cases
  testCases: TestCase[];
  activeTestCaseId: string | null;

  // Run state
  isCompiling: boolean;
  isRunning: boolean;
  lastRunResult: RunResult | null;

  // Layout
  activeView: 'main' | 'stress';

  // Stress test state
  stressRunning: boolean;
  stressResult: StressResult | null;

  // Actions
  setCurrentProblem: (problem: Problem | null) => void;
  setProblems: (problems: Problem[]) => void;
  setCode: (code: string) => void;
  setFontSize: (size: number) => void;
  toggleMinimap: () => void;
  setTestCases: (cases: TestCase[]) => void;
  setActiveTestCaseId: (id: string | null) => void;
  setCompiling: (v: boolean) => void;
  setRunning: (v: boolean) => void;
  setLastRunResult: (result: RunResult | null) => void;
  setActiveView: (view: 'main' | 'stress') => void;
  setStressRunning: (v: boolean) => void;
  setStressResult: (result: StressResult | null) => void;
  updateTestCase: (updated: TestCase) => void;
  removeTestCase: (id: string) => void;
  addTestCase: (tc: TestCase) => void;
}

export const useStore = create<AppState>((set) => ({
  currentProblem: null,
  problems: [],
  code: '',
  fontSize: 14,
  showMinimap: false,
  testCases: [],
  activeTestCaseId: null,
  isCompiling: false,
  isRunning: false,
  lastRunResult: null,
  activeView: 'main',
  stressRunning: false,
  stressResult: null,

  setCurrentProblem: (problem) => set({ currentProblem: problem }),
  setProblems: (problems) => set({ problems }),
  setCode: (code) => set({ code }),
  setFontSize: (fontSize) => set({ fontSize }),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  setTestCases: (testCases) => set({ testCases }),
  setActiveTestCaseId: (activeTestCaseId) => set({ activeTestCaseId }),
  setCompiling: (isCompiling) => set({ isCompiling }),
  setRunning: (isRunning) => set({ isRunning }),
  setLastRunResult: (lastRunResult) => set({ lastRunResult }),
  setActiveView: (activeView) => set({ activeView }),
  setStressRunning: (stressRunning) => set({ stressRunning }),
  setStressResult: (stressResult) => set({ stressResult }),
  updateTestCase: (updated) =>
    set((s) => ({ testCases: s.testCases.map((tc) => (tc.id === updated.id ? updated : tc)) })),
  removeTestCase: (id) =>
    set((s) => ({ testCases: s.testCases.filter((tc) => tc.id !== id) })),
  addTestCase: (tc) => set((s) => ({ testCases: [...s.testCases, tc] })),
}));
