// -----------------------------------------------------------------------------
// The little the integration remembers across restarts, in /data (the only
// writable place of the sandbox): since when each feed fails, and whether the
// "calendar unreachable" scene trigger already fired for that failure — so a
// restart neither forgets an outage nor announces it twice.
//
// No address, no event: the keys are the user selector and the feed digest.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

/**
 * @param {string} [directory] defaults to DATA_DIR or /data
 */
export function createStore(directory = process.env.DATA_DIR || '/data') {
  const file = join(directory, 'state.json');
  let state = { feeds: {} };
  let warned = false;

  return {
    async load() {
      try {
        const parsed = JSON.parse(await readFile(file, 'utf8'));
        if (parsed && typeof parsed.feeds === 'object' && parsed.feeds !== null) {
          state = { feeds: parsed.feeds };
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Could not read ${file}, starting afresh (${err.code ?? err.name})`);
        }
      }
    },
    get(key) {
      return state.feeds[key];
    },
    set(key, value) {
      if (value === undefined) {
        delete state.feeds[key];
      } else {
        state.feeds[key] = value;
      }
    },
    keys() {
      return Object.keys(state.feeds);
    },
    async save() {
      try {
        await mkdir(directory, { recursive: true });
        await writeFile(`${file}.tmp`, JSON.stringify(state));
        await rename(`${file}.tmp`, file);
      } catch (err) {
        if (!warned) {
          warned = true;
          logger.warn(
            `Could not write ${file} (${err.code ?? err.name}): outages are not remembered across restarts`,
          );
        }
      }
    },
  };
}
