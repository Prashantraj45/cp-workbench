import { useState, useRef } from 'react';
import { useStore } from '../store/useStore';

interface ProblemSidebarProps {
  onOpenProblem: (id: string) => void;
  onNewProblem: () => void;
  onDataView: () => void;
}

export default function ProblemSidebar({ onOpenProblem, onNewProblem, onDataView }: ProblemSidebarProps) {
  const problems = useStore(s => s.problems);
  const currentProblem = useStore(s => s.currentProblem);
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = problems.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.url ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    if (e.key === 'Enter' && filtered[focused]) onOpenProblem(filtered[focused].id);
  };

  return (
    <div className="sidebar flex-col" style={{ height: '100%' }}>
      <div className="panel-header" style={{ justifyContent: 'space-between', textTransform: 'none', fontSize: 12, letterSpacing: 0 }}>
        <span style={{ fontWeight: 600 }}>Problems</span>
        <button className="btn-icon" onClick={onNewProblem} title="New problem (Cmd+N)" style={{ fontSize: 16 }}>+</button>
      </div>

      <div style={{ padding: '8px 8px 4px' }}>
        <input
          ref={searchRef}
          className="input input-sm"
          placeholder="Search..."
          value={search}
          onChange={e => { setSearch(e.target.value); setFocused(0); }}
          onKeyDown={handleKeyDown}
        />
      </div>

      <div className="flex-1 overflow-auto" style={{ padding: '4px 8px' }}>
        {filtered.length === 0 && (
          <div className="text-xs text-tertiary" style={{ textAlign: 'center', paddingTop: 16 }}>
            {problems.length === 0 ? 'No problems yet' : 'No matches'}
          </div>
        )}
        {filtered.map((p, i) => (
          <div
            key={p.id}
            className={`sidebar-item ${p.id === currentProblem?.id ? 'active' : ''} ${i === focused ? 'focused' : ''}`}
            onClick={() => onOpenProblem(p.id)}
            style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '7px 10px' }}
          >
            <span className="truncate text-sm font-medium" style={{ width: '100%' }}>{p.name}</span>
            <span className="text-xs text-tertiary">{p.cpp_standard}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: '8px', borderTop: '1px solid var(--border-subtle)' }}>
        <div className="sidebar-item w-full text-sm" onClick={onDataView} style={{ justifyContent: 'flex-start' }}>
          📊 Data &amp; History
        </div>
      </div>
    </div>
  );
}
