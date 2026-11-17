import { publicDomain } from '../../shared/site-icons.mjs';

// Only the fixed favicon service is contacted. A user domain never becomes a fetch destination.
export function createSiteIcons({ fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async function getIcon(input) {
    const domain = publicDomain(input);
    if (!domain || domain !== input) return null;
    const cached = cache.get(domain);
    if (cached && cached.until > now()) return cached.value;
    if (pending.has(domain)) return pending.get(domain);
    const work = (async () => {
      let value = null;
      try {
        const response = await fetchImpl(
          `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
          { signal: AbortSignal.timeout(8000), redirect: 'follow' }
        );
        if (
          response.ok &&
          /^image\/(png|x-icon|vnd.microsoft.icon)(?:;|$)/i.test(
            response.headers.get('content-type') || ''
          )
        ) {
          const reader = response.body.getReader();
          const chunks = [];
          let size = 0;
          while (true) {
            const { done, value: chunk } = await reader.read();
            if (done) break;
            size += chunk.length;
            if (size > 256 * 1024) {
              await reader.cancel();
              throw new Error('Icon too large');
            }
            chunks.push(chunk);
          }
          if (size)
            value = {
              bytes: Buffer.concat(chunks),
              type: response.headers.get('content-type').split(';')[0],
            };
        }
      } catch {
        /* Missing/unreachable favicon renders the service initials. */
      }
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(domain, { value, until: now() + (value ? 86400000 : 3600000) });
      return value;
    })();
    pending.set(domain, work);
    try {
      return await work;
    } finally {
      pending.delete(domain);
    }
  };
}
