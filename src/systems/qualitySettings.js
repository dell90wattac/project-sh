// Quality settings module — persists across sessions via localStorage.
// Two profiles: 'high' (full visual fidelity) and 'low' (performance mode).

const STORAGE_KEY = 'projectSH_quality';
const VALID = ['high', 'low'];

let _quality = 'high';

// Restore from localStorage or URL parameter (?quality=low)
try {
  const urlParam = new URLSearchParams(window.location.search).get('quality');
  if (urlParam && VALID.includes(urlParam)) {
    _quality = urlParam;
  } else {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID.includes(stored)) _quality = stored;
  }
} catch { /* private browsing / iframe sandbox — default to high */ }

export function getQuality()   { return _quality; }
export function isLowQuality() { return _quality === 'low'; }

export function setQuality(profile) {
  if (!VALID.includes(profile)) return;
  _quality = profile;
  try { localStorage.setItem(STORAGE_KEY, profile); } catch { /* ignore */ }
}
