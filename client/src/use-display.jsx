import { useEffect, useLayoutEffect, useState } from 'react';
import { displayChoiceToRemember, fitDisplay, initialDisplayMode } from './display';

export function readDisplayMode() {
  let saved = null;
  let legacySaved = null;
  try {
    saved = localStorage.getItem('subtrack-display-choice');
    legacySaved = localStorage.getItem('subtrack-display');
  } catch {
    // The URL and device detection still work when storage is unavailable.
  }
  return initialDisplayMode({
    search: location.search,
    saved,
    legacySaved,
    userAgent: navigator.userAgent,
    touchPoints: navigator.maxTouchPoints || 0,
  });
}

export function rememberDisplayChoice(enabled) {
  try {
    localStorage.setItem('subtrack-display-choice', enabled ? '1' : '0');
  } catch {
    // The explicit URL continues to work without storage.
  }
}

export function useDisplayPreference(enabled) {
  useEffect(() => {
    const choice = displayChoiceToRemember(enabled, location.search);
    if (choice !== null) rememberDisplayChoice(choice === '1');
    const url = new URL(location.href);
    if (enabled) url.searchParams.set('display', '1');
    else url.searchParams.delete('display');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, [enabled]);
}

export function useDisplayFit(enabled, ref) {
  const [style, setStyle] = useState(() => fitDisplay(innerWidth, innerHeight));
  useLayoutEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add('display-active');
    const update = () => {
      const shell = ref.current?.querySelector('.main-shell');
      setStyle(fitDisplay(innerWidth, innerHeight, shell?.scrollHeight));
    };
    update();
    const shell = ref.current?.querySelector('.main-shell');
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (shell) observer?.observe(shell);
    window.addEventListener('resize', update);
    const interval = observer ? null : setInterval(update, 2000);
    return () => {
      document.documentElement.classList.remove('display-active');
      observer?.disconnect();
      window.removeEventListener('resize', update);
      if (interval) clearInterval(interval);
    };
  }, [enabled, ref]);
  return enabled ? style : undefined;
}
