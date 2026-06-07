interface StressTestProps {
  isDark: boolean;
}

export default function StressTest({ isDark: _isDark }: StressTestProps) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
      Stress test panel (coming in next task)
    </div>
  );
}
