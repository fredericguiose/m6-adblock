/**
 * consent.ts — MAIN world, document_start.
 *
 * M6 impose un "cookie wall" payant : la SEULE option gratuite est "Accepter".
 * "Refuser" renvoie vers l'abonnement, donc un refus auto ne ferme jamais le mur
 * -> la banniere reviendrait a chaque visite.
 *
 * Strategie : on "accepte" dans la CMP pour fermer le mur et memoriser le choix
 * (plus de popup), MAIS le pistage reel reste neutralise au niveau reseau par le
 * ruleset DNR + page-bypass (GA, Tealium, Criteo, FreeWheel...). "Accepter" ici
 * n'est qu'un leurre pour satisfaire le mur : aucune requete de tracking ne part.
 *
 *   1. via la CMP (Didomi / TCF) : setUserAgreeToAll() des qu'elle est prete.
 *   2. fallback DOM : clic auto sur "Accepter" / "Tout accepter" (jamais le
 *      bouton d'abonnement payant, garde-fou PAYWALL).
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

  // -- 1) Didomi : accepter pour fermer le mur des qu'il est pret -------------
  // (le tracking reste coupe cote reseau ; c'est juste pour passer le mur)
  try {
    w.didomiOnReady = w.didomiOnReady || [];
    w.didomiOnReady.push((Didomi: any) => {
      try {
        if (typeof Didomi?.setUserAgreeToAll === 'function') {
          Didomi.setUserAgreeToAll();
          log('Didomi -> consentement accepte (mur ferme ; tracking bloque cote reseau)');
        }
      } catch (e) {
        log('Didomi: acceptation impossible', e);
      }
    });
  } catch {
    /* noop */
  }

  // -- 2) Fallback DOM : cliquer le bouton "Accepter" -------------------------
  // On vise l'acceptation gratuite, JAMAIS le bouton d'abonnement payant.
  const ACCEPT =
    /tout accepter|j'accepte|accepter (?:&|et) (?:fermer|continuer)|continuer en acceptant|^accepter\b|accept(?: all| & close| and continue)?$|i agree/i;
  const PAYWALL =
    /abonn|s'abonner|souscri|payer|paiement|premium|sans publicit|subscribe|pay\b/i;

  function tryClickAccept(): boolean {
    const nodes = document.querySelectorAll<HTMLElement>(
      'button, a, span, div[role="button"], [class*="accept"], [id*="accept"], [class*="agree"]',
    );
    for (const el of Array.from(nodes)) {
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
      if (!label || label.length > 60) continue;
      if (ACCEPT.test(label) && !PAYWALL.test(label)) {
        el.click();
        log('clic auto sur "Accepter" ->', JSON.stringify(label));
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
    if (!done && tryClickAccept()) finish();
  });

  const start = (): void => {
    try {
      mo.observe(document.documentElement, { subtree: true, childList: true });
    } catch {
      /* noop */
    }
    if (tryClickAccept()) finish();
  };

  // filet de securite : on retente quelques secondes (la banniere arrive tard)
  let tries = 0;
  const iv = setInterval(() => {
    tries += 1;
    if (done || tries > 30) {
      clearInterval(iv);
      return;
    }
    tryClickAccept() && finish();
  }, 500);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  log('module consentement actif (acceptation auto du mur ; tracking bloque cote reseau)');
})();
