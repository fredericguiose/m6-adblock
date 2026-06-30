# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Le mainteneur travaille en français : commentaires de code, messages de commit et réponses en français.

## Présentation

Extension Chrome/Edge **Manifest V3** (TypeScript) qui désactive la publicité **et** le
détecteur d'adblock sur le direct M6 / 6play / M6+ (`https://www.m6.fr/m6/direct`).
Projet non officiel, usage personnel.

## Commandes

```bash
npm install
npm run build      # esbuild -> dist/ (à charger dans chrome://extensions, non empaqueté)
npm run watch      # rebuild auto pendant le dev
npm run typecheck  # tsc --noEmit, mode strict (PAS de tests dans ce repo)
npm run icons      # régénère src/icons/icon{16,32,48,128}.png (générateur PNG maison)
npm run package    # build propre + release/m6-adblock-v<version>.zip (encodeur ZIP maison)
```

Il n'y a **pas de framework de test ni de linter** : `npm run typecheck` est la seule
vérification automatisée. `tsconfig.json` est en `noEmit` (esbuild fait le bundling) et
`strict` + `noUnusedLocals`/`noUnusedParameters` — du code mort fait échouer le typecheck.

## Architecture

Le point clé : M6 a un **anti-adblock agressif** — bloquer la pub naïvement au niveau
réseau *déclenche* la détection. La stratégie (reprise des filtres AdGuard/uBlock) est de
laisser le player croire qu'il n'y a aucun bloqueur, tout en vidant la config pub **avant**
qu'il s'initialise. Cinq mécanismes répartis sur 3 entrées esbuild + 1 ruleset DNR statique :

- **`src/page-bypass.ts`** (content script, `world: MAIN`, `document_start`) — s'exécute
  **avant** le player. C'est le cœur. Trois techniques :
  - *set-constant* : `Object.defineProperty(Object.prototype, …)` force les drapeaux de
    détection (`isBlockerDetected`, etc., liste `FALSE_FLAGS`) à `false`.
  - *json-prune* : hooke `JSON.parse` **et** `fetch` pour intercepter la config `applaunch`
    et mettre `features.ad.enabled` / `ad.dai.enabled` à `false` (fonction `pruneAdConfig`,
    parcours récursif tolérant à plusieurs schémas). Pour `fetch`, la réponse JSON modifiée
    est réémise au player ; `JSON.parse` mute l'objet en place.
  - *prevent-xhr* : `fetch`/`XHR` vers FreeWheel & co (`AD_REQUEST`) renvoient un `200 OK`
    **vide** au lieu d'une erreur réseau (une erreur réseau réveillerait le détecteur).
  - Mode diagnostic intégré : pastille à l'écran, `window.__m6antipub` (stats),
    `discoverAdKeys` qui logge les clés liées à la pub pour ajuster les chemins si M6 renomme.

- **`src/consent.ts`** (content script, `world: MAIN`, `document_start`) — M6 impose un
  **cookie wall payant** (seule option gratuite : « Accepter » ; « Refuser » mène à
  l'abonnement). Un refus auto ne fermerait donc jamais le mur → il reviendrait à chaque
  visite. On **accepte** dans la CMP **Didomi** (`setUserAgreeToAll`) + clic auto sur
  « Accepter » pour fermer le mur et mémoriser le choix. C'est un **leurre** : le pistage
  réel reste coupé au niveau réseau (DNR + page-bypass), donc « accepter » n'envoie aucune
  requête de tracking. Garde-fou `PAYWALL` : on ne clique **jamais** le bouton d'abonnement.

- **`src/rules/net-rules.json`** (ruleset DNR statique) — blocage réseau des créatives
  (stickyadstv, smartadserver, videoplaza) + traceurs (GA/GTM, tealium, criteo…) scopés via
  `initiatorDomains` aux domaines M6. **FreeWheel n'est volontairement pas bloqué ici** —
  il est neutralisé côté page (réponse vide) pour ne pas déclencher la détection.

- **`src/background.ts`** (service worker) — réactive le ruleset DNR au besoin, compte les
  requêtes bloquées (badge, via `onRuleMatchedDebug`, dispo en mode dev seulement), et
  supprime les cookies de tracking déjà posés (`TRACK_COOKIES`). Préserve **toujours** les
  cookies de consentement (`didomi_token`, `euconsent-v2`) et de session.

`src/manifest.json` est copié tel quel vers `dist/` par `build.mjs` (les noms de sortie
esbuild — `page-bypass.js`, `consent.js`, `background.js` — doivent rester synchronisés
avec le manifest et les `entryPoints` de `build.mjs`).

### Invariants à préserver

- Ne pas bloquer FreeWheel au niveau réseau/DNR (le neutraliser côté page, réponse vide).
- Ne jamais renvoyer une **erreur** réseau pour une requête pub — toujours un `200` vide.
- Ne pas supprimer les cookies de consentement/session dans `background.ts`.
- Quand M6 renomme des propriétés, ajuster `FALSE_FLAGS` / `pruneAdConfig` / `AD_REQUEST`
  dans `page-bypass.ts` (le mode diagnostic aide à retrouver les nouveaux chemins).

## Limite fondamentale

Si M6 passe au **SSAI pur** (pub cousue dans le flux vidéo, même origine que le contenu),
aucun blocage côté client n'est possible. L'approche actuelle ne marche que tant que la pub
est pilotée par la config `applaunch` + FreeWheel.

## Publication

Outils & guides : `tools/package.mjs` (zip), `STORE.md` (Chrome Web Store), `EDGE.md`
(Edge Add-ons), `PRIVACY.md`. Bumper la version **à la fois** dans `package.json` et
`src/manifest.json`.
