// -----------------------------------------------------------------------------
// Dates as people read them, in the Gladys time zone (TZ of the container)
// and the requested language: the widget rows and the texts handed to scenes.
// -----------------------------------------------------------------------------

import { LOCALES, TEXT, pick } from './i18n.js';
import { addDays, daysBetween, localDate } from './time.js';

const formatters = new Map();
function formatter(language, options) {
  const key = `${language}|${JSON.stringify(options)}`;
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, options));
  }
  return formatters.get(key);
}

const time = (ms, language) =>
  formatter(language, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));

const shortDay = (date, language) =>
  formatter(language, { weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(`${date}T12:00:00`),
  );

const longDay = (date, language) =>
  formatter(language, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${date}T12:00:00`),
  );

/** "Today", "Tomorrow" or "Thu 15 Oct". */
function dayLabel(date, today, language) {
  const text = pick(TEXT, language);
  if (date === today) {
    return text.today;
  }
  if (date === addDays(today, 1)) {
    return text.tomorrow;
  }
  return shortDay(date, language);
}

/**
 * When an occurrence happens, for a widget row: "Today · 08:30–09:30",
 * "Tomorrow · all day", "Mon 12 Oct – Fri 16 Oct".
 * @param {object} occurrence from expandEvents()
 * @param {string} language
 * @param {number} now
 */
export function formatWhen(occurrence, language, now) {
  const text = pick(TEXT, language);
  const today = localDate(new Date(now));
  if (occurrence.fullDay) {
    const lastDay = addDays(occurrence.endDate, -1);
    if (lastDay <= occurrence.startDate) {
      return `${dayLabel(occurrence.startDate, today, language)} · ${text.allDay}`;
    }
    return `${dayLabel(occurrence.startDate, today, language)} – ${dayLabel(lastDay, today, language)}`;
  }
  const startDate = localDate(new Date(occurrence.startMs));
  const endDate = localDate(new Date(occurrence.endMs));
  if (occurrence.endMs === occurrence.startMs) {
    return `${dayLabel(startDate, today, language)} · ${time(occurrence.startMs, language)}`;
  }
  if (startDate === endDate) {
    return `${dayLabel(startDate, today, language)} · ${time(occurrence.startMs, language)}–${time(occurrence.endMs, language)}`;
  }
  return `${dayLabel(startDate, today, language)} ${time(occurrence.startMs, language)} – ${dayLabel(endDate, today, language)} ${time(occurrence.endMs, language)}`;
}

/** The start of an occurrence for a scene message: "Thursday 15 October, 08:30". */
export function formatStart(occurrence, language) {
  if (occurrence.fullDay) {
    return longDay(occurrence.startDate, language);
  }
  const date = localDate(new Date(occurrence.startMs));
  return `${longDay(date, language)}, ${time(occurrence.startMs, language)}`;
}

/** Calendar days from today to the start of an occurrence (0 = today, or already running). */
export function daysUntil(occurrence, now) {
  const start = occurrence.fullDay ? occurrence.startDate : localDate(new Date(occurrence.startMs));
  return Math.max(0, daysBetween(localDate(new Date(now)), start));
}
