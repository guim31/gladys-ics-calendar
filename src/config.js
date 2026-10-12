// -----------------------------------------------------------------------------
// Configuration: the admin settings (manifest `config_schema`) and the
// per-user account (manifest `account_schema`, the "My calendars" block).
//
// DEFAULT_CONFIG mirrors the `default` values of the manifest (checked by
// test/manifest.test.js); the normalizers turn what the forms send (strings,
// blanks, `undefined`) into values the rest of the code can trust.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Choices of the `select` fields, as the manifest declares them (strings).
export const REFRESH_MINUTES = ['15', '30', '60'];
export const HORIZON_MONTHS = ['3', '6', '12', '24'];

export const DEFAULT_CONFIG = {
  refresh_minutes: '30',
  horizon_months: '12',
  unreachable_hours: 6,
  change_days: 7,
  language: 'fr',
};

// Bounds of the `number` fields (integers: the Gladys form renders them
// without `step`, see CLAUDE.md).
const UNREACHABLE_HOURS = { min: 1, max: 168 };
const CHANGE_DAYS = { min: 1, max: 31 };

// Feeds per user: the `account_schema` declares this many "name + address"
// pairs (`name_1`/`url_1` … `name_5`/`url_5`).
export const SLOT_COUNT = 5;

function integerIn(value, { min, max }, fallback) {
  const number = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function oneOf(value, choices, fallback) {
  const text = value === undefined || value === null ? '' : String(value);
  return choices.includes(text) ? text : fallback;
}

/**
 * Merge the admin config with the defaults and coerce every value.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    refresh_minutes: oneOf(raw.refresh_minutes, REFRESH_MINUTES, DEFAULT_CONFIG.refresh_minutes),
    horizon_months: oneOf(raw.horizon_months, HORIZON_MONTHS, DEFAULT_CONFIG.horizon_months),
    unreachable_hours: integerIn(
      raw.unreachable_hours,
      UNREACHABLE_HOURS,
      DEFAULT_CONFIG.unreachable_hours,
    ),
    change_days: integerIn(raw.change_days, CHANGE_DAYS, DEFAULT_CONFIG.change_days),
    language: oneOf(raw.language, LANGUAGES, DEFAULT_CONFIG.language),
  };
}

/** Refresh period, in milliseconds. */
export function refreshMs(config) {
  return Number(config.refresh_minutes) * 60 * 1000;
}

/**
 * The feeds a user typed in their account: one entry per filled address, in
 * slot order. The address is kept raw here (src/url.js validates it).
 * @param {Record<string, unknown>} [account] the `account_schema` values
 * @returns {{ slot: number, name: string, url: string }[]}
 */
export function parseAccount(account = {}) {
  const slots = [];
  for (let slot = 1; slot <= SLOT_COUNT; slot += 1) {
    const url = typeof account[`url_${slot}`] === 'string' ? account[`url_${slot}`].trim() : '';
    if (!url) {
      continue;
    }
    const name =
      typeof account[`name_${slot}`] === 'string'
        ? account[`name_${slot}`].replace(/\s+/g, ' ').trim()
        : '';
    slots.push({ slot, name, url });
  }
  return slots;
}
