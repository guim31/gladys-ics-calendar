// -----------------------------------------------------------------------------
// What changed in a feed between two downloads, among the occurrences of the
// coming days: a class added, a match moved, a collection cancelled, a
// meeting renamed. The core only knows "an event is coming"; this is the
// "your calendar changed" signal behind the `event_changed` scene trigger.
//
// Occurrences keep their identity across downloads (UID + original date, see
// src/ics.js), so a moved occurrence is "rescheduled", not "cancelled" plus
// "added". The first download after a start is a baseline: nothing fires.
// -----------------------------------------------------------------------------

export const CHANGE_TYPES = ['added', 'cancelled', 'rescheduled', 'updated'];
// A feed rewritten wholesale (a new export, a time-zone fix on the provider
// side) would fire dozens of events: past this count, none fires.
export const MAX_CHANGES_PER_DOWNLOAD = 10;

/** The comparable part of every occurrence, by id. */
export function snapshotOf(occurrences) {
  return new Map(
    occurrences.map((occurrence) => [
      occurrence.id,
      {
        id: occurrence.id,
        name: occurrence.name,
        location: occurrence.location,
        fullDay: occurrence.fullDay,
        startDate: occurrence.startDate,
        endDate: occurrence.endDate,
        startMs: occurrence.startMs,
        endMs: occurrence.endMs,
      },
    ]),
  );
}

const sameEvent = (entry) =>
  `${entry.occurrence.startMs}|${entry.occurrence.endMs}|${entry.occurrence.name}|${entry.occurrence.location}`;

/**
 * Some providers give their events a new UID on every export (the French
 * national education feed does): the same event "cancelled" and "added"
 * again at the same time is no change at all.
 */
function dropReissued(changes) {
  const cancelled = new Map();
  for (const entry of changes) {
    if (entry.change === 'cancelled') {
      cancelled.set(sameEvent(entry), entry);
    }
  }
  const dropped = new Set();
  for (const entry of changes) {
    const twin = entry.change === 'added' ? cancelled.get(sameEvent(entry)) : undefined;
    if (twin && !dropped.has(twin)) {
      dropped.add(twin);
      dropped.add(entry);
    }
  }
  return changes.filter((entry) => !dropped.has(entry));
}

/**
 * @param {Map} previous snapshot of the last download
 * @param {Map} current snapshot of this download
 * @param {{ now: number, until: number }} range the coming days watched
 * @returns {{ change: string, occurrence: object }[]} sorted by start
 */
export function diffSnapshots(previous, current, { now, until }) {
  const watched = (entry) => entry.startMs >= now && entry.startMs < until;
  const changes = [];
  for (const [id, before] of previous) {
    const after = current.get(id);
    if (!after) {
      if (watched(before)) {
        changes.push({ change: 'cancelled', occurrence: before });
      }
    } else if (before.startMs !== after.startMs || before.endMs !== after.endMs) {
      if (watched(before) || watched(after)) {
        changes.push({ change: 'rescheduled', occurrence: after });
      }
    } else if (
      (before.name !== after.name || before.location !== after.location) &&
      watched(after)
    ) {
      changes.push({ change: 'updated', occurrence: after });
    }
  }
  for (const [id, after] of current) {
    if (!previous.has(id) && watched(after)) {
      changes.push({ change: 'added', occurrence: after });
    }
  }
  return dropReissued(changes).sort((a, b) => a.occurrence.startMs - b.occurrence.startMs);
}
