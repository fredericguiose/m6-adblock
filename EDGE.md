# Publication sur Microsoft Edge Add-ons — guide

Edge est basé sur Chromium : **le même paquet** `release/m6-adblock-v1.0.0.zip`
(généré par `npm run package`) fonctionne tel quel. Aucune modification du code
ni du manifest n'est nécessaire.

**Avantage vs Chrome Web Store : l'inscription développeur est GRATUITE**
(pas de frais de 5 $) et la validation est en général plus rapide.

## 1. Prérequis (une fois)

1. Un **compte Microsoft** (gratuit — différent de ton compte Google bloqué).
2. S'inscrire au programme **Microsoft Edge Add-ons** :
   https://partner.microsoft.com/dashboard/microsoftedge/overview
   → accepter les conditions développeur (gratuit).

## 2. Générer le paquet

```bash
npm install
npm run package      # -> release/m6-adblock-v1.0.0.zip
```

## 3. Soumettre

1. Dashboard Edge → **Create new extension**.
2. **Upload package** → glisser `release/m6-adblock-v1.0.0.zip`.
3. Remplir la fiche : réutilise **les mêmes textes que `STORE.md`**
   (nom, description courte/détaillée, objectif unique, justification des
   permissions, catégorie `Tools`, langue Français).
4. **Politique de confidentialité** (requise) :
   `https://github.com/fredericguiose/m6-adblock/blob/main/PRIVACY.md`
5. Ajouter au moins une **capture d'écran** (1280×800 conseillé).
6. **Publish** → la soumission part en revue.

## Notes

- Les mêmes réserves que pour Chrome s'appliquent (marque « M6 », extension qui
  vise le contournement d'un détecteur) — voir la section « Risques de refus »
  de `STORE.md`. Le « (non officiel) » + l'icône générique limitent le risque.
- Edge accepte le manifest MV3, `declarativeNetRequest`, les content scripts
  `world: "MAIN"` et le `service_worker` à l'identique de Chrome : rien à
  adapter.
