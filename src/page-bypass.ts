(() => {
  'use strict';

  const stats = {
    actif: true,
    href: location.href,
    configsVues: 0,
    configsNettoyees: 0,
    requetesPubNeutralisees: 0,
    clesPubDecouvertes: [] as string[],
    adUiDetectee: false,
  };
  (window as any).__m6antipub = stats;

  const log = (...a: unknown[]): void => {
    try {
      console.log('%c[M6-AntiPub]', 'color:#fff;background:#c00;padding:1px 4px;border-radius:3px', ...a);
    } catch {}
  };

  log('actif (document_start, MAIN world) sur', location.href);

  const FALSE_FLAGS = [
    'isBlockerDetected',
    'isAdBlockerDetected',
    'adblockDetected',
    'adBlockDetected',
    'bAdBlocker',
    'hasAdBlocker',
  ];
  for (const prop of FALSE_FLAGS) {
    try {
      Object.defineProperty(Object.prototype, prop, {
        configurable: true,
        get(): boolean {
          return false;
        },
        set(_v: unknown): void {},
      });
    } catch (e) {
      log('set-constant impossible pour', prop, e);
    }
  }

  const AD_KEY = /^(ad|ads|advert|advertising|advertisement|publicite|vast|vmap|vpaid|freewheel|fwmrm|ssai|dai|midroll|preroll|postroll|ima|smartad|stickyads|pulse|videoplaza)$/i;
  // « ad » désigne aussi l'audiodescription et des libellés, pas seulement la publicité.
  const TEXT_BRANCHES = new Set(['translations', 'tracks', 'tooltip']);
  const DRM_KEY = /drm|widevine|playready|fairplay|robustness|keysystem|licen[cs]e/i;

  function discoverAdKeys(root: unknown): void {
    if (!root || typeof root !== 'object') return;
    const seen = new WeakSet<object>();
    const walk = (node: any, path: string, depth: number): void => {
      if (!node || typeof node !== 'object' || depth > 16 || seen.has(node)) return;
      seen.add(node);
      for (const k of Object.keys(node)) {
        if (TEXT_BRANCHES.has(k)) continue;
        const p = path ? path + '.' + k : k;
        const v = node[k];
        if (AD_KEY.test(k) && typeof v !== 'string' && !stats.clesPubDecouvertes.includes(p)) {
          stats.clesPubDecouvertes.push(p);
          if (stats.clesPubDecouvertes.length <= 40) {
            log('cle pub reperee dans la config ->', p, '=', summarize(v));
          }
        }
        if (v && typeof v === 'object') walk(v, p, depth + 1);
      }
    };
    walk(root, '', 0);
  }

  function summarize(v: unknown): unknown {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return `[Array(${v.length})]`;
    try {
      return '{ ' + Object.keys(v as object).slice(0, 8).join(', ') + ' }';
    } catch {
      return '{…}';
    }
  }

  function pruneAdConfig(root: unknown): boolean {
    if (!root || typeof root !== 'object') return false;
    let changed = false;
    const seen = new WeakSet<object>();
    const flagsSeen = new WeakSet<object>();

    const setFalse = (obj: Record<string, any>, key: string): void => {
      if (obj[key] !== false) {
        obj[key] = false;
        changed = true;
      }
    };

    const pruneFeatureFlags = (node: any, adBranch: boolean, depth: number): void => {
      if (!node || typeof node !== 'object' || depth > 16 || flagsSeen.has(node)) return;
      flagsSeen.add(node);
      for (const key of Object.keys(node)) {
        if (DRM_KEY.test(key) || TEXT_BRANCHES.has(key)) continue;
        const value = node[key];
        const isAd = adBranch || /^(ad|ads|dai)$/i.test(key);
        if (isAd && typeof value === 'boolean') setFalse(node, key);
        else if (value && typeof value === 'object') pruneFeatureFlags(value, isAd, depth + 1);
      }
    };

    const visit = (node: unknown, depth: number): void => {
      if (!node || typeof node !== 'object' || depth > 16 || seen.has(node)) return;
      seen.add(node);
      const obj = node as Record<string, any>;

      const features = obj.features;
      if (features && typeof features === 'object') {
        const ad = features.ad;
        if (ad && typeof ad === 'object') {
          setFalse(ad, 'enabled');
          if (ad.dai && typeof ad.dai === 'object') setFalse(ad.dai, 'enabled');
          for (const key of ['midrolls', 'midroll', 'ads', 'breaks', 'cuepoints', 'slots']) {
            if (Array.isArray(ad[key]) && ad[key].length) {
              ad[key] = [];
              changed = true;
            }
          }
          if (ad.preroll) {
            ad.preroll = false;
            changed = true;
          }
        }
        const antiBlocker = features.antiBlocker;
        // ADS est un interrupteur de configuration ; les contrôles DRM et l'état runtime restent intacts.
        if (antiBlocker && typeof antiBlocker === 'object' && typeof antiBlocker.ADS === 'boolean') {
          setFalse(antiBlocker, 'ADS');
        }
      }

      pruneFeatureFlags(obj.featureFlipping, false, 0);

      for (const adKey of ['ad', 'ads', 'advertising', 'advertisement', 'publicite']) {
        const ad = obj[adKey];
        if (ad && typeof ad === 'object' && typeof ad.enabled === 'boolean') {
          setFalse(ad, 'enabled');
          if (ad.dai && typeof ad.dai === 'object') setFalse(ad.dai, 'enabled');
        }
      }

      if (typeof obj.enabled === 'boolean' && obj.dai && typeof obj.dai === 'object' && 'enabled' in obj.dai) {
        setFalse(obj, 'enabled');
        setFalse(obj.dai, 'enabled');
      }

      for (const key of Object.keys(obj)) {
        if (TEXT_BRANCHES.has(key)) continue;
        const value = obj[key];
        if (value && typeof value === 'object') visit(value, depth + 1);
      }
    };

    visit(root, 0);
    return changed;
  }

  function handleParsed(data: unknown, source: string): boolean {
    if (!data || typeof data !== 'object') return false;
    stats.configsVues++;
    try {
      const changed = pruneAdConfig(data);
      try {
        discoverAdKeys(data);
      } catch {}
      if (changed) {
        stats.configsNettoyees++;
        log('config pub NETTOYEE (' + source + ') — total:', stats.configsNettoyees);
        updatePill();
      }
      return changed;
    } catch {
      return false;
    }
  }

  const origParse = JSON.parse;
  JSON.parse = function patchedParse(text: string, reviver?: (k: string, v: any) => any): any {
    const data = origParse.call(JSON, text, reviver as any);
    handleParsed(data, 'JSON.parse');
    return data;
  } as typeof JSON.parse;

  const NEUTRALIZED_HOSTS = [
    'fwmrm.net',
    'stickyadstv.com',
    'videoplaza.tv',
    'smartadserver.com',
    'tealiumiq.com',
    'tiqcdn.com',
    'newrelic.com',
    'nr-data.net',
    'google-analytics.com',
    'analytics.google.com',
    'googletagmanager.com',
    'doubleclick.net',
    'connect.facebook.net',
    'facebook.com',
    'outbrain.com',
    'criteo.com',
    'criteo.net',
    'gemius.pl',
    'kameleoon.com',
    'kameleoon.eu',
    'tagcommander.com',
    'commander1.com',
    'bttrack.com',
    'scorecardresearch.com',
  ];
  const AD_REQUEST = /\/ad\/g\/1(?:\/|$)|\/ads?(?:\/|$)|\/(?:vast|vmap)(?:[/.]|$)/i;
  const JSON_CT = /json|javascript/i;

  function isAdRequest(input: string): boolean {
    try {
      const url = new URL(input, location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      return NEUTRALIZED_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith('.' + host)) ||
        AD_REQUEST.test(url.pathname);
    } catch {
      return false;
    }
  }

  function recordRequest(kind: string, url: string): void {
    stats.requetesPubNeutralisees++;
    log(kind + ' pub/tracking neutralise', shortUrl(url));
    updatePill();
  }

  const origFetch = window.fetch?.bind(window);
  if (origFetch) {
    window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url ?? String(input);

      if (isAdRequest(url)) {
        recordRequest('fetch', url);
        return Promise.resolve(
          new Response('', { status: 200, statusText: 'OK', headers: { 'content-type': 'text/plain' } }),
        );
      }

      return origFetch(input, init).then((resp) => {
        const ct = resp.headers.get('content-type') || '';
        if (!JSON_CT.test(ct)) return resp;
        return resp
          .clone()
          .text()
          .then((txt) => {
            if (!txt || txt.length > 2_000_000) return resp;
            try {
              const data = origParse.call(JSON, txt);
              if (handleParsed(data, 'fetch ' + shortUrl(url))) {
                const headers = new Headers(resp.headers);
                // Le navigateur a déjà décompressé le corps ; ces en-têtes décrivent les anciens octets.
                headers.delete('content-length');
                headers.delete('content-encoding');
                const cleaned = new Response(JSON.stringify(data), {
                  status: resp.status,
                  statusText: resp.statusText,
                  headers,
                });
                for (const key of ['url', 'redirected', 'type'] as const) {
                  Object.defineProperty(cleaned, key, { value: resp[key], configurable: true });
                }
                return cleaned;
              }
            } catch {}
            return resp;
          })
          .catch(() => resp);
      });
    } as typeof window.fetch;
  }

  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  const origSend = XHR.send;
  const requests = new WeakMap<XMLHttpRequest, { url: string; async: boolean }>();
  const neutralizedXhrs = new WeakSet<XMLHttpRequest>();
  const responseProperties = ['readyState', 'status', 'statusText', 'responseText', 'response', 'responseURL'];

  XHR.open = function patchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    if (neutralizedXhrs.delete(this)) {
      for (const key of responseProperties) delete (this as any)[key];
    }
    requests.set(this, { url: String(url), async: rest[0] !== false });
    return (origOpen as any).call(this, method, url, ...rest);
  } as typeof XHR.open;

  XHR.send = function patchedSend(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
    const request = requests.get(this);
    if (request && isAdRequest(request.url)) {
      recordRequest('XHR', request.url);
      neutralizedXhrs.add(this);
      const values: Record<string, unknown> = {
        readyState: 4,
        status: 200,
        statusText: 'OK',
        responseText: '',
        response: '',
        responseURL: new URL(request.url, location.href).href,
      };
      for (const key of responseProperties) {
        Object.defineProperty(this, key, { configurable: true, get: () => values[key] });
      }
      const finish = (): void => {
        if (requests.get(this) !== request) return;
        this.dispatchEvent(new Event('readystatechange'));
        this.dispatchEvent(new ProgressEvent('load'));
        this.dispatchEvent(new ProgressEvent('loadend'));
      };
      if (request.async) setTimeout(finish, 0);
      else finish();
      return;
    }
    return origSend.call(this, body ?? null);
  } as typeof XHR.send;

  const origBeacon = navigator.sendBeacon?.bind(navigator);
  if (origBeacon) {
    navigator.sendBeacon = function patchedBeacon(url: string | URL, data?: BodyInit | null): boolean {
      if (isAdRequest(String(url))) {
        recordRequest('beacon', String(url));
        return true;
      }
      return origBeacon(url, data);
    };
  }

  function shortUrl(u: string): string {
    try {
      const x = new URL(u, location.href);
      return x.hostname + x.pathname.slice(0, 80);
    } catch {
      return '(URL invalide)';
    }
  }

  let pill: HTMLElement | null = null;
  function ensurePill(): void {
    if (pill || !document.body) return;
    pill = document.createElement('div');
    pill.style.cssText =
      'position:fixed;z-index:2147483647;bottom:12px;right:12px;font:12px/1.4 system-ui,sans-serif;' +
      'background:#111;color:#0f0;padding:6px 10px;border-radius:8px;opacity:.85;pointer-events:none;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.4);max-width:280px';
    document.body.appendChild(pill);
    updatePill();
  }
  function updatePill(): void {
    if (!pill) return;
    pill.innerHTML =
      '<b>M6 Anti-Pub</b><br>' +
      'config nettoyee : ' +
      stats.configsNettoyees +
      '<br>requetes neutralisees (page) : ' +
      stats.requetesPubNeutralisees +
      (stats.adUiDetectee ? '<br>⚠️ bandeau pub detecte' : '');
  }

  function watchAdUi(): void {
    const check = () => {
      const txt = document.body?.innerText || '';
      const hasAdText = /\bpublicit[ée]\b/i.test(txt) && /\b(\d+\s*s|passer|skip|reprise)\b/i.test(txt);
      const adEl = document.querySelector(
        '[class*="advert"],[class*="-ad-"],[id*="advert"],[class*="adContainer"],[class*="ad-overlay"]',
      );
      const detected = Boolean(hasAdText || adEl);
      if (detected !== stats.adUiDetectee) {
        stats.adUiDetectee = detected;
        log(detected ? '⚠️ un bandeau/overlay de pub semble present dans le DOM' : 'plus de bandeau pub');
        updatePill();
      }
    };
    try {
      const mo = new MutationObserver(() => check());
      mo.observe(document.documentElement, { subtree: true, childList: true });
      check();
    } catch {}
  }

  function onReady(): void {
    ensurePill();
    watchAdUi();
    log(
      'init terminee. Inspecte window.__m6antipub | cles pub vues:',
      stats.clesPubDecouvertes.length ? stats.clesPubDecouvertes : '(aucune pour l’instant)',
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }

  log('hooks installes : set-constant + json-prune + prevent-xhr/fetch/beacon + diagnostic');
})();
