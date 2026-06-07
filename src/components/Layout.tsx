import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useStore } from '../store/useStore';
import { api } from '../lib/tauri';
import Editor from './Editor';
import InputPanel from './InputPanel';
import OutputPanel from './OutputPanel';
import StatusBar from './StatusBar';
import StressTest from './StressTest';

interface LayoutProps {
  isDark: boolean;
}

export default function Layout({ isDark }: LayoutProps) {
  const activeView = useStore((s) => s.activeView);

  const handleLayoutChange = async (sizes: number[]) => {
    try {
      await api.setSetting('panel_sizes', JSON.stringify(sizes));
    } catch {
      // ignore
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }}
    >
      <StatusBar isDark={isDark} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeView === 'stress' ? (
          <StressTest isDark={isDark} />
        ) : (
          <PanelGroup
            direction="horizontal"
            onLayout={handleLayoutChange}
            autoSaveId="cp-workbench-layout"
          >
            <Panel defaultSize={65} minSize={40} id="code-panel">
              <Editor isDark={isDark} />
            </Panel>
            <PanelResizeHandle
              style={{ width: 4, cursor: 'col-resize' }}
            />
            <Panel defaultSize={35} minSize={20} id="io-panel">
              <PanelGroup direction="vertical">
                <Panel defaultSize={50} minSize={20} id="input-panel">
                  <InputPanel />
                </Panel>
                <PanelResizeHandle
                  style={{ height: 4, cursor: 'row-resize' }}
                />
                <Panel defaultSize={50} minSize={20} id="output-panel">
                  <OutputPanel />
                </Panel>
              </PanelGroup>
            </Panel>
          </PanelGroup>
        )}
      </div>
    </div>
  );
}
