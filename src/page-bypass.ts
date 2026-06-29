/**
 * page-bypass.ts
 * -----------------------------------------------------------------------------
 * S'execute dans le MONDE PRINCIPAL (world: MAIN) au document_start, donc AVANT
 * le code du player M6/6play. Permet d'intercepter fetch / XHR / JSON.parse et
 * de patcher Object.prototype avant l'init du player.
 *
 * Trois mecanismes (repris des filtres AdGuard/uBlock en prod) :
 *   1. set-constant  -> neutralise le drapeau de detection d'adblock.
 *   2. json-prune    -> retire ad.enabled / ad.dai.enabled de la config player.
 *   3. prevent-xhr   -> reponse vide "200 OK" pour FreeWheel au lieu d'une erreur.
 *
 * + Mode DIAGNOSTIC : logs visibles, pastille a l'ecran, et dump de la vraie
 *   structure de config M6 (cles liees a la pub) pour pouvoir ajuster les
 *   chemins si M6 a renomme quelque chose.
 */
(() => {
  'use strict';

  // ===========================================================================
  // Etat / statistiques (inspectables via window.__m6antipub dans la console)
  // ===========================================================================
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
    } catch {
      /* noop */
    }
  };

  log('actif (document_start, MAIN world) sur', location.href);

  // ===========================================================================
  // 1) ANTI-DETECTION : forcer les drapeaux de detection a "false"
  // ===========================================================================
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
        set(_v: unknown): void {
          /* on ignore : vu de l'exterieur la valeur reste false */
        },
      });
    } catch (e) {
      log('set-constant impossible pour', prop, e);
    }
  }

  // ===========================================================================
  // DIAGNOSTIC : reperer les cles liees a la pub dans un objet de config
  // ===========================================================================
  const AD_KEY = /^(ad|ads|advert|advertising|advertisement|publicite|vast|vmap|vpaid|freewheel|fwmrm|ssai|dai|midroll|preroll|postroll|ima|smartad|stickyads|pulse|videoplaza)$/i;

  function discoverAdKeys(root: unknown): void {
    if (!root || typeof root !== 'object') return;
    const seen = new WeakSet<object>();
    const walk = (node: any, path: string, depth: number): void => {
      if (!node || typeof node !== 'object' || depth > 16 || seen.has(node)) return;
      seen.add(node);
      for (const k of Object.keys(node)) {
        const p = path ? path + '.' + k : k;
        if (AD_KEY.test(k) && !stats.clesPubDecouvertes.includes(p)) {
          stats.clesPubDecouvertes.push(p);
          if (stats.clesPubDecouvertes.length <= 40) {
            log('cle pub reperee dans la config ->', p, '=', summarize(node[k]));
          }
        }
        const v = node[k];
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

  // ===========================================================================
  // 2) JSON-PRUNE : desactiver la pub dans la config du player
  // ===========================================================================
  function pruneAdConfig(root: unknown): boolean {
    if (!root || typeof root !== 'object') return false;
    let changed = false;
    const seen = new WeakSet<object>();

    const setFalse = (obj: Record<string, any>, key: string) => {
      if (obj && typeof obj === 'object' && obj[key] !== false) {
        obj[key] = false;
        changed = true;
      }
    };

    const visit = (node: unknown, depth: number): void => {
      if (!node || typeof node !== 'object' || depth > 16 || seen.has(node as object)) return;
      seen.add(node as object);
      const obj = node as Record<string, any>;

      // (a) noeud "features.ad" (schema 6play/Bedrock classique)
      const features = obj.features;
      if (features && typeof features === 'object' && features.ad && typeof features.ad === 'object') {
        const ad = features.ad as Record<string, any>;
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

      // (b) tout objet "ad"/"advertising" qui possede un flag enabled
      for (const adKey of ['ad', 'ads', 'advertising', 'advertisement', 'publicite']) {
        const node2 = obj[adKey];
        if (node2 && typeof node2 === 'object' && typeof node2.enabled === 'boolean') {
          setFalse(node2, 'enabled');
          if (node2.dai && typeof node2.dai === 'object') setFalse(node2.dai, 'enabled');
        }
      }

      // (c) variante a plat : { enabled, dai:{enabled} }
      if (typeof obj.enabled === 'boolean' && obj.dai && typeof obj.dai === 'object' && 'enabled' in obj.dai) {
        setFalse(obj, 'enabled');
        setFalse(obj.dai, 'enabled');
      }

      for (const k in obj) {
        const v = obj[k];
        if (v && typeof v === 'object') visit(v, depth + 1);
      }
    };

    visit(root, 0);
    return changed;
  }

  // applique diagnostic + prune sur tout objet de config
  function handleParsed(data: unknown, source: string): void {
    if (!data || typeof data !== 'object') return;
    stats.configsVues++;
    try {
      discoverAdKeys(data);
    } catch {
      /* noop */
    }
    try {
      if (pruneAdConfig(data)) {
        stats.configsNettoyees++;
        log('config pub NETTOYEE (' + source + ') — total:', stats.configsNettoyees);
        updatePill();
      }
    } catch {
      /* noop */
    }
  }

  // -- Hook JSON.parse -------------------------------------------------------
  const origParse = JSON.parse;
  JSON.parse = function patchedParse(text: string, reviver?: (k: string, v: any) => any): any {
    const data = origParse.call(JSON, text, reviver as any);
    // ne traiter que ce qui ressemble a de la config (pas chaque petit parse)
    if (data && typeof data === 'object') handleParsed(data, 'JSON.parse');
    return data;
  } as typeof JSON.parse;

  // ===========================================================================
  // 3) NEUTRALISER les requetes pub (fetch / XHR)
  // ===========================================================================
  const AD_REQUEST = /(?:^|\.)fwmrm\.net|\/ad\/g\/1|stickyadstv\.com|videoplaza\.tv|smartadserver\.com|\/ads?\?|\/vast|\/vmap/i;
  const JSON_CT = /json|javascript/i;

  // -- fetch -----------------------------------------------------------------
  const origFetch = window.fetch?.bind(window);
  if (origFetch) {
    window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url ?? String(input);

      if (AD_REQUEST.test(url)) {
        stats.requetesPubNeutralisees++;
        log('fetch pub neutralise', url);
        updatePill();
        return Promise.resolve(
          new Response('', { status: 200, statusText: 'OK', headers: { 'content-type': 'text/plain' } }),
        );
      }

      return origFetch(input as any, init).then((resp) => {
        const ct = resp.headers.get('content-type') || '';
        if (!JSON_CT.test(ct)) return resp;
        return resp
          .clone()
          .text()
          .then((txt) => {
            if (!txt || txt.length > 2_000_000) return resp;
            try {
              const data = origParse.call(JSON, txt);
              if (data && typeof data === 'object') {
                handleParsed(data, 'fetch ' + shortUrl(url));
                // si on a nettoye, renvoyer la version modifiee au player
                if (pruneAdConfig(data)) {
                  return new Response(JSON.stringify(data), {
                    status: resp.status,
                    statusText: resp.statusText,
                    headers: resp.headers,
                  });
                }
              }
            } catch {
              /* pas du JSON exploitable */
            }
            return resp;
          })
          .catch(() => resp);
      });
    } as typeof window.fetch;
  }

  // -- XMLHttpRequest --------------------------------------------------------
  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  const origSend = XHR.send;

  XHR.open = function patchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    (this as any).__m6url = typeof url === 'string' ? url : url.href;
    return (origOpen as any).call(this, method, url, ...rest);
  } as typeof XHR.open;

  XHR.send = function patchedSend(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
    const url: string = (this as any).__m6url || '';

    if (AD_REQUEST.test(url)) {
      stats.requetesPubNeutralisees++;
      log('XHR pub neutralise', url);
      updatePill();
      const self = this;
      const def = (k: string, v: unknown) => {
        try {
          Object.defineProperty(self, k, { configurable: true, get: () => v });
        } catch {
          /* prop en lecture seule selon le moteur */
        }
      };
      def('readyState', 4);
      def('status', 200);
      def('statusText', 'OK');
      def('responseText', '');
      def('response', '');
      def('responseURL', url);
      setTimeout(() => {
        try {
          self.dispatchEvent(new Event('readystatechange'));
          self.dispatchEvent(new ProgressEvent('load'));
          self.dispatchEvent(new ProgressEvent('loadend'));
        } catch {
          /* noop */
        }
      }, 0);
      return;
    }
    return origSend.call(this, body ?? null);
  } as typeof XHR.send;

  // ===========================================================================
  // PASTILLE + detection visuelle d'un bandeau de pub
  // ===========================================================================
  function shortUrl(u: string): string {
    try {
      const x = new URL(u, location.href);
      return x.pathname.slice(0, 40);
    } catch {
      return u.slice(0, 40);
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
      '<b>M6 Anti-Pub</b> ✅<br>' +
      'config nettoyee : ' +
      stats.configsNettoyees +
      '<br>requetes pub coupees : ' +
      stats.requetesPubNeutralisees +
      (stats.adUiDetectee ? '<br>⚠️ bandeau pub detecte' : '');
  }

  // Detecte un eventuel bandeau "Publicite" / conteneur d'annonce dans le DOM.
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
    } catch {
      /* noop */
    }
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

  log('hooks installes : set-constant + json-prune + prevent-xhr + diagnostic');
})();
