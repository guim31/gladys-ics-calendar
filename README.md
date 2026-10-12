# ICS Calendars for Gladys Assistant

Bring any calendar published in the iCalendar format (an `.ics` address) into
[Gladys Assistant](https://gladysassistant.com): a Google calendar through its secret address, a published
Outlook or iCloud calendar, a school timetable, the waste collection calendar of a town, the fixtures of a
club, public holidays… Each address becomes a calendar of the Gladys **Calendar** view, kept up to date, and
usable by the scenes like the calendars Gladys synchronizes itself.

This is an **external integration** of type `calendar` (Gladys 5.2.0 or later): it runs in its own sandboxed
container and pushes calendars and events into the core calendar store. It is the Gladys counterpart of the
[Remote Calendar](https://www.home-assistant.io/integrations/remote_calendar/) integration of Home Assistant.

> Tested with its automated test suite and real calendar files (Google, Apple, Outlook, French national
> education), not yet on many real Gladys instances: feedback welcome on the Gladys forum or in the issues.

## Features

- **Per user**: every member of the household enables the integration in **My calendars** and pastes up to
  five `.ics` addresses (`webcal://` accepted). Each one becomes a calendar of theirs, private until they
  share it with the household.
- **Faithful calendars**: recurring events (`RRULE`, `RDATE`, `EXDATE`), moved and cancelled occurrences
  (`RECURRENCE-ID`, `STATUS:CANCELLED`), full-day events, time zones (`VTIMEZONE`, Windows names of
  Outlook and Exchange), HTML descriptions turned into text. 90 days of history, 3 to 24 months ahead.
- **Light on the network and on Gladys**: a download every 15, 30 or 60 minutes with conditional requests
  (`ETag`, `Last-Modified`), nothing written to Gladys when nothing changed, at most 25 calendar writes per
  minute (the core accepts 30).
- **Dashboard widget** "Upcoming events": the coming days of the shared calendars, with place, description
  and link behind a tap.
- **Scene triggers**: "Event changed in a calendar" (an event of the coming days added, cancelled,
  rescheduled or renamed: a class cancelled, a collection moved) and "Calendar unreachable" (an expired
  link).
- **Scene action** "Find the next calendar event": the next event whose title contains a text, however far,
  with the days until it.
- **Sync now** button, with a report of what failed and why.
- Texts and documentation in English, French, German and Spanish.

What Gladys already does with its calendars (the "Calendar event is coming" trigger, the calendar
conditions and actions, the dashboard chip, the assistant) works with these calendars once shared: the
integration does not duplicate it.

## Requirements

- Gladys Assistant **5.2.0** or later.
- The `.ics` address of each calendar; Internet access from Gladys.

## Installation

In Gladys: **Integrations → Install from GitHub**, address `https://github.com/guim31/gladys-ics-calendar`.
Then every user opens the integration page, fills **My calendars** and clicks **Enable for me**. The
complete guide, with where to find the address of a Google, Outlook or iCloud calendar, is in
[`docs/en.md`](docs/en.md) (also in [French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

Each feed is downloaded, parsed and expanded with [node-ical](https://github.com/jens-maus/node-ical), then
mirrored into one Gladys calendar of its owner through the host API of the core (`publishCalendars`,
`publishCalendarEvents`). Every publication replaces the whole timeline of the calendar in disjoint windows
of at most 500 events: an event deleted from the feed, or older than 90 days, disappears from Gladys
without any bookkeeping. Calendar and event ids are user-scoped one-way digests of the address and of the
UID, so the address, often a secret, never leaves the account of its owner: it is not stored by the
integration, and its logs only show the server name.

## Limitations

- Read only: Gladys never writes to the source calendar.
- Five calendars per user, 9,000 events per calendar, files of 20 MB at most.
- No OAuth sign-in (Google, Microsoft accounts): use the published `.ics` address. A password can be
  written in the address (`https://user:password@server/…`, Nextcloud).
- The widget, the scene triggers and the scene action only see the calendars shared with the household,
  as the core's own calendar scenes do.
- Changes are seen at the next download (15 to 60 minutes; Google itself refreshes its secret addresses
  every few hours).

## Development

Node.js 22+, ESM, no build step. Runtime dependencies:
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js) and
[`node-ical`](https://github.com/jens-maus/node-ical).

```bash
npm install
npm test              # node --test, against the SDK's fake Gladys; no network
npm run lint
npm run format:check
npx -y github:GladysAssistant/integration-store --skip-image-check .   # store validator
```

```
index.js              SDK wiring (src/app.js registers the handlers)
src/app.js            every SDK handler, the periodic refresh, the scene events
src/syncer.js         per user and per feed: download, publish, delete, outages, changes
src/fetcher.js        conditional download, bounded in size and time
src/ics.js            node-ical: parsing and recurrence expansion
src/events.js         occurrences -> host API events, windows of 500
src/changes.js        what changed between two downloads ("Event changed")
src/scenes.js         scene triggers data and the "Find the next calendar event" action
src/widgets.js        "Upcoming events" dashboard widget
src/limiter.js        calendar writes per minute
src/url.js            webcal, credentials, masking, digests
src/format.js         dates for people; src/time.js: calendar-date arithmetic
src/i18n.js           every text of the code, in four languages
src/config.js         DEFAULT_CONFIG (mirrors the manifest) + normalization, account slots
src/store.js          outages remembered in /data/state.json
test/fixtures/feeds/  real and test calendar files (see Credits)
```

To run it outside Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="ics-calendar" \
DATA_DIR=./data \
TZ=Europe/Paris \
npm start
```

Releases are made by the **Release** workflow (Actions → Release); never edit the versions by hand. See
[`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [node-ical](https://github.com/jens-maus/node-ical) by Jens Maus and contributors (Apache-2.0): iCalendar
  parsing and recurrence expansion. Some of its test files are in `test/fixtures/feeds/` (`node-ical-*`).
- [ical](https://github.com/allenporter/ical) by Allen Porter (Apache-2.0), the library of Home Assistant:
  test files of provider quirks (`ical-*`).
- [Home Assistant](https://github.com/home-assistant/core) (Apache-2.0): the Remote Calendar integration and
  its test file (`ha-*`).
- Real feeds recorded on 2026-10-12: the French public holidays of Google Calendar and Apple, and the
  [school calendar](https://data.education.gouv.fr/explore/dataset/fr-en-calendrier-scolaire/) of the French
  Education ministry (Licence Ouverte 2.0). `school-timetable.ics` and `google-private.ics` are synthetic.

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Google, Microsoft, Apple, Index Éducation
(Pronote), the French Education ministry or Home Assistant.

## License

[Apache-2.0](LICENSE)
