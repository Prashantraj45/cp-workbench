export default function InputPanel() {
  return (
    <div style={{ height: '100%', background: 'var(--bg-secondary)', padding: 8, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>INPUT</div>
      <textarea
        style={{
          flex: 1,
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: 8,
          fontFamily: 'inherit',
          fontSize: 13,
          resize: 'none',
          outline: 'none',
        }}
        placeholder="Input will appear here..."
      />
    </div>
  );
}
