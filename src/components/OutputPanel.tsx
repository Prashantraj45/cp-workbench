export default function OutputPanel() {
  return (
    <div style={{ height: '100%', background: 'var(--bg-secondary)', padding: 8, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>OUTPUT</div>
      <div
        style={{
          flex: 1,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: 8,
          fontFamily: 'inherit',
          fontSize: 13,
          overflow: 'auto',
          color: 'var(--text-secondary)',
        }}
      >
        Run a solution to see output...
      </div>
    </div>
  );
}
