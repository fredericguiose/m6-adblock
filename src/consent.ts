/**
 * consent.ts — MAIN world, document_start.
 * Gere le mur de consentement / cookies de tracking de M6 SANS rien "accepter" :
 *   1. via la CMP (Didomi / TCF) : on refuse tout le tracking des qu'elle est prete.
 *   2. fallback DOM : on clique automatiquement "Continuer sans accepter" /
 *      "Tout refuser" si le bouton apparait.
 * Refuser est une reponse valide pour la CMP : la banniere se ferme et le choix
 * est memorise (cookie de consentement), donc le contenu reste accessible.
 */
(() => {
  'use strict';

  const log = (...a: unknown[]): void => {
    try {
      console.log('%c[M6-Consent]', 'color:#fff;background:#06c;padding:1px 4px;border-radius:3px', ...a);
    } catch {
      /* noop */
    }
  };

  const w = window as any;

  // -- 1) Didomi : refuser tout le tracking des qu'il est pret ----------------
  try {
    w.didomiOnReady = w.didomiOnReady || [];
    w.didomiOnReady.push((Didomi: any) => {
      try {
        if (typeof Didomi?.setUserDisagreeToAll === 'function') {
          Didomi.setUserDisagreeToAll();
          log('Didomi -> refus de tout le tracking');
        }
      } catch (e) {
        log('Didomi: refus impossible', e);
      }
    });
  } catch {
    /* noop */
  }

  // -- 2) Fallback DOM : cliquer le bouton de refus ---------------------------
  // On vise explicitement le refus (jamais "Accepter").
  const REFUSE =
    /continuer sans accepter|tout refuser|je refuse|refuser et fermer|reject all|continue without accepting|necessaires? uniquement|essential(s)? only/i;
  const ACCEPT_ONLY = /^accepter|tout accepter|j'accepte|accept all$/i;

  function tryClickRefuse(): boolean {
    const nodes = document.querySelectorAll<HTMLElement>(
      'button, a, span, div[role="button"], [class*="refuse"], [id*="refuse"], [class*="deny"]',
    );
    for (const el of Array.from(nodes)) {
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
      if (!label || label.length > 60) continue;
      if (REFUSE.test(label) && !ACCEPT_ONLY.test(label)) {
        el.click();
        log('clic auto sur le refus ->', JSON.stringify(label));
        return true;
      }
    }
    return false;
  }

  let done = false;
  const finish = () => {
    done = true;
    try {
      mo.disconnect();
    } catch {
      /* noop */
    }
    clearInterval(iv);
  };

  const mo = new MutationObserver(() => {
    if (!done && tryClickRefuse()) finish();
  });

  const start = (): void => {
    try {
      mo.observe(document.documentElement, { subtree: true, childList: true });
    } catch {
      /* noop */
    }
    if (tryClickRefuse()) finish();
  };

  // filet de securite : on retente quelques secondes (la banniere arrive tard)
  let tries = 0;
  const iv = setInterval(() => {
    tries += 1;
    if (done || tries > 30) {
      clearInterval(iv);
      return;
    }
    tryClickRefuse() && finish();
  }, 500);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  log('module consentement actif (refus auto du tracking)');
})();
