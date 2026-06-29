/**
 * background.ts — service worker.
 *  - Le blocage reseau (pub + traceurs) est porte par le ruleset statique DNR.
 *  - Ici on : (a) verifie/reactive le ruleset, (b) compte les requetes bloquees,
 *    (c) nettoie les cookies de tracking deja poses sur les domaines M6.
 */

const ADS_RULESET = 'm6-ads';
const M6_DOMAINS = ['m6.fr', '6play.fr', 'm6web.fr'];

// Cookies de tracking a supprimer. On NE touche PAS aux cookies de consentement
// (didomi_token, euconsent-v2) ni a la session, pour ne pas re-declencher la
// banniere ni casser la lecture.
const TRACK_COOKIES = [
  '_ga',
  '_gid',
  '_gat',
  '_gcl_au',
  '_fbp',
  '_fbc',
  'utag_main',
  'cto_bundle',
  'cto_bidid',
  'outbrain_cid',
  'obuid',
  '_pcid',
  '_pctx',
  'panoramaId',
  'panoramaId_expiry',
  'panoramaIdType',
  '_scid',
  'sc_at',
];

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const ids = await chrome.declarativeNetRequest.getEnabledRulesets();
    console.info('[M6-AntiPub] rulesets DNR actifs :', ids);
    if (!ids.includes(ADS_RULESET)) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: [ADS_RULESET] });
      console.info('[M6-AntiPub] ruleset', ADS_RULESET, 'reactive.');
    }
  } catch (e) {
    console.warn('[M6-AntiPub] impossible de verifier les rulesets DNR', e);
  }
  cleanTrackingCookies();
});

// Nettoyage des cookies traceurs sur tous les domaines M6 (et sous-domaines).
async function cleanTrackingCookies(): Promise<void> {
  if (!chrome.cookies) return;
  let removed = 0;
  for (const base of M6_DOMAINS) {
    for (const domain of [base, '.' + base]) {
      let cookies: chrome.cookies.Cookie[] = [];
      try {
        cookies = await chrome.cookies.getAll({ domain });
      } catch {
        continue;
      }
      for (const c of cookies) {
        const hit =
          TRACK_COOKIES.includes(c.name) ||
          /^_ga_|^_hj|^_uet|^km_|^kameleoon|^cto_|^panorama/i.test(c.name);
        if (!hit) continue;
        const secure = c.secure ? 'https' : 'http';
        const host = c.domain.replace(/^\./, '');
        const url = `${secure}://${host}${c.path}`;
        try {
          await chrome.cookies.remove({ url, name: c.name });
          removed += 1;
        } catch {
          /* noop */
        }
      }
    }
  }
  if (removed) console.info('[M6-AntiPub] cookies de tracking supprimes :', removed);
}

// Re-nettoie a chaque navigation vers une page M6.
chrome.tabs?.onUpdated.addListener((_id, info, tab) => {
  if (info.status !== 'loading' || !tab.url) return;
  if (M6_DOMAINS.some((d) => tab.url!.includes(d))) cleanTrackingCookies();
});

// Compteur visuel des requetes bloquees (DNR feedback, dispo en mode dev).
let blocked = 0;
const feedback = (chrome.declarativeNetRequest as any).onRuleMatchedDebug;
if (feedback && typeof feedback.addListener === 'function') {
  feedback.addListener((info: { request: { url: string } }) => {
    blocked += 1;
    chrome.action?.setBadgeText?.({ text: String(blocked) });
    console.debug('[M6-AntiPub] requete bloquee :', info.request.url);
  });
}
