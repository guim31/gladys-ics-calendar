// -----------------------------------------------------------------------------
// Calendar-date helpers, in the container time zone. The Gladys supervisor
// injects TZ, the time zone of Gladys: the local days of this process are the
// ones the core stores full-day events at (its midnights) and the ones the
// scenes and the dashboard reason in.
// -----------------------------------------------------------------------------

const pad = (number) => String(number).padStart(2, '0');

/** `YYYY-MM-DD` of a Date, read in the local time zone. */
export function localDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight of a `YYYY-MM-DD` date, as a timestamp. */
export function localMidnight(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
}

/** `YYYY-MM-DD`, `days` calendar days after (or before) `dateString`. */
export function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  return localDate(new Date(year, month - 1, day + days));
}

/** Local noon of a `YYYY-MM-DD` date, as a timestamp. */
export function localNoon(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day, 12).getTime();
}

/** Same date, `months` later (clamped to the month length). */
export function addMonths(dateString, months) {
  const [year, month, day] = dateString.split('-').map(Number);
  const target = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return localDate(target);
}

/** Whole calendar days from `fromDate` to `toDate` (`YYYY-MM-DD`), DST-safe. */
export function daysBetween(fromDate, toDate) {
  const [y1, m1, d1] = fromDate.split('-').map(Number);
  const [y2, m2, d2] = toDate.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
