# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Changed

- Quieter logs: a normal synchronization no longer writes anything. Downloads, published events and
  changes sent to the scenes are only shown at the debug level.
- A calendar that cannot be downloaded is reported once when the problem starts (or when its reason
  changes) and once when it is reachable again, instead of at every synchronization. The same goes
  for events left out of a feed, failed writes to the Gladys calendar and the "rate limit reached"
  warning (once per synchronization at most).

## [1.0.0] - 2026-10-12

### Added

- Any calendar published as an iCalendar (`.ics`) address in the Gladys calendar: a Google calendar
  through its secret address, published Outlook and iCloud calendars, school timetables, waste
  collection calendars, public holidays… `webcal://` addresses accepted.
- Per user: each member of the household adds up to five addresses in "My calendars"; each one becomes a
  calendar of theirs, private until they share it with the household.
- Recurring events, moved and cancelled occurrences, full-day events and time zones (Outlook and Exchange
  included), 90 days of history and 3 to 24 months ahead.
- A download every 15, 30 or 60 minutes, only when the calendar changed; nothing written to Gladys
  otherwise.
- Dashboard widget "Upcoming events" for the shared calendars.
- Scene triggers "Event changed in a calendar" (added, cancelled, rescheduled or renamed in the coming
  days) and "Calendar unreachable".
- Scene action "Find the next calendar event", with the days until it.
- "Sync now" button, with a report of the calendars that failed and why.
- Texts and documentation in English, French, German and Spanish; scene texts in French by default.

[Unreleased]: https://github.com/guim31/gladys-ics-calendar/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-ics-calendar/releases/tag/v1.0.0
