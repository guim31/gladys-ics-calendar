// -----------------------------------------------------------------------------
// The core accepts 30 calendar writes (POST/DELETE) per minute per
// integration, then answers 429. Every write goes through this limiter: a
// sliding window a little below the cap, shared by all the users and feeds.
// -----------------------------------------------------------------------------

export const WRITES_PER_MINUTE = 25;

/**
 * @param {object} [options]
 * @param {number} [options.max] writes per window
 * @param {number} [options.windowMs]
 * @param {() => number} [options.now]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 */
export function createLimiter(options = {}) {
  const {
    max = WRITES_PER_MINUTE,
    windowMs = 60_000,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options;
  const stamps = [];
  let queue = Promise.resolve();

  async function waitForSlot() {
    while (true) {
      const current = now();
      while (stamps.length > 0 && stamps[0] <= current - windowMs) {
        stamps.shift();
      }
      if (stamps.length < max) {
        stamps.push(current);
        return;
      }
      await sleep(stamps[0] + windowMs - current);
    }
  }

  /** Run `fn` once a write slot is free; calls are served in order. */
  function schedule(fn) {
    const run = queue.then(waitForSlot).then(fn);
    queue = run.catch(() => {});
    return run;
  }

  return { schedule };
}
