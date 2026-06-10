type EventName =
  | 'calc_keypress'
  | 'mode_change'
  | 'model_switch'
  | 'result_copy'
  | 'faq_open'
  | 'scroll_depth'
  | 'cta_click'
  | 'external_link';

type EventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    __scicalc_tracked?: Set<string>;
  }
}

const KEYPRESS_THROTTLE_MS = 30_000;
let lastKeypressEmit = 0;

export function track(event: EventName, params: EventParams = {}): void {
  if (typeof window === 'undefined') return;

  if (event === 'calc_keypress') {
    const now = Date.now();
    if (now - lastKeypressEmit < KEYPRESS_THROTTLE_MS) return;
    lastKeypressEmit = now;
  }

  const payload = { ...params, ts: Date.now() };

  if (typeof window.gtag === 'function') {
    window.gtag('event', event, payload);
  } else if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event, ...payload });
  }

  if (import.meta.env.DEV) {
    console.debug('[track]', event, payload);
  }
}

export function trackOnce(event: EventName, key: string, params: EventParams = {}): void {
  if (typeof window === 'undefined') return;
  if (!window.__scicalc_tracked) window.__scicalc_tracked = new Set();
  if (window.__scicalc_tracked.has(key)) return;
  window.__scicalc_tracked.add(key);
  track(event, params);
}
