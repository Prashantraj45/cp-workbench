import { useState } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../lib/tauri';
import type { Problem } from '../lib/types';
import ConfirmDialog from './ConfirmDialog';

interface DataManagementProps {
  onClose: () => void;
  onOpenProblem: (id: string) => void;
}

export default function DataManagement({ onClose, onOpenProblem }: DataManagementProps) {
  const problems = useStore(s => s.problems);
  const setProblems = useStore(s => s.setProblems);
  const [deleteTarget, setDeleteTarget] = useState<Problem | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');

  const handleDelete = async (p: Problem) => {
    try {
      await api.deleteProblem(p.id);
      const updated = await api.getProblems();
      setProblems(updated);
      setDeleteTarget(null);
    } catch (e) { console.error(e); }
  };

  const handleRename = async (id: string) => {
    if (!renameName.trim()) { setRenaming(null); return; }
    try {
      await api.renameProblem(id, renameName.trim());
      const updated = await api.getProblems();
      setProblems(updated);
      setRenaming(null);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 640, maxHeight: '70vh' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          Data &amp; History
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div style={{ overflow: 'auto', maxHeight: 'calc(70vh - 60px)' }}>
          <div className="panel-header" style={{ borderRadius: 0 }}>
            {problems.length} problem{problems.length !== 1 ? 's' : ''}
          </div>
          {problems.map(p => (
            <div className="data-row" key={p.id}>
              <div className="flex-1 overflow-hidden">
                {renaming === p.id ? (
                  <input
                    className="input input-sm"
                    autoFocus
                    value={renameName}
                    onChange={e => setRenameName(e.target.value)}
                    onBlur={() => handleRename(p.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(p.id);
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  <div className="text-sm font-medium truncate">{p.name}</div>
                )}
                <div className="text-xs text-tertiary" style={{ marginTop: 2 }}>{p.path}</div>
              </div>
              <span className="badge badge-neutral text-xs">{p.cpp_standard}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => { onOpenProblem(p.id); onClose(); }}>Open</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setRenaming(p.id); setRenameName(p.name); }}>Rename</button>
              <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(p)}>Delete</button>
            </div>
          ))}
          {problems.length === 0 && (
            <div className="text-secondary text-sm" style={{ textAlign: 'center', padding: 32 }}>
              No problems saved yet.
            </div>
          )}
        </div>
      </div>
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Problem"
          message={`Delete "${deleteTarget.name}"? This removes all test cases and run history. Files on disk are NOT deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
