import { useEffect, useLayoutEffect, useState } from 'react';
import { fitDisplay, initialDisplayMode } from './display';

export function readDisplayMode() {
  let saved = null;
  try {
    saved = localStorage.getItem('subtrack-display');
  } catch {
    // The URL and device detection still work when storage is unavailable.
  }
  return initialDisplayMode({
    search: location.search,
    saved,
    userAgent: navigator.userAgent,
    touchPoints: navigator.maxTouchPoints || 0,
  });
}

export function useDisplayPreference(enabled) {
  useEffect(() => {
    try {
      localStorage.setItem('subtrack-display', enabled ? '1' : '0');
    } catch {
      // Display mode remains usable without persistent storage.
    }
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
