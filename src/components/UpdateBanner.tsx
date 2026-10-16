import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

// Each deployment changes the hashed name of the main script. A page opened before a deployment
// keeps running the old code: this banner offers to reload when a newer version is online.
const CHECK_EVERY_MS = 2 * 60 * 1000;
const SCRIPT_PATTERN = /\/assets\/index-[\w-]+\.js/;

function currentScript(): string | null {
  const script = Array.from(document.querySelectorAll('script[src]'))
    .map(s => s.getAttribute('src') || '')
    .find(src => SCRIPT_PATTERN.test(src));
  return script?.match(SCRIPT_PATTERN)?.[0] || null;
}

export const UpdateBanner: React.FC = () => {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    const running = currentScript();
    if (!running) return; // dev server: no hashed bundle
    const check = async () => {
      try {
        const html = await (await fetch('/', { cache: 'no-store' })).text();
        const online = html.match(SCRIPT_PATTERN)?.[0];
        if (online && online !== running) setOutdated(true);
      } catch {
        // offline: try again later
      }
    };
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onFocus = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  if (!outdated) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] w-[calc(100%-2rem)] max-w-md bg-brand-navy-900 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center justify-between gap-3">
      <span className="text-sm font-semibold">Nouvelle version disponible</span>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-orange-500 hover:bg-brand-orange-600 text-sm font-bold"
      >
        <RefreshCw className="w-4 h-4" /> Recharger
      </button>
    </div>
  );
};
