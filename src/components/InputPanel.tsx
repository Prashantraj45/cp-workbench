import { useState } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../lib/tauri';

export default function InputPanel() {
  const currentProblem = useStore((s) => s.currentProblem);
  const testCases = useStore((s) => s.testCases);
  const activeTestCaseId = useStore((s) => s.activeTestCaseId);
  const setActiveTestCaseId = useStore((s) => s.setActiveTestCaseId);
  const addTestCase = useStore((s) => s.addTestCase);
  const removeTestCase = useStore((s) => s.removeTestCase);
  const updateTestCase = useStore((s) => s.updateTestCase);

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const activeCase = testCases.find((tc) => tc.id === activeTestCaseId);

  const handleInputChange = async (value: string) => {
    if (!activeCase) return;
    const updated = { ...activeCase, input: value };
    updateTestCase(updated);
    try {
      await api.updateTestCase(activeCase.id, activeCase.name, value, activeCase.expected ?? undefined);
    } catch {
      // silent
    }
  };

  const handleAddTestCase = async () => {
    if (!currentProblem) return;
    const name = `Case ${testCases.length + 1}`;
    try {
      const tc = await api.createTestCase(currentProblem.id, name, '');
      addTestCase(tc);
      setActiveTestCaseId(tc.id);
    } catch {
      // ignore
    }
  };

  const handleDeleteTestCase = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (testCases.length <= 1) return; // keep at least one
    try {
      await api.deleteTestCase(id);
      removeTestCase(id);
      if (activeTestCaseId === id) {
        const remaining = testCases.filter((tc) => tc.id !== id);
        setActiveTestCaseId(remaining[0]?.id ?? null);
      }
    } catch {
      // ignore
    }
  };

  const startRenaming = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabId(id);
    setEditingName(currentName);
  };

  const commitRename = async (tc: typeof activeCase) => {
    if (!tc || !editingTabId) return;
    const trimmed = editingName.trim() || tc.name;
    const updated = { ...tc, name: trimmed };
    updateTestCase(updated);
    try {
      await api.updateTestCase(tc.id, trimmed, tc.input, tc.expected ?? undefined);
    } catch {
      // ignore
    }
    setEditingTabId(null);
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
          overflowX: 'auto',
          flexShrink: 0,
          height: 32,
        }}
      >
        {testCases.map((tc) => (
          <div
            key={tc.id}
            onClick={() => setActiveTestCaseId(tc.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 8px',
              height: '100%',
              cursor: 'pointer',
              borderRight: '1px solid var(--border)',
              background: tc.id === activeTestCaseId ? 'var(--bg-secondary)' : 'transparent',
              color: tc.id === activeTestCaseId ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: 12,
              whiteSpace: 'nowrap',
              gap: 6,
              flexShrink: 0,
            }}
          >
            {editingTabId === tc.id ? (
              <input
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => {
                  const found = testCases.find((t) => t.id === editingTabId);
                  commitRename(found);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const found = testCases.find((t) => t.id === editingTabId);
                    commitRename(found);
                  } else if (e.key === 'Escape') {
                    setEditingTabId(null);
                  }
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 80,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--accent)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  padding: '1px 4px',
                  outline: 'none',
                }}
              />
            ) : (
              <span onDoubleClick={(e) => startRenaming(tc.id, tc.name, e)}>{tc.name}</span>
            )}
            {testCases.length > 1 && (
              <span
                onClick={(e) => handleDeleteTestCase(tc.id, e)}
                style={{ color: 'var(--text-secondary)', fontSize: 10, lineHeight: 1, padding: '0 2px' }}
                title="Delete test case"
              >
                ×
              </span>
            )}
          </div>
        ))}

        {/* Add button */}
        <button
          onClick={handleAddTestCase}
          disabled={!currentProblem}
          title="New test case (Cmd+T)"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 16,
            cursor: 'pointer',
            padding: '0 10px',
            height: '100%',
            flexShrink: 0,
          }}
        >
          +
        </button>
      </div>

      {/* Input textarea */}
      <textarea
        value={activeCase?.input ?? ''}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={currentProblem ? 'Paste input here...' : 'Open a problem to start'}
        disabled={!activeCase}
        spellCheck={false}
        style={{
          flex: 1,
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: 'none',
          padding: 10,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          resize: 'none',
          outline: 'none',
          lineHeight: 1.5,
        }}
      />
    </div>
  );
}
