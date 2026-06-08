import { useState } from 'react';
import { api } from '../lib/tauri';
import type { Group } from '../lib/types';

interface GroupManagerProps {
  problemId: string;
  currentGroupIds: string[];
  groups: Group[];
  onGroupsChanged: () => Promise<void>;
}

export default function GroupManager({ problemId, currentGroupIds, groups, onGroupsChanged }: GroupManagerProps) {
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMember = (groupId: string) => currentGroupIds.includes(groupId);

  const toggleMembership = async (group: Group) => {
    setSaving(group.id);
    setError(null);
    try {
      const members = await api.getGroupMembers(group.id);
      const next = isMember(group.id)
        ? members.filter(id => id !== problemId)
        : [...members, problemId];
      await api.setGroupMembers(group.id, next);
      await onGroupsChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(null);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newGroupName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const group = await api.createGroup(newGroupName.trim());
      await api.setGroupMembers(group.id, [problemId]);
      setNewGroupName('');
      await onGroupsChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, fontSize: 11 }}>GROUPS</div>

      {groups.length === 0 && (
        <div style={{ color: 'var(--text-tertiary)', marginBottom: 8 }}>No groups yet.</div>
      )}

      {groups.map(g => (
        <label
          key={g.id}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: saving === g.id ? 'wait' : 'pointer' }}
        >
          <input
            type="checkbox"
            checked={isMember(g.id)}
            disabled={saving === g.id}
            onChange={() => toggleMembership(g)}
          />
          <span>{g.name}</span>
        </label>
      ))}

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input
          value={newGroupName}
          onChange={e => setNewGroupName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreateAndAdd()}
          placeholder="New group name"
          style={{
            flex: 1,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            fontSize: 11,
            fontFamily: 'inherit',
            padding: '4px 8px',
            borderRadius: 4,
            outline: 'none',
          }}
        />
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleCreateAndAdd}
          disabled={creating || !newGroupName.trim()}
          style={{ fontSize: 11 }}
        >
          {creating ? '…' : '+ Create & Add'}
        </button>
      </div>

      {error && <div style={{ fontSize: 11, color: 'var(--text-error)', marginTop: 4 }}>{error}</div>}
    </div>
  );
}
