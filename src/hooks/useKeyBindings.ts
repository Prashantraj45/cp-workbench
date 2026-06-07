import { useEffect } from 'react';

interface KeyBinding {
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  handler: (e: KeyboardEvent) => void;
}

export function useKeyBindings(bindings: KeyBinding[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      for (const binding of bindings) {
        if (
          e.key.toLowerCase() === binding.key.toLowerCase() &&
          (binding.metaKey === undefined || e.metaKey === binding.metaKey) &&
          (binding.shiftKey === undefined || e.shiftKey === binding.shiftKey) &&
          (binding.ctrlKey === undefined || e.ctrlKey === binding.ctrlKey)
        ) {
          e.preventDefault();
          binding.handler(e);
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [bindings]);
}
