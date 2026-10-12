// -----------------------------------------------------------------------------
// Feed addresses. A published calendar address is often a SECRET (Google's
// "secret address in iCal format", an Outlook or Pronote link carrying a
// token): it is stored by Gladys in the user's account only, it never reaches
// a log, a message or a scene, and the ids derived from it are one-way hashes.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

/** One-way, short and stable digest of a string (ids, change detection). */
export function digest(text, length = 16) {
  return createHash('sha256').update(text).digest('hex').slice(0, length);
}

/**
 * Turn what the user pasted into a fetchable address: `webcal://` and
 * `webcals://` (the calendar-app scheme of iCloud, Outlook, school portals)
 * become `https://`, blanks are removed, anything that is not http(s) is
 * refused. Credentials written in the address (`https://user:pass@host/…`,
 * a Nextcloud private export) are moved to a Basic authorization header:
 * fetch() refuses an address carrying them.
 * @param {string} raw
 * @returns {{ url: string, authorization?: string } | null} null when invalid
 */
export function normalizeFeedUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.replace(/\s+/g, '').replace(/^webcals?:\/\//i, 'https://');
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    return null;
  }
  let authorization;
  if (parsed.username || parsed.password) {
    const user = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
    parsed.username = '';
    parsed.password = '';
  }
  parsed.hash = '';
  return authorization ? { url: parsed.href, authorization } : { url: parsed.href };
}

/**
 * The only form of an address that may be logged or shown: its host. The
 * path and the query carry the secret part (Google:
 * `/calendar/ical/<id>/private-<token>/basic.ics`).
 * @param {string} raw
 */
export function maskUrl(raw) {
  const normalized = normalizeFeedUrl(raw);
  if (!normalized) {
    return '(invalid address)';
  }
  const { protocol, host } = new URL(normalized.url);
  return `${protocol}//${host}/…`;
}

/** The host name, a readable default name for a feed without one. */
export function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Stable id of a feed for one user: a digest of the normalized address
 * (credentials included, so two accounts on the same server stay apart).
 * Changing the address creates a new calendar in Gladys — private, like every
 * new calendar — instead of pouring another feed into a calendar the user may
 * have shared with the household.
 */
export function feedId(normalized) {
  return `f${digest(`${normalized.authorization ?? ''} ${normalized.url}`)}`;
}
