import { useState } from 'react';
import { api } from '../lib/tauri';
import type { Tag } from '../lib/types';

const PRESET_COLORS = ['#58a6ff', '#3fb950', '#f78166', '#d2a8ff', '#ffa657', '#79c0ff'];

interface TagManagerProps {
  tags: Tag[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}

export default function TagManager({ tags, onClose, onChanged }: TagManagerProps) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.createTag(newName.trim(), newColor);
      setNewName('');
      await onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteTag(id);
      await onChanged();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, width: 400, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 500, fontSize: 14 }}>Manage Tags</span>
          <div style={{ flex: 1 }} />
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Create new tag */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Tag name"
            style={{
              flex: 1,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: 'inherit',
              padding: '6px 8px',
              borderRadius: 4,
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: c,
                  border: newColor === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
          <button
            className="btn btn-sm"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            style={{ background: 'var(--accent)', color: 'white', border: 'none' }}
          >
            Add
          </button>
        </div>

        {error && <div style={{ fontSize: 11, color: 'var(--error)', marginBottom: 8 }}>{error}</div>}

        {/* Tag list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {tags.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>
              No tags yet. Create one above.
            </div>
          )}
          {tags.map(tag => (
            <div
              key={tag.id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, flex: 1 }}>{tag.name}</span>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDelete(tag.id)}
                style={{ fontSize: 10 }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
