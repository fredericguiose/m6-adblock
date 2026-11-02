# Changelog, builds et releases

## Activation par le mainteneur

Après fusion de cette configuration dans `main` :

1. Autoriser GitHub Actions dans le dépôt.
2. Dans **Settings → Actions → General → Workflow permissions**, activer
   **Allow GitHub Actions to create and approve pull requests**. Le bot crée
   des PR, mais ne les approuve pas et ne les fusionne pas lui-même.
3. Vérifier que les règles de branche permettent la fusion d'une PR de version
   après les contrôles et la revue habituels.

Aucun PAT ni secret de store n'est nécessaire : les workflows utilisent le
`GITHUB_TOKEN` du dépôt, avec les permissions déclarées par job. Une politique
GitHub d'organisation peut imposer une autorisation supplémentaire.

## Cycle automatique

1. Une contribution est fusionnée dans `main` avec un titre de squash ou un
   commit au format **Conventional Commits**, par exemple :
   - `fix: corrige le nettoyage de configuration` → version corrective ;
   - `feat: ajoute une fonctionnalité` → version mineure ;
   - `feat!: modifie une interface incompatible` → version majeure.
2. Release Please ouvre ou met à jour une **PR de version** : `CHANGELOG.md`,
   `package.json`, `package-lock.json`, `src/manifest.json` et son manifeste
   `.release-please-manifest.json` sont mis à jour ensemble.
3. Le workflow déclenche explicitement la CI de cette PR avec `workflow_dispatch`.
   Cela évite d'exiger un PAT : les événements ordinaires émis avec
   `GITHUB_TOKEN` ne déclenchent pas de nouveau workflow.
4. Après validation et fusion de la PR de version par le mainteneur, le bot crée
   le tag `vX.Y.Z` et une release **en brouillon**.
5. Dans le même workflow, un job vérifie les versions, exécute TypeScript et les
   tests, construit `release/m6-adblock-vX.Y.Z.zip`, le joint à la release, puis
   publie celle-ci. Un échec de build ne publie donc pas une nouvelle release vide.

Le build ne dépend pas d'un nouvel événement `push` de tag créé par le bot :
le job utilise directement les sorties de Release Please. Le changelog est
amorcé avec la version `1.0.2` déjà présente dans les sources ; les métadonnées
et la version courante du projet ne sont pas remplacées par celles du fork.

## CI et archives de développement

`.github/workflows/ci.yml` s'exécute sur les push de branche, les PR et les
lancements manuels. Il utilise Node.js 22 et exécute :

```bash
npm ci
npm run check:version
npm run typecheck
npm test
npm run package
```

Le ZIP installable est disponible dans les **Artifacts** du run pendant 14 jours,
sans ajout d'une seconde archive autour du ZIP. Les PR provenant d'un fork
s'exécutent avec des permissions en lecture seule, sans accès aux secrets de
publication. GitHub peut demander au mainteneur d'approuver leur premier run.

## Tags manuels et reprise après échec

Un tag poussé manuellement sous la forme `vX.Y.Z` déclenche aussi le build de
release. Il doit désigner un commit contenant cette automatisation et dont les
versions du package, du lockfile et du manifest Chrome correspondent au tag.
Pour une version manuelle, mettre aussi à jour le changelog et le manifeste de
Release Please. Le cycle par PR de version reste la méthode recommandée.

Pour reconstruire un tag existant après un échec : **Actions → Changelog et
releases → Run workflow**, sélectionner `main` et renseigner le champ `tag`.
Le workflow refuse les tags invalides et les versions désalignées. Une nouvelle
exécution remplace le ZIP du même nom ; elle ne change pas le code du tag.

La publication sur Chrome Web Store ou Edge Add-ons reste manuelle : utiliser
le ZIP de la release selon [STORE.md](STORE.md) ou [EDGE.md](EDGE.md).
