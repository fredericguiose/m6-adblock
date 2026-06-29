# M6 Direct — Anti-Pub (extension Chrome/Edge, MV3 + TypeScript)

Désactive les publicités **et** le détecteur d'adblock sur le direct
**M6 / 6play / M6+** (`https://www.m6.fr/m6/direct`).

> Projet indépendant et **non officiel**, sans aucun lien avec le groupe M6.
> Usage strictement personnel. Publication : [EDGE.md](EDGE.md) (gratuit,
> recommandé) ou [STORE.md](STORE.md) (Chrome Web Store). Confidentialité :
> [PRIVACY.md](PRIVACY.md).

## Comment ça marche

M6 utilise un détecteur d'adblock « poussé ». Le bloquer bêtement au niveau
réseau **déclenche** justement la détection. Cette extension reproduit la
stratégie des filtres AdGuard/uBlock en production, en 3 mécanismes injectés
dans la page **avant** le player (`world: MAIN`, `document_start`) :

| Mécanisme | Fichier | Effet |
|-----------|---------|-------|
| `set-constant` | `src/page-bypass.ts` | Force `…isBlockerDetected = false` → le détecteur croit qu'aucun bloqueur n'est présent. |
| `json-prune` | `src/page-bypass.ts` | Retire `player.features.ad.enabled` et `ad.dai.enabled` de la config `applaunch` → le player n'initialise **aucune** pub ni DAI/SSAI. |
| `prevent-xhr` | `src/page-bypass.ts` | Renvoie une réponse vide `200 OK` pour FreeWheel (`v.fwmrm.net`) au lieu d'une erreur réseau. |
| `declarativeNetRequest` | `src/rules/net-rules.json` | Blocage réseau des créatives (stickyadstv, smartadserver, videoplaza) **et des traceurs** (tealium, newrelic, GA/GTM, doubleclick, facebook, outbrain, criteo, gemius…) scopés aux domaines M6. FreeWheel **n'est volontairement pas** bloqué ici. |
| Refus du consentement | `src/consent.ts` | Refuse tout le tracking via la CMP **Didomi** (`setUserDisagreeToAll`) + clique auto sur « Continuer sans accepter » / « Tout refuser ». On ne clique **jamais** « Accepter ». |
| Nettoyage cookies | `src/background.ts` | Supprime les cookies de tracking déjà posés sur les domaines M6 (`_ga`, `_fbp`, `utag_main`, criteo, outbrain…). Préserve les cookies de consentement et de session. |

## Build

```bash
npm install
npm run build      # génère dist/
npm run watch      # rebuild auto pendant le dev
npm run typecheck  # vérif TypeScript stricte
```

## Installation (Chrome / Edge / Brave)

1. `npm install && npm run build`
2. Ouvre `chrome://extensions` (ou `edge://extensions`)
3. Active le **Mode développeur** (en haut à droite)
4. **Charger l'extension non empaquetée** → sélectionne le dossier **`dist/`**
5. Va sur https://www.m6.fr/m6/direct et lance le direct.

## Vérifier que ça marche

Ouvre la console (F12) avec le filtre niveau **Verbose** :

- `[M6-AntiPub] actif …` → le script s'est injecté à temps.
- `[M6-AntiPub] config pub elaguee …` → la config `applaunch` a été nettoyée.
- `[M6-AntiPub] XHR/fetch pub neutralise …` → un appel FreeWheel a été court-circuité.
- Le badge de l'icône compte les requêtes pub bloquées par DNR.

## Limites honnêtes

- Si M6 bascule un jour sur du **SSAI pur** (pub cousue dans le flux vidéo,
  même origine que le contenu), aucun blocage côté client n'est possible sans
  ré-encoder le flux. Tant que la pub reste pilotée par la config `applaunch`
  + FreeWheel (cas actuel), l'approche ci-dessus fonctionne.
- Les noms de propriétés (`features.ad`, `isBlockerDetected`) peuvent changer
  côté M6 ; il suffit alors d'ajuster `FALSE_FLAGS` / `pruneAdConfig` dans
  `src/page-bypass.ts`.
- Usage strictement personnel.
