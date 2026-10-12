# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Calendar addresses**: often secrets (a Google secret address, an Outlook or school portal link with a
  token, a password written in the address). They are stored by Gladys in the account of each user and
  read by the integration through the host API; the integration never writes them to disk nor to its logs
  (only the server name), and derives the calendar and event ids from one-way digests.
- **`/data`**: one file, `state.json`, with the time each calendar started failing and whether the
  "Calendar unreachable" trigger fired; no address, no event.
- **Network**: outgoing HTTPS (or HTTP) requests to the calendar servers the users typed, nothing else; no
  port is opened. Any user who enabled the integration can make the container download an address of
  their choice, on the Internet or on the local network, within 20 MB and 30 seconds; the answer is only
  parsed as a calendar, never forwarded.
- **Privacy between users**: private calendars are only pushed to their owner; the widget and the scenes
  only use the calendars shared with the household.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the third-party services the integration downloads calendars from.
