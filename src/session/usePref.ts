// A small on/off preference kept in this browser (voice cues, hands-free). Storage can be
// missing or blocked (private windows, strict settings), so every access is guarded and the
// default applies when nothing can be read.

import { useCallback, useState } from 'react';

const read = (key: string, fallback: boolean): boolean => {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
};

export function usePref(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => read(key, fallback));
  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      try {
        window.localStorage.setItem(key, v ? '1' : '0');
      } catch {
        // Not saved: the choice still applies for this visit.
      }
    },
    [key],
  );
  return [value, set];
}
