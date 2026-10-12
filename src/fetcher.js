// -----------------------------------------------------------------------------
// Downloads one iCalendar feed. Conditional requests (`ETag`,
// `Last-Modified`) spare the provider and the network when nothing changed;
// a bounded size and time keep a wrong address (a video, a huge archive, a
// server that never answers) from exhausting the 256 MB sandbox.
//
// Errors are FeedError objects with a code (see ERROR_CODES): their messages
// never contain the address, which may be secret.
// -----------------------------------------------------------------------------

export const ERROR_CODES = {
  INVALID_URL: 'invalid_url',
  HTTP: 'http',
  TIMEOUT: 'timeout',
  NETWORK: 'network',
  TOO_LARGE: 'too_large',
  NOT_CALENDAR: 'not_calendar',
  PARSE: 'parse',
};

export const MAX_FEED_BYTES = 20 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 30_000;

export class FeedError extends Error {
  /**
   * @param {string} code one of ERROR_CODES
   * @param {string} [detail] safe detail (an HTTP status, an error code)
   */
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'FeedError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * The error code of a failed fetch(), without its message: undici puts the
 * address in some of them ("Failed to parse URL from https://…").
 */
function networkDetail(err) {
  const cause = err?.cause;
  return cause?.code || cause?.name || err?.code || err?.name || 'error';
}

async function readBounded(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new FeedError(ERROR_CODES.TOO_LARGE, `${declared} bytes`);
  }
  if (!response.body) {
    return '';
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxBytes) {
      throw new FeedError(ERROR_CODES.TOO_LARGE, `more than ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

/**
 * @param {{ url: string, authorization?: string }} feed normalized address
 * @param {object} [options]
 * @param {string} [options.etag] validator of the last download
 * @param {string} [options.lastModified] validator of the last download
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.userAgent]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxBytes]
 * @returns {Promise<{ notModified: true } | { notModified: false, text: string, etag?: string, lastModified?: string }>}
 */
export async function fetchFeed(feed, options = {}) {
  const {
    etag,
    lastModified,
    fetchImpl = fetch,
    userAgent = 'gladys-ics-calendar',
    timeoutMs = FETCH_TIMEOUT_MS,
    maxBytes = MAX_FEED_BYTES,
  } = options;
  const headers = {
    accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5',
    'user-agent': userAgent,
  };
  if (feed.authorization) {
    headers.authorization = feed.authorization;
  }
  if (etag) {
    headers['if-none-match'] = etag;
  }
  if (lastModified) {
    headers['if-modified-since'] = lastModified;
  }

  let response;
  try {
    response = await fetchImpl(feed.url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new FeedError(ERROR_CODES.TIMEOUT);
    }
    if (err instanceof TypeError && !err.cause) {
      throw new FeedError(ERROR_CODES.INVALID_URL);
    }
    throw new FeedError(ERROR_CODES.NETWORK, networkDetail(err));
  }

  if (response.status === 304) {
    await response.body?.cancel?.().catch(() => {});
    return { notModified: true };
  }
  if (!response.ok) {
    await response.body?.cancel?.().catch(() => {});
    throw new FeedError(ERROR_CODES.HTTP, String(response.status));
  }

  let text;
  try {
    text = await readBounded(response, maxBytes);
  } catch (err) {
    if (err instanceof FeedError) {
      await response.body?.cancel?.().catch(() => {});
      throw err;
    }
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new FeedError(ERROR_CODES.TIMEOUT);
    }
    throw new FeedError(ERROR_CODES.NETWORK, networkDetail(err));
  }

  // A wrong address often answers 200 with an HTML page (a login form, a
  // "calendar not found" page): say so instead of "no events".
  if (!/^\s*BEGIN:VCALENDAR/i.test(text.replace(/^\uFEFF/, ''))) {
    throw new FeedError(ERROR_CODES.NOT_CALENDAR);
  }
  return {
    notModified: false,
    text,
    etag: response.headers.get('etag') ?? undefined,
    lastModified: response.headers.get('last-modified') ?? undefined,
  };
}
