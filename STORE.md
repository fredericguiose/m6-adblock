# Publication sur le Chrome Web Store — guide

Le paquet à uploader est généré par `npm run package` →
**`release/m6-adblock-v1.0.0.zip`** (manifest à la racine, icônes incluses).

> ⚠️ Je (l'auteur du code) ne peux pas soumettre à ta place : il faut **ton**
> compte développeur Google et le paiement des frais. Les étapes ci-dessous se
> font dans la console développeur. Tous les textes sont prêts à copier-coller.

## 1. Prérequis (une fois)

1. Compte Google.
2. S'inscrire sur la **Chrome Web Store Developer Dashboard** :
   https://chrome.google.com/webstore/devconsole
3. Payer les **frais uniques de 5 $** (inscription développeur).

## 2. Générer / régénérer le paquet

```bash
npm install
npm run package      # -> release/m6-adblock-v1.0.0.zip
```

## 3. Créer l'élément et uploader

1. Dashboard → **Add new item** → glisser le `.zip`.
2. Remplir la fiche avec les textes ci-dessous.
3. Renseigner l'URL de la **politique de confidentialité** (voir §5).
4. **Save draft** → **Submit for review**.

## 4. Textes de la fiche (prêts à copier)

**Nom** (≤ 45 car.)
```
M6 Direct – Anti-Pub (non officiel)
```

**Description courte** (≤ 132 car.)
```
Bloque les pubs et le détecteur d'adblock du direct M6/6play, refuse le tracking. Local, sans collecte de données. Non officiel.
```

**Description détaillée**
```
M6 Direct – Anti-Pub supprime les publicités du direct M6 / 6play / M6+ et
neutralise le détecteur d'adblock du lecteur, sans casser la lecture.

Fonctionnalités :
• Désactive l'initialisation des publicités vidéo (préroll, coupures).
• Neutralise la détection d'adblock du lecteur.
• Bloque les domaines de régie et de traçage (uniquement sur les sites M6).
• Refuse automatiquement le consentement publicitaire (CMP).
• Supprime les cookies de traçage tiers déjà déposés.

Confidentialité : tout se passe localement dans votre navigateur. Aucune
donnée n'est collectée, stockée ou transmise.

Extension indépendante et NON OFFICIELLE, sans aucun lien avec le groupe M6.
Usage strictement personnel.

Code source ouvert (MIT) : https://github.com/fredericguiose/m6-adblock
```

**Catégorie** : `Tools` (ou `Functionality & UI`)
**Langue** : Français

**Déclaration d'objectif unique** (single purpose, demandée par Google)
```
Bloquer les publicités et les traceurs sur les sites de M6 (m6.fr, 6play.fr,
m6web.fr) et y refuser le consentement publicitaire.
```

**Justification des permissions**
```
declarativeNetRequest : appliquer les règles de blocage pub/traceurs.
cookies : supprimer localement les cookies de traçage tiers sur les domaines M6.
storage : stocker d'éventuels réglages locaux.
Accès aux hôtes : limiter l'action de l'extension aux seuls sites M6 et régies.
```

**Données utilisateur** : cocher « **Je ne collecte aucune donnée utilisateur** »
et certifier la conformité aux règles du programme développeur.

## 5. Politique de confidentialité (URL requise)

Le fichier `PRIVACY.md` du dépôt fait office de politique. URL utilisable :
```
https://github.com/fredericguiose/m6-adblock/blob/main/PRIVACY.md
```
(ou active GitHub Pages pour une URL plus propre).

## 6. Captures d'écran (obligatoires)

Au moins **1 capture 1280×800** (ou 640×400). Suggestion : le direct M6 qui
joue sans pub, avec la pastille « M6 Anti-Pub ✅ » visible.

## ⚠️ Risques de refus à connaître (honnête)

1. **Marque « M6 »** : utiliser le nom/logo d'un tiers peut être refusé pour
   atteinte à la marque ou risque de confusion. Le « (non officiel) » et le
   disclaimer réduisent le risque sans l'éliminer. Une icône générique (déjà
   le cas ici) plutôt que le logo M6 est préférable.
2. **Contournement de détection** : Google autorise les bloqueurs de pub
   génériques, mais une extension ciblant explicitement le contournement du
   détecteur d'un diffuseur peut être jugée non conforme. Mettre l'accent sur
   le blocage pub/traceurs et la confidentialité dans la fiche.
3. **Manifest V3 / declarativeNetRequest** : conforme (c'est le cas ici).

Si le but est surtout un usage perso/partage entre proches, l'installation en
**mode développeur** (charger `dist/`) ou la distribution du `.zip` via GitHub
Releases évite complètement la procédure du store.
```
