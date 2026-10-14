# 3GCOM Dispatch — Plateforme de Pilotage SAV Fibre Optique (Maroc Telecom)

Application web de dispatching opérationnel et de traçabilité terrain pour 3GCOM, sous-traitant de Maroc Telecom. Elle remplace la gestion dispersée sur Excel et WhatsApp par un moteur d'affectation intelligent, un suivi d'avancement en temps réel, un canal Telegram bidirectionnel pour 40 techniciens, et un historique append-only inaltérable.

## Arbitrages Métier Validés

> [!IMPORTANT]
> Les trois décisions fondamentales suivantes ont été arbitrées en Phase 1 et constituent le socle du moteur :

- **Règle de Deuxième Visite (§5)** : 
  - Si le précédent échec est d'origine **externe** (*client injoignable, client absent, adresse introuvable, rendez-vous client décalé*), le moteur propose **le même technicien**, car il connaît déjà l'itinéraire, les repères locaux et l'environnement d'accès.
  - Si le précédent échec est d'origine **technique** (*problème câble/soudure, saturation jarretière, défaut MSAN/répartiteur, besoin configuration centrale, matériel non conforme*), le moteur affecte un **technicien différent** pour apporter un regard neuf et des compétences ciblées.
  - Dans tous les cas, le technicien reçoit l'historique complet : motif précédent, date, actions déjà menées et nom du premier intervenant.
- **Canal Telegram & Testabilité (§6 & §10)** :
  - Support natif du Bot Telegram officiel (Token BotFather configurable par le manager avec file d'attente résiliente hors-ligne).
  - Intégration d'une **console de simulation Telegram mobile** directement accessible dans l'application, reproduisant fidèlement l'écran smartphone du technicien, les messages formatés et les boutons d'action instantanés.
- **Régulation de Charge (§5)** :
  - Recommandation dynamique équilibrée sans plafond dur bloquant, avec avertisseurs visuels de surcharge (au-delà de 6 interventions/jour) et indicateurs d'encours en temps réel.

---

## 1. Vue d'Ensemble & Périmètre Fonctionnel

### Qu'accomplit la plateforme ?
La plateforme transforme un processus manuel fragmenté (fichiers Excel quotidiens, échanges informels WhatsApp sans trace, perte d'historique) en une chaîne logistique numérique robuste et auditable :
1. **Cloisonnement strict par secteur** : Un orienteur ne voit et n'agit que sur son secteur géographique (contrôlé côté serveur à chaque requête d'API).
2. **Import Excel ultra-tolérant** : Détection des colonnes par analyse sémantique (alias d'en-têtes), import partiel des lignes valides avec rapport d'anomalies, dédoublonnage et rattachement des historiques de visite.
3. **Moteur de dispatch assisté** : Calcul automatique des affectations respectant la priorité (Deuxième visite -> Zone technique -> Charge du jour -> Disponibilité), prévisualisation par l'orienteur, réaffectation manuelle au clic et validation groupée.
4. **Canal Telegram sans perte d'information** : Messages structurés avec boutons inline fermés (*En route, Sur place, Terminé, Échec + liste close de motifs + photos/notes*).
5. **Tableaux de bord opérationnels et managériaux** : Dénominateurs basés sur l'encours actif, contrôle de somme strict sur chaque ventilation d'état, export Excel universel.

### Rôles Utilisateurs
- **Orienteur (Rôle opérationnel)** : Pilote son secteur, charge les fichiers Excel, affine et valide le dispatch, suit l'avancement minute par minute de ses techniciens, traite les blocages et réinterventions.
- **Manager (Rôle transverse)** : Dispose d'une visibilité consolidée sur l'ensemble des secteurs du Royaume, gère le référentiel central (secteurs, zones, techniciens, comptes orienteurs), configure le bot Telegram et analyse la performance globale (taux de passage, délais, échecs récurrents).
- **Technicien (Acteur terrain)** : Aucun accès direct à l'interface web administrative. Il interagit exclusivement via son bot Telegram (ou le simulateur de test).

---

## 2. Modèle de Données Relationnel (Append-Only)

Le schéma repose sur une séparation stricte entre les **entités de référence**, les **dossiers/tickets**, et la **table d'événements append-only** dont découlent tous les états calculés.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RÉFÉRENTIEL GLOBAL                              │
├────────────────────┬────────────────────┬──────────────────────────────┤
│      SECTORS       │  TECHNICAL_ZONES   │         TECHNICIANS          │
│ - id (PK)          │ - id (PK)          │ - id (PK)                    │
│ - code, name       │ - sector_id (FK)   │ - sector_id (FK)             │
│ - created_at       │ - msan_code, label │ - full_name, normalized_name │
│                    │ - created_at       │ - phone, telegram_chat_id    │
│                    └─────────┬──────────┘ - is_active                  │
│                              │            └──────────────┬─────────────┘
│                              │                           │
│     ZONE_ALIASES             │            TECH_ZONES     │
│ - id (PK)                    │         - technician_id   │
│ - raw_label (unique)         │         - technical_zone_id
│ - technical_zone_id (FK)     │
└──────────────────────────────┼───────────────────────────┼─────────────┘
                               │                           │
┌──────────────────────────────▼───────────────────────────▼─────────────┐
│                         TICKETS & DOSSIERS                             │
├────────────────────────────────────────────────────────────────────────┤
│ TICKETS                                                                │
│ - id (PK, UUID)                                                        │
│ - ticket_number (Unique index, e.g. "REC-2026-XXXX")                   │
│ - client_number (Identifiant abonné)                                   │
│ - client_name, client_phone, client_address                            │
│ - raw_zone_text (Texte brut du fichier Excel)                          │
│ - technical_zone_id (FK nullable si zone à rattacher)                  │
│ - sector_id (FK nullable si zone non identifiée)                       │
│ - registered_at (Date/heure enregistrement réclamation, UTC)           │
│ - visit_count (Nombre de passages cumulés : 1, 2, ...)                 │
│ - current_assigned_tech_id (FK nullable, cache de projection)          │
│ - current_status (Calculé : PENDING_ASSIGN, ASSIGNED, EN_ROUTE, ...)   │
│ - is_closed (Calculé : 0 ou 1)                                         │
│ - created_at, updated_at                                               │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │ 1
                               │
                               │ *
┌──────────────────────────────▼─────────────────────────────────────────┐
│              HISTORIQUE APPEND-ONLY (AUCUNE MODIFICATION)              │
├────────────────────────────────────────────────────────────────────────┤
│ TICKET_EVENTS                                                          │
│ - id (PK, auto-increment)                                              │
│ - ticket_id (FK -> TICKETS.id)                                         │
│ - event_type (IMPORT, PROPOSED, ASSIGNED, REASSIGNED,                   │
│               TELEGRAM_SENT, EN_ROUTE, ON_SITE, COMPLETED, FAILED)     │
│ - actor_role (SYSTEM, DISPATCHER, MANAGER, TECHNICIAN)                 │
│ - actor_id (FK vers users.id ou technicians.id)                        │
│ - technician_id (FK nullable, technicien concerné)                     │
│ - failure_category (EXTERNAL vs TECHNICAL, nullable)                   │
│ - failure_reason (client_unreachable, cable_fault, missing_hw...)      │
│ - notes (Commentaire textuel)                                          │
│ - photo_url (Preuve photo transmise par Telegram)                      │
│ - payload_json (Détails bruts / métadonnées complètes)                  │
│ - created_at (Timestamp précis UTC)                                    │
└────────────────────────────────────────────────────────────────────────┘
```

### Table des Événements (`ticket_events`) — L'Invariant Maître
Toute transition d'état physique ou administratif est une ligne insérée dans `ticket_events` :
1. `IMPORT` : Ticket créé ou remis à jour lors d'un chargement Excel.
2. `PROPOSED` : Suggestion formulée par le moteur d'affectation automatique.
3. `ASSIGNED` : Validation de l'affectation par l'orienteur.
4. `REASSIGNED` : Modification manuelle de l'affectation par l'orienteur (avec horodatage et auteur).
5. `TELEGRAM_QUEUED` / `TELEGRAM_SENT` : Ordre transmis au canal Telegram du technicien.
6. `EN_ROUTE` : Le technicien clique sur le bouton "En route".
7. `ON_SITE` : Le technicien clique sur "Sur place" (arrivée chez le client).
8. `COMPLETED` : Clôture avec succès de l'intervention.
9. `FAILED` : Échec déclaré avec classification automatique (`EXTERNAL` vs `TECHNICAL`) et motif normé.

### Déduction Dynamique du Statut (§8.2)
Le statut affiché d'un ticket est **toujours** le résultat de la fonction de réduction sur son historique d'événements :
- Si dernier événement = `FAILED` -> Statut **Échec (SAV à replanifier)**.
- Si dernier événement = `COMPLETED` -> Statut **Clôturé avec succès**.
- Si dernier événement = `ON_SITE` -> Statut **Sur place**.
- Si dernier événement = `EN_ROUTE` -> Statut **En route**.
- Si dernier événement = `ASSIGNED` ou `REASSIGNED` ou `TELEGRAM_SENT` -> Statut **Affecté / En attente départ**.
- Si aucun assignement validé ou zone inconnue -> Statut **À affecter** ou **Zone à rattacher**.

---

## 3. Architecture Technique & Cloisonnement

```
┌───────────────────────────────────────────────────────────────────────────┐
│                          NAVIGATEUR / CLIENT WEB                          │
│               React 19 + Tailwind CSS + Lucide Icons + Motion             │
├─────────────────────┬───────────────────────┬─────────────────────────────┤
│  ESPACE ORIENTEUR   │    ESPACE MANAGER     │     SIMULATEUR TELEGRAM     │
│  - Dispatch Journalier│ - Vision Multi-Secteurs│ - Écran Smartphone Mobile  │
│  - Suivi Avancement │ - Gestion Référentiel │ - Clavier boutons Inline    │
│  - Gestion Files    │ - Dédoublonnage Noms  │ - Échec & Motifs structurés │
│  - Import Excel     │ - Paramètres Bot      │ - Queue hors-ligne          │
└──────────┬──────────┴───────────┬───────────┴──────────────┬──────────────┘
           │                      │                          │
           │ HTTP (Session Auth + Sector-Scope Headers)      │
           ▼                      ▼                          ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                      SERVEUR NODE.JS / EXPRESS                            │
├───────────────────────────────────────────────────────────────────────────┤
│ - Middleware Auth & Cloisonnement Strict :                                │
│     req.user.role === 'DISPATCHER' => force sector_id = req.user.sectorId │
│     req.user.role === 'MANAGER'    => accès multi-secteurs autorisé       │
│ - Moteur d'Import Excel résilient (alias sémantiques, rapport d'erreurs)  │
│ - Moteur de Dispatch Heuristique (Deuxième visite, Zone, Charge, Dispo)   │
│ - Passerelle Bot Telegram (Polling / Webhook + queue tampon mémoire)      │
│ - Contrôle de somme et réducteur d'événements (Append-Only)               │
├───────────────────────────────────────────────────────────────────────────┤
│ Stockage Relationnel SQLite (via Better-SQLite3 / SQL standardisé)        │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Nomenclature Complète des Écrans

### 1. Authentification & Sécurité
- **Écran de Connexion (`/login`)** : Formulaire sobre d'authentification avec sélection rapide des profils de démonstration (Orienteur Casablanca-Nord, Orienteur Rabat-Salé, Manager Général).

### 2. Espace Orienteur (Cloisonné à son secteur géographique)
- **Tableau de Bord & Dispatch du Jour (`/orienteur/dispatch`)** :
  - Barre de contrôle avec somme stricte : Total tickets, Affectés, En route, Sur place, Terminés, En échec, Sans réponse (>2h).
  - Zone de prévisualisation du dispatch automatique proposé (badge 2ème visite, technicien recommandé, score de charge).
  - Tableau interactif avec réaffectation directe via menu déroulant filtré sur les techniciens disponibles de la zone.
  - Bouton d'action primaire : "Valider et envoyer aux techniciens sur Telegram".
- **Tableau de Suivi en Temps Réel (`/orienteur/suivi`)** :
  - Vue détaillée des interventions en cours avec horodatage Africa/Casablanca.
  - Cartouches de charge par technicien (jauge d'interventions, seuil de surcharge à 6).
  - Alertes d'inactivité : mise en surbrillance des tickets envoyés sans réponse du technicien depuis plus de 2 heures.
- **Importateur de Fichiers Excel (`/orienteur/import`)** :
  - Glisser-déposer de fichier `.xlsx` ou `.ods`.
  - Analyse sémantique des colonnes avec prévisualisation des 10 premières lignes interprétées.
  - Rapport d'import exhaustif (lignes importées, doublons identifiés, lignes rejetées avec cause précise).
- **Files Spéciales d'Intervention (`/orienteur/files`)** :
  - File 1 : *Tickets à affecter manuellement* (aucune couverture de zone ou technicien disponible).
  - File 2 : *Deuxièmes visites en cours* (synthèse du motif précédent et statut du nouvel intervenant).

### 3. Espace Manager (Vision Royaume & Paramétrage)
- **Tableau de Bord Global multi-secteurs (`/manager/dashboard`)** :
  - Comparatif sectoriel (volumes reçus, taux de réalisation sur l'encours actif, délai moyen d'intervention).
  - Matrice des techniciens : volume traité, taux de succès au 1er passage, taux de réintervention.
  - Export Excel complet en un clic de l'ensemble des données consolidées.
- **Gestion du Référentiel (`/manager/referentiel`)** :
  - Onglet Secteurs : création et assignation des comptes orienteurs.
  - Onglet Zones Techniques & MSAN : liste des répartiteurs et outil de rattachement des libellés inconnus (`raw_label` -> Zone canonique).
  - Onglet Techniciens : fiche technicien, téléphone, identifiant Telegram, zones couvertes, statut actif/inactif.
  - Outil de détection et de fusion des doublons de techniciens (ex: `HAMID KHALID` et `hamid Khalid`, filtrage des faux comptes).
- **Configuration & Monitoring Telegram (`/manager/telegram`)** :
  - Configuration du Token Bot Telegram et test de connectivité.
  - Moniteur de la file d'attente d'envoi et historique des requêtes bot.

### 4. Console Mobile / Simulateur Technicien (Accessible en overlay ou panneau latéral)
- **Simulateur Telegram Smartphone** :
  - Permet de tester en direct le rôle du technicien sans smartphone physique.
  - Réception des fiches d'interventions (avec mention 2ème visite).
  - Boutons interactifs réels : [En route] -> [Sur place] -> [Terminé] ou [Échec].
  - Modalité d'échec avec sélection du motif (client absent, câble rompu...) et photo simulée.

---

## 5. Déroulement de l'Implémentation par Incréments Testables

Conformément à vos directives (§11), la réalisation se fera pas à pas avec vérification systématique de chaque brique :

1. **Jalon 1 — Socle Relationnel & Référentiel** : Mise en place de la base de données relationnelle, modèles TypeScript, tables des secteurs, zones, techniciens et outil de normalisation des libellés.
2. **Jalon 2 — Moteur d'Import Excel Tolérant** : Analyseur de colonnes flexible, gestion des décalages, rapport d'importation précis et détection des doublons/deuxièmes visites.
3. **Jalon 3 — Moteur de Dispatch Intelligent** : Algorithme à 4 niveaux (Règle validée 2ème visite externe/technique, couverture de zone, équilibrage de charge, disponibilité).
4. **Jalon 4 — Écran & Expérience Orienteur** : Tableau de bord cloisonné par secteur, validation du dispatch, réaffectation manuelle et suivi en temps réel.
5. **Jalon 5 — Passerelle Telegram & Console Simulateur** : Bot Telegram résilient avec file d'attente hors-ligne et console mobile interactive pour exécuter le cycle de vie complet.
6. **Jalon 6 — Tableaux de Bord Manager & Exports Excel** : Vision consolidée multi-secteurs, contrôle de somme strict sur l'encours actif et exports universels `.xlsx`.
