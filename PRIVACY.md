# Politique de confidentialité — M6 Direct Anti-Pub

_Dernière mise à jour : 29 juin 2026_

## Résumé

L'extension **M6 Direct — Anti-Pub** ne collecte, ne stocke et ne transmet
**aucune donnée personnelle**. Aucune donnée n'est envoyée à l'auteur ni à un
tiers. Tout le traitement se fait **localement**, dans votre navigateur.

## Ce que fait l'extension

- Bloque les requêtes publicitaires et de traçage sur les domaines de M6
  (`m6.fr`, `6play.fr`, `m6web.fr`) via `declarativeNetRequest`.
- Modifie en mémoire la configuration du lecteur vidéo pour désactiver les
  publicités (aucune donnée n'est lue ni exfiltrée).
- Refuse automatiquement le consentement publicitaire (CMP) sur ces domaines.
- Supprime certains cookies de traçage tiers déjà déposés sur ces domaines.

## Données traitées

| Donnée | Usage | Transmission |
|--------|-------|--------------|
| Requêtes réseau (domaines M6) | Décidées localement : bloquées ou non | Aucune |
| Cookies de traçage (domaines M6) | Suppression locale | Aucune |
| Configuration du lecteur | Modifiée en mémoire | Aucune |

Aucune télémétrie, aucun analytics, aucun serveur distant.

## Permissions et justifications

- **`declarativeNetRequest`** : appliquer les règles de blocage pub/traceurs.
- **`cookies`** + accès aux hôtes M6 : supprimer localement les cookies de
  traçage tiers. Aucun cookie n'est lu à des fins de collecte.
- **`storage`** : réservé à d'éventuels réglages locaux de l'extension.
- **Accès aux hôtes** (`m6.fr`, `6play.fr`, `m6web.fr` et régies pub) : limiter
  strictement l'action de l'extension à ces sites.

## Contact

Frederic Guiose — <frederic@portalstudio.fr>
Code source : https://github.com/fredericguiose/m6-adblock
