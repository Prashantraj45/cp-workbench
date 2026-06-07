import MonacoEditor from '@monaco-editor/react';
import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../lib/tauri';

interface EditorProps {
  isDark: boolean;
}

export default function Editor({ isDark }: EditorProps) {
  const code = useStore((s) => s.code);
  const setCode = useStore((s) => s.setCode);
  const fontSize = useStore((s) => s.fontSize);
  const showMinimap = useStore((s) => s.showMinimap);
  const currentProblem = useStore((s) => s.currentProblem);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (value: string | undefined) => {
      const v = value ?? '';
      setCode(v);

      // Autosave debounce 1s
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      if (currentProblem) {
        autosaveTimer.current = setTimeout(async () => {
          try {
            await api.saveCode(currentProblem.id, v);
          } catch {
            // silent
          }
        }, 1000);
      }
    },
    [setCode, currentProblem]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <MonacoEditor
        height="100%"
        language="cpp"
        value={code}
        onChange={handleChange}
        theme={isDark ? 'vs-dark' : 'vs'}
        options={{
          fontSize,
          fontFamily: "'JetBrains Mono', monospace",
          fontLigatures: false,
          minimap: { enabled: showMinimap },
          bracketPairColorization: { enabled: true },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          insertSpaces: true,
          wordWrap: 'off',
          renderLineHighlight: 'all',
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          formatOnPaste: false,
          formatOnType: false,
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
          padding: { top: 8, bottom: 8 },
        }}
      />
    </div>
  );
}
