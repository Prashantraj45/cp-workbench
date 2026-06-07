import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useStore } from '../store/useStore';
import { api } from '../lib/tauri';
import Editor from './Editor';
import InputPanel from './InputPanel';
import OutputPanel from './OutputPanel';
import StatusBar from './StatusBar';
import StressTest from './StressTest';
import RunToolbar from './RunToolbar';
import ProblemSidebar from './ProblemSidebar';

interface LayoutProps {
  isDark: boolean;
  onRun: () => void;
  onBuildOnly: () => void;
  onSetTheme: (t: 'system' | 'dark' | 'light') => void;
  onOpenProblem: (id: string) => void;
  onNewProblem: () => void;
  onDataView: () => void;
}

export default function Layout({ isDark, onRun, onBuildOnly, onSetTheme, onOpenProblem, onNewProblem, onDataView }: LayoutProps) {
  const activeView = useStore((s) => s.activeView);

  const handleLayoutChange = async (sizes: number[]) => {
    try {
      await api.setSetting('panel_sizes', JSON.stringify(sizes));
    } catch { /* ignore */ }
  };

  return (
    <div className="flex-col h-full overflow-hidden" style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
      <StatusBar onSetTheme={onSetTheme} />
      <div className="flex flex-1 overflow-hidden">
        <ProblemSidebar
          onOpenProblem={onOpenProblem}
          onNewProblem={onNewProblem}
          onDataView={onDataView}
        />
        <div className="flex-col flex-1 overflow-hidden">
          <RunToolbar onRun={onRun} onBuildOnly={onBuildOnly} />
          <div className="flex-1 overflow-hidden">
            {activeView === 'stress' ? (
              <StressTest isDark={isDark} />
            ) : (
              <PanelGroup
                direction="horizontal"
                onLayout={handleLayoutChange}
                autoSaveId="cp-workbench-layout"
              >
                <Panel defaultSize={65} minSize={40} id="code-panel">
                  <Editor isDark={isDark} onRun={onRun} />
                </Panel>
                <PanelResizeHandle style={{ width: 4, cursor: 'col-resize' }} />
                <Panel defaultSize={35} minSize={20} id="io-panel">
                  <PanelGroup direction="vertical">
                    <Panel defaultSize={50} minSize={20} id="input-panel">
                      <InputPanel />
                    </Panel>
                    <PanelResizeHandle style={{ height: 4, cursor: 'row-resize' }} />
                    <Panel defaultSize={50} minSize={20} id="output-panel">
                      <OutputPanel />
                    </Panel>
                  </PanelGroup>
                </Panel>
              </PanelGroup>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
