import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../lib/tauri';
import type { Problem, Tag, ProblemWithMeta } from '../lib/types';
import ConfirmDialog from './ConfirmDialog';
import TagManager from './TagManager';
import GroupManager from './GroupManager';

interface DataManagementProps {
  onClose: () => void;
  onOpenProblem: (id: string) => void;
}

function getPlatform(url: string | null): string {
  if (!url) return 'Other';
  if (url.includes('codeforces.com')) return 'CF';
  if (url.includes('leetcode.com')) return 'LC';
  if (url.includes('cses.fi')) return 'CSES';
  return 'Other';
}

function getCfContestId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/codeforces\.com\/contest\/(\d+)/);
  return match ? match[1] : null;
}

export default function DataManagement({ onClose, onOpenProblem }: DataManagementProps) {
  const problems = useStore(s => s.problems);
  const setProblems = useStore(s => s.setProblems);
  const tags = useStore(s => s.tags);
  const setTags = useStore(s => s.setTags);
  const groups = useStore(s => s.groups);
  const setGroups = useStore(s => s.setGroups);

  const [enriched, setEnriched] = useState<ProblemWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [platformFilter, setPlatformFilter] = useState<string>('All');
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [groupFilter, setGroupFilter] = useState<string>('All');

  // UI state
  const [deleteTarget, setDeleteTarget] = useState<Problem | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [showTagManager, setShowTagManager] = useState(false);
  const [groupManagerProblemId, setGroupManagerProblemId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [fetchedTags, fetchedGroups] = await Promise.all([
          api.getTags(),
          api.getGroups(),
        ]);
        if (cancelled) return;
        setTags(fetchedTags);
        setGroups(fetchedGroups);

        const allGroupMembers: Record<string, string[]> = {};
        await Promise.all(
          fetchedGroups.map(async (g) => {
            allGroupMembers[g.id] = await api.getGroupMembers(g.id);
          })
        );

        if (cancelled) return;

        const enrichedProblems = await Promise.all(
          problems.map(async (p) => {
            const [problemTags, runCount] = await Promise.all([
              api.getProblemTags(p.id),
              api.getRunCount(p.id),
            ]);
            const groupIds = fetchedGroups
              .filter(g => allGroupMembers[g.id]?.includes(p.id))
              .map(g => g.id);
            return { ...p, tags: problemTags, groupIds, runCount } as ProblemWithMeta;
          })
        );

        if (!cancelled) setEnriched(enrichedProblems);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [problems]); // eslint-disable-line react-hooks/exhaustive-deps

  const platforms = ['All', 'CF', 'LC', 'CSES', 'Other'];
  const cfContests = Array.from(
    new Set(problems.map(p => getCfContestId(p.url)).filter(Boolean) as string[])
  ).sort();

  const filtered = enriched.filter(p => {
    if (platformFilter !== 'All' && getPlatform(p.url) !== platformFilter) return false;
    if (selectedTagIds.size > 0) {
      const problemTagIds = new Set(p.tags.map(t => t.id));
      for (const tid of selectedTagIds) {
        if (!problemTagIds.has(tid)) return false;
      }
    }
    if (groupFilter !== 'All') {
      if (groupFilter.startsWith('contest:')) {
        const contestId = groupFilter.replace('contest:', '');
        if (getCfContestId(p.url) !== contestId) return false;
      } else {
        if (!p.groupIds.includes(groupFilter)) return false;
      }
    }
    return true;
  });

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

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId); else next.add(tagId);
      return next;
    });
  };

  const refreshAfterTagChange = useCallback(async () => {
    const newTags = await api.getTags();
    setTags(newTags);
    const allGroupMembers: Record<string, string[]> = {};
    await Promise.all(groups.map(async g => {
      allGroupMembers[g.id] = await api.getGroupMembers(g.id);
    }));
    const enrichedProblems = await Promise.all(
      problems.map(async (p) => {
        const [problemTags, runCount] = await Promise.all([
          api.getProblemTags(p.id),
          api.getRunCount(p.id),
        ]);
        const groupIds = groups
          .filter(g => allGroupMembers[g.id]?.includes(p.id))
          .map(g => g.id);
        return { ...p, tags: problemTags, groupIds, runCount } as ProblemWithMeta;
      })
    );
    setEnriched(enrichedProblems);
  }, [problems, groups, setTags]);

  const refreshAfterGroupChange = useCallback(async () => {
    const newGroups = await api.getGroups();
    setGroups(newGroups);
    const allGroupMembers: Record<string, string[]> = {};
    await Promise.all(newGroups.map(async g => {
      allGroupMembers[g.id] = await api.getGroupMembers(g.id);
    }));
    setEnriched(prev => prev.map(p => ({
      ...p,
      groupIds: newGroups.filter(g => allGroupMembers[g.id]?.includes(p.id)).map(g => g.id),
    })));
  }, [setGroups]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', zIndex: 200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <span style={{ fontWeight: 500, fontSize: 14 }}>Data &amp; History</span>
        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          {filtered.length} / {problems.length} problems
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn-icon" onClick={onClose} style={{ fontSize: 16 }}>✕</button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Filter panel */}
        <div style={{ width: 220, borderRight: '1px solid var(--border-subtle)', overflowY: 'auto', padding: '16px 12px', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>PLATFORM</div>
          {platforms.map(p => (
            <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
              <input type="radio" name="platform" checked={platformFilter === p} onChange={() => setPlatformFilter(p)} />
              {p}
            </label>
          ))}

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '12px 0' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>TAGS</span>
            <button className="btn-icon" style={{ fontSize: 10, color: 'var(--text-accent)' }} onClick={() => setShowTagManager(true)}>
              Manage
            </button>
          </div>
          {tags.map(tag => (
            <label key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedTagIds.has(tag.id)} onChange={() => toggleTagFilter(tag.id)} />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
              {tag.name}
            </label>
          ))}
          {tags.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No tags yet</div>}

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '12px 0' }} />

          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>GROUPS</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
            <input type="radio" name="group" checked={groupFilter === 'All'} onChange={() => setGroupFilter('All')} />
            All
          </label>
          {groups.map(g => (
            <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
              <input type="radio" name="group" checked={groupFilter === g.id} onChange={() => setGroupFilter(g.id)} />
              {g.name}
            </label>
          ))}

          {cfContests.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, marginBottom: 4, fontWeight: 500 }}>CF CONTESTS</div>
              {cfContests.map(id => (
                <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
                  <input type="radio" name="group" checked={groupFilter === `contest:${id}`} onChange={() => setGroupFilter(`contest:${id}`)} />
                  Contest {id}
                </label>
              ))}
            </>
          )}
        </div>

        {/* Right: Problem list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>
              No problems match the current filters.
            </div>
          )}
          {!loading && filtered.map(p => (
            <div key={p.id}>
              <div className="data-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span className="text-sm font-medium truncate">{p.name}</span>
                      <span className="badge badge-neutral" style={{ fontSize: 10 }}>{getPlatform(p.url)}</span>
                      {p.tags.map(tag => (
                        <span key={tag.id} style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 10,
                          background: tag.color + '33', color: tag.color,
                          border: `1px solid ${tag.color}55`,
                        }}>
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-tertiary" style={{ marginTop: 2 }}>
                    {p.runCount} run{p.runCount !== 1 ? 's' : ''} · {p.cpp_standard}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { onOpenProblem(p.id); onClose(); }}>Open</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setRenaming(p.id); setRenameName(p.name); }}>Rename</button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setGroupManagerProblemId(groupManagerProblemId === p.id ? null : p.id)}
                  >
                    Groups
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(p)}>Delete</button>
                </div>

                <TagEditor
                  problem={p}
                  allTags={tags}
                  onSave={async (tagIds) => {
                    await api.setProblemTags(p.id, tagIds);
                    setEnriched(prev => prev.map(ep =>
                      ep.id === p.id ? { ...ep, tags: tags.filter(t => tagIds.includes(t.id)) } : ep
                    ));
                  }}
                />
              </div>

              {groupManagerProblemId === p.id && (
                <div style={{ padding: '0 16px 12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <GroupManager
                    problemId={p.id}
                    currentGroupIds={p.groupIds}
                    groups={groups}
                    onGroupsChanged={refreshAfterGroupChange}
                  />
                </div>
              )}
            </div>
          ))}
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

      {showTagManager && (
        <TagManager
          tags={tags}
          onClose={() => setShowTagManager(false)}
          onChanged={refreshAfterTagChange}
        />
      )}
    </div>
  );
}

function TagEditor({
  problem,
  allTags,
  onSave,
}: {
  problem: ProblemWithMeta;
  allTags: Tag[];
  onSave: (tagIds: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(problem.tags.map(t => t.id)));
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(Array.from(selected));
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        style={{ fontSize: 10, color: 'var(--text-secondary)' }}
        onClick={() => { setSelected(new Set(problem.tags.map(t => t.id))); setOpen(true); }}
      >
        + Tags
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', padding: '4px 0', width: '100%' }}>
      {allTags.map(tag => (
        <button
          key={tag.id}
          onClick={() => toggle(tag.id)}
          style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 10,
            border: `1px solid ${tag.color}`,
            background: selected.has(tag.id) ? tag.color : 'transparent',
            color: selected.has(tag.id) ? 'white' : tag.color,
            cursor: 'pointer',
          }}
        >
          {tag.name}
        </button>
      ))}
      <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={save} disabled={saving}>
        {saving ? '…' : 'Save'}
      </button>
      <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}
