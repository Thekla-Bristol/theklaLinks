// Reads the admin portal's public document (Firestore public/live) so events.json carries
// a copy. The page still shows admin changes if Firebase can't be reached.
import fs from 'node:fs/promises';

export function readConfig(text) {
  const pick = (k) => (new RegExp(`${k}["']?\\s*:\\s*["']([^"']*)["']`).exec(text) || [])[1] || '';
  return { projectId: pick('projectId'), apiKey: pick('apiKey') };
}

export function decode(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) {
    const o = {};
    for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = decode(x);
    return o;
  }
  return null;
}

export async function fetchLive(configPath) {
  let cfg;
  try { cfg = readConfig(await fs.readFile(configPath, 'utf8')); } catch { return { skipped: true }; }
  if (!cfg.projectId) return { skipped: true };
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/(default)/documents/public/live`;
  // Without the key first (works even if the key is limited to the website), then with it
  for (const url of [base, cfg.apiKey ? `${base}?key=${encodeURIComponent(cfg.apiKey)}` : null].filter(Boolean)) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (r.status === 404) return { live: {} };
      if (!r.ok) continue;
      const j = await r.json();
      return { live: decode({ mapValue: { fields: j.fields || {} } }) };
    } catch { /* try next */ }
  }
  throw new Error('could not read Firebase');
}
