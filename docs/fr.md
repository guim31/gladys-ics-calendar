# Calendriers ICS

Faites entrer dans Gladys n'importe quel calendrier publié au format iCalendar (une adresse `.ics`) : votre
agenda Google par son adresse secrète, un calendrier Outlook ou iCloud publié, l'emploi du temps scolaire de
votre enfant, le calendrier des collectes de déchets de votre commune, les matchs de votre club, les jours
fériés… Chaque adresse devient un calendrier dans la vue **Calendrier** de Gladys, tenu à jour, et utilisable
par les scènes comme les calendriers que Gladys synchronise elle-même.

- **Chaque utilisateur ajoute ses propres calendriers**, dans le bloc **Mes calendriers** de la page de
  l'intégration : jusqu'à cinq adresses par personne. Les calendriers restent privés tant que leur
  propriétaire ne les partage pas avec le foyer.
- Les **événements récurrents** (tous les lundis, le premier mardi du mois…), les exceptions, les occurrences
  déplacées ou annulées, les événements sur la journée entière et les fuseaux horaires (y compris ceux
  d'Outlook et d'Exchange) sont pris en charge.
- Un **widget** de tableau de bord, deux **déclencheurs de scène** (un événement modifié, un calendrier
  injoignable) et une **action de scène** (trouver le prochain événement) complètent ce que Gladys offre déjà.

> Testée par sa suite de tests automatiques et sur de vrais fichiers de calendrier (Google, Apple, Outlook,
> Éducation nationale), pas encore sur beaucoup de Gladys réelles : vos retours sont les bienvenus sur le
> forum Gladys ou dans les issues GitHub.

## Ce qu'il vous faut

- Gladys Assistant 5.2.0 ou plus récent.
- L'adresse `.ics` de chaque calendrier (voir plus bas). Aucun compte à créer, aucune clé d'API.
- Un accès à Internet depuis Gladys, pour télécharger les calendriers.

## Installer et ajouter vos calendriers

1. Installez l'intégration : **Intégrations → Installer depuis GitHub**, adresse
   `https://github.com/guim31/gladys-ics-calendar`.
2. Ouvrez sa page. Chaque utilisateur de Gladys, pas seulement l'administrateur, y voit le bloc **Mes
   calendriers**.
3. Collez jusqu'à cinq adresses, chacune avec un nom facultatif (sinon, le nom que porte le calendrier dans le
   fichier est repris), puis cliquez sur **Activer pour moi**. Les adresses `webcal://` sont acceptées telles
   quelles.
4. Après quelques secondes, vos calendriers apparaissent sous le formulaire. Pour chacun :
   - **Synchroniser ce calendrier** : désactivez-le pour ne plus le télécharger (ses événements sont retirés
     de Gladys) ;
   - **Partager avec le foyer** : le calendrier devient visible par tous, **et alors seulement** il peut
     déclencher des scènes et apparaître sur le widget du tableau de bord.

Les adresses sont enregistrées comme des secrets : Gladys ne les réaffiche jamais. Pour en changer une, tapez
la nouvelle adresse dans son champ et enregistrez : un nouveau calendrier est créé (privé, comme tout nouveau
calendrier) et l'ancien est supprimé. Pour retirer un calendrier, tapez un caractère dans le champ de son
adresse, effacez-le, puis enregistrez.

### Où trouver l'adresse .ics

- **Google Agenda** : sur un ordinateur, **Paramètres → Paramètres de mes agendas →** votre agenda **→
  Intégrer l'agenda → Adresse secrète au format iCal**. Cette adresse donne accès en lecture à tout votre
  agenda : gardez-la pour vous. Un agenda public a aussi une **Adresse publique au format iCal**.
- **Outlook / Microsoft 365** : **Paramètres → Calendrier → Calendriers partagés → Publier un calendrier**,
  choisissez le calendrier et « Peut afficher tous les détails », puis copiez le lien **ICS**.
- **iCloud** : dans l'app Calendrier, partagez le calendrier en **Calendrier public** et copiez son lien
  (`webcal://…`).
- **Portails scolaires, mairies, clubs** : cherchez « Exporter », « S'abonner », « iCal » ou « ICS ». Pronote,
  par exemple, propose un export iCal de l'emploi du temps quand l'établissement l'a activé.
- **Nextcloud et autres serveurs qui demandent un mot de passe** : écrivez-le dans l'adresse,
  `https://utilisateur:motdepasse@serveur/…` ; il est envoyé comme une authentification standard.

## Réglages de l'administrateur

Dans l'onglet **Configuration**, pour tous les utilisateurs :

- **Télécharger toutes les** : 15, 30 ou 60 minutes (30 par défaut). Un calendrier inchangé ne coûte presque
  rien : l'intégration demande au serveur si le fichier a changé et ne le télécharge que dans ce cas, et une
  fois par jour en entier.
- **Afficher les événements jusqu'à** : jusqu'où les événements récurrents sont dépliés, de 3 à 24 mois
  (12 par défaut). Les événements de plus de 90 jours sont retirés de Gladys.
- **Surveiller les changements sur (jours)** : l'horizon du déclencheur « Événement modifié » (7 jours par
  défaut).
- **Injoignable après (heures)** : le délai avant le déclencheur « Calendrier injoignable » (6 heures par
  défaut).
- **Langue des textes des scènes** : les dates et libellés transmis aux scènes, et le nom donné aux
  événements sans titre.

Le bouton **Synchroniser maintenant** télécharge tout de suite tous les calendriers et dit lesquels ont
échoué, et pourquoi.

## Dans Gladys

Les calendriers apparaissent dans la vue **Calendrier** comme les autres, avec leur propre couleur. Tout ce
que Gladys fait avec ses calendriers fonctionne avec eux, dès qu'ils sont **partagés** :

- le déclencheur **Un évènement dans le calendrier arrive** (par exemple 15 minutes avant le début d'un
  événement dont le nom contient « Emballages ») ;
- les actions **Condition sur un évènement d'un calendrier** et **Récupérer les évènements d'un calendrier**
  (aujourd'hui, demain, les prochaines heures) ;
- la pastille calendrier du tableau de bord et l'assistant.

Gladys n'écrit jamais dans vos calendriers : un événement créé ou modifié dans Gladys reste dans Gladys ; le
téléchargement suivant ramène le contenu du calendrier d'origine.

## Widget du tableau de bord

**Prochains événements** liste les événements des calendriers partagés (huit au plus) : aujourd'hui, demain,
puis les jours suivants, avec l'heure, et le nom du calendrier quand plusieurs sont affichés. Touchez un
événement pour lire son lieu, sa description et ouvrir son lien.

- **Calendriers** : noms de calendriers partagés, séparés par des virgules ; vide pour tous.
- **Période** : aujourd'hui, 3, 7, 14 ou 31 jours.

Un calendrier qui ne se télécharge plus s'affiche en rouge ; le bouton **Synchroniser** retélécharge tout.

## Déclencheurs de scène

Les deux déclencheurs ne concernent que les calendriers **partagés**. Leur filtre **Calendrier** prend le nom
exact d'un calendrier (vide : n'importe lequel).

### Événement modifié dans un calendrier

Se déclenche quand, entre deux téléchargements, un événement des prochains jours (7 par défaut) a été
**ajouté**, **annulé**, **déplacé**, ou **renommé ou changé de lieu**. Le filtre **Changement** n'en garde que
certains. Transmis à la scène : l'événement, son début (« mardi 13 octobre, 10:00 »), les jours avant lui, son
lieu, le changement et le calendrier.

Le premier téléchargement après un redémarrage de l'intégration sert de référence : les changements faits
pendant qu'elle était arrêtée ne sont pas signalés. Quand plus de dix événements changent d'un coup (un
calendrier exporté à nouveau), rien ne se déclenche.

### Calendrier injoignable

Se déclenche une fois quand un calendrier partagé n'a pas pu être téléchargé depuis le nombre d'heures réglé
(un lien expiré, une adresse régénérée dans Google, un serveur en panne). Transmis : le calendrier, son
propriétaire, l'erreur et les heures écoulées. Il ne se déclenche à nouveau qu'après le retour du calendrier.

## Action de scène « Trouver le prochain événement d'un calendrier »

Cherche le prochain événement des calendriers partagés dont le titre contient un texte (sans tenir compte des
majuscules ni des accents), aussi loin soit-il, un événement en cours compris. Filtre **Calendrier**
facultatif. Résultats pour les étapes suivantes : événement trouvé (1 oui, 0 non), événement, début, jours
avant l'événement (0 aujourd'hui, -1 si rien n'est trouvé), lieu et calendrier.

## Exemples de scènes

- **Collecte des déchets** : déclencheur **Déclenchement programmé** tous les soirs à 19:00, action **Trouver
  le prochain événement d'un calendrier** avec « emballages », condition « jours avant l'événement = 1 », puis
  **Envoyer un message** « Sortez la poubelle jaune ce soir ».
- **Cours annulé** : déclencheur **Événement modifié dans un calendrier** sur le calendrier « École »,
  changement « Annulé », puis **Envoyer un message** « {{événement}} de {{début}} est annulé ».
- **Lien expiré** : déclencheur **Calendrier injoignable**, puis **Envoyer un message** « Le calendrier
  {{calendrier}} de {{propriétaire}} ne se télécharge plus : {{erreur}} ».

## Dépannage

- **Mon calendrier n'apparaît pas sous le formulaire** : l'adresse est fausse ou le serveur la refuse.
  L'administrateur voit la raison avec **Synchroniser maintenant**, et dans les logs de l'intégration (où
  l'adresse est réduite au nom de son serveur).
- **« L'adresse ne renvoie pas un fichier iCalendar »** : le lien mène à une page web (une page de
  connexion, une page de partage HTML). Copiez le lien destiné aux applications de calendrier (iCal, ICS,
  webcal).
- **HTTP 404 sur un agenda Google** : l'adresse secrète a été réinitialisée dans Google ; collez la nouvelle.
- **Le calendrier n'est ni sur le widget ni dans les scènes** : partagez-le avec le foyer dans **Mes
  calendriers**.
- **Les événements sont décalés d'une heure** : vérifiez le fuseau horaire de Gladys (**Paramètres →
  Système**) ; l'intégration s'en sert pour les dates.
- **Un changement met du temps à apparaître** : Google rafraîchit lui-même ses adresses secrètes, parfois
  seulement toutes les quelques heures ; **Synchroniser maintenant** permet de vérifier côté intégration.

## Limites

- Lecture seule : Gladys n'écrit jamais dans le calendrier d'origine.
- Cinq calendriers par utilisateur, 9 000 événements par calendrier (au-delà, les événements passés les plus
  anciens sont laissés de côté), des occurrences de 90 jours en arrière à 24 mois en avant au plus.
- Un fichier de calendrier de plus de 20 Mo, ou un serveur qui répond en plus de 30 secondes, est refusé.
- Le cœur de Gladys accepte 30 écritures de calendrier par minute : avec beaucoup de gros calendriers, la
  première synchronisation prend quelques minutes.
- Les calendriers qui demandent une connexion autre qu'un mot de passe dans l'adresse (comptes Google ou
  Microsoft par OAuth) ne sont pas pris en charge : utilisez leur adresse publiée (`.ics`).
- Les changements d'un événement sont vus au téléchargement suivant : le déclencheur va aussi vite que
  **Télécharger toutes les**.

## Confidentialité et sécurité

- Les adresses sont des secrets enregistrés par Gladys dans le compte de chaque utilisateur ; l'intégration
  n'en garde aucune sur disque, ne les écrit jamais dans ses logs (seulement le nom du serveur) et identifie
  les calendriers par une empreinte à sens unique.
- L'intégration ne garde, dans son volume `/data`, que la date depuis laquelle chaque calendrier échoue (ni
  adresse, ni événement).
- Les calendriers privés restent à leur propriétaire : le widget et les scènes ne voient que les calendriers
  partagés.

## Crédits

Lecture des fichiers iCalendar : [node-ical](https://github.com/jens-maus/node-ical) (Apache-2.0). Fichiers de
test repris de node-ical, d'[ical](https://github.com/allenporter/ical) d'Allen Porter et de
[Home Assistant](https://github.com/home-assistant/core) (Apache-2.0), dont l'intégration Remote Calendar a
inspiré celle-ci. Sans lien avec Google, Microsoft, Apple, Index Éducation ni Home Assistant.
