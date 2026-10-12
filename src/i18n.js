// -----------------------------------------------------------------------------
// Every text the code produces, in the four languages of the Gladys interface.
// German says "du", Spanish "usted". The widget gets the language of the
// person looking at it; the scene texts, the action reports and the event
// names the container invents follow the `language` setting.
// -----------------------------------------------------------------------------

export const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/** Short texts, one table per language (same keys everywhere). */
export const TEXT = {
  en: {
    untitled: '(no title)',
    allDay: 'all day',
    today: 'Today',
    tomorrow: 'Tomorrow',
    syncButton: 'Sync now',
    loading: 'First download in progress…',
    noSharedCalendar: 'No shared calendar yet: share one in the integration page.',
    unreachable: 'Unreachable',
    added: 'Added',
    cancelled: 'Cancelled',
    rescheduled: 'Rescheduled',
    updated: 'Updated',
  },
  fr: {
    untitled: '(sans titre)',
    allDay: 'toute la journée',
    today: "Aujourd'hui",
    tomorrow: 'Demain',
    syncButton: 'Synchroniser',
    loading: 'Premier téléchargement en cours…',
    noSharedCalendar: "Aucun calendrier partagé : partagez-en un dans la page de l'intégration.",
    unreachable: 'Injoignable',
    added: 'Ajouté',
    cancelled: 'Annulé',
    rescheduled: 'Déplacé',
    updated: 'Modifié',
  },
  de: {
    untitled: '(ohne Titel)',
    allDay: 'ganztägig',
    today: 'Heute',
    tomorrow: 'Morgen',
    syncButton: 'Synchronisieren',
    loading: 'Erster Download läuft…',
    noSharedCalendar: 'Noch kein geteilter Kalender: Teile einen auf der Seite der Integration.',
    unreachable: 'Nicht erreichbar',
    added: 'Hinzugefügt',
    cancelled: 'Abgesagt',
    rescheduled: 'Verschoben',
    updated: 'Geändert',
  },
  es: {
    untitled: '(sin título)',
    allDay: 'todo el día',
    today: 'Hoy',
    tomorrow: 'Mañana',
    syncButton: 'Sincronizar',
    loading: 'Primera descarga en curso…',
    noSharedCalendar:
      'Aún no hay calendarios compartidos: comparta uno en la página de la integración.',
    unreachable: 'Inaccesible',
    added: 'Añadido',
    cancelled: 'Cancelado',
    rescheduled: 'Reprogramado',
    updated: 'Modificado',
  },
};

/** Why a download failed, by FeedError code (see src/fetcher.js). */
export const ERROR_TEXT = {
  en: {
    invalid_url: 'invalid address',
    http: (detail) => `the server answered HTTP ${detail}`,
    timeout: 'no answer within 30 s',
    network: (detail) => `network error (${detail})`,
    too_large: 'file larger than 20 MB',
    not_calendar: 'the address does not return an iCalendar file',
    parse: 'unreadable iCalendar file',
  },
  fr: {
    invalid_url: 'adresse invalide',
    http: (detail) => `le serveur a répondu HTTP ${detail}`,
    timeout: 'pas de réponse en 30 s',
    network: (detail) => `erreur réseau (${detail})`,
    too_large: 'fichier de plus de 20 Mo',
    not_calendar: "l'adresse ne renvoie pas un fichier iCalendar",
    parse: 'fichier iCalendar illisible',
  },
  de: {
    invalid_url: 'ungültige Adresse',
    http: (detail) => `der Server antwortete mit HTTP ${detail}`,
    timeout: 'keine Antwort innerhalb von 30 s',
    network: (detail) => `Netzwerkfehler (${detail})`,
    too_large: 'Datei größer als 20 MB',
    not_calendar: 'die Adresse liefert keine iCalendar-Datei',
    parse: 'iCalendar-Datei nicht lesbar',
  },
  es: {
    invalid_url: 'dirección no válida',
    http: (detail) => `el servidor respondió HTTP ${detail}`,
    timeout: 'sin respuesta en 30 s',
    network: (detail) => `error de red (${detail})`,
    too_large: 'archivo de más de 20 MB',
    not_calendar: 'la dirección no devuelve un archivo iCalendar',
    parse: 'archivo iCalendar ilegible',
  },
};

/** Report of the "Sync now" action and connection status lines. */
export const REPORT_TEXT = {
  en: {
    noAccount:
      'No user has enabled the integration yet: each user adds their calendars in "My calendars".',
    synced: (ok, total) => `${ok} of ${total} calendar(s) synchronized.`,
    failed: (name, user, error) => `${name} (${user}): ${error}`,
    statusFailing: (count) => `${count} calendar(s) unreachable, see the integration logs.`,
    started: 'Synchronization in progress: many calendars to write, it goes on in the background.',
  },
  fr: {
    noAccount:
      "Aucun utilisateur n'a encore activé l'intégration : chacun ajoute ses calendriers dans « Mes calendriers ».",
    synced: (ok, total) => `${ok} calendrier(s) sur ${total} synchronisé(s).`,
    failed: (name, user, error) => `${name} (${user}) : ${error}`,
    statusFailing: (count) =>
      `${count} calendrier(s) injoignable(s), voir les logs de l'intégration.`,
    started:
      'Synchronisation en cours : beaucoup de calendriers à écrire, elle continue en arrière-plan.',
  },
  de: {
    noAccount:
      'Noch niemand hat die Integration aktiviert: Jeder fügt seine Kalender unter „Meine Kalender“ hinzu.',
    synced: (ok, total) => `${ok} von ${total} Kalender(n) synchronisiert.`,
    failed: (name, user, error) => `${name} (${user}): ${error}`,
    statusFailing: (count) => `${count} Kalender nicht erreichbar, siehe die Logs der Integration.`,
    started:
      'Synchronisierung läuft: viele Kalender zu schreiben, sie läuft im Hintergrund weiter.',
  },
  es: {
    noAccount:
      'Ningún usuario ha activado aún la integración: cada uno añade sus calendarios en «Mis calendarios».',
    synced: (ok, total) => `${ok} de ${total} calendario(s) sincronizado(s).`,
    failed: (name, user, error) => `${name} (${user}): ${error}`,
    statusFailing: (count) =>
      `${count} calendario(s) inaccesible(s), consulte los registros de la integración.`,
    started:
      'Sincronización en curso: hay muchos calendarios que escribir, continúa en segundo plano.',
  },
};

export function pick(table, language) {
  return table[language] ?? table.en;
}

/** Why a feed failed, in `language`. */
export function errorText(error, language) {
  const table = pick(ERROR_TEXT, language);
  const entry = table[error?.code] ?? table.network;
  return typeof entry === 'function' ? entry(error?.detail ?? '?') : entry;
}

/** A multi-language object built from a function of the language. */
export function allLanguages(build) {
  return Object.fromEntries(Object.keys(LOCALES).map((language) => [language, build(language)]));
}
