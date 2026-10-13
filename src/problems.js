// -----------------------------------------------------------------------------
// Repeated failures write one line when they start (or change) and one when
// they end, never one per attempt: the debug level keeps the rest.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const defaultLogger = createLogger({ name: 'problems' });

export class ProblemLog {
  /** @param {{ debug: Function, info: Function, warn: Function, error: Function }} [log] */
  constructor(log = defaultLogger) {
    this.log = log;
    /** @type {Map<string, string>} the last message logged, by problem key */
    this.active = new Map();
  }

  /**
   * A failure: logged at `level` the first time (or when the message
   * changes), debug after. Returns true when logged.
   */
  fail(key, message, level = 'warn') {
    if (this.active.get(key) === message) {
      this.log.debug(message);
      return false;
    }
    this.active.set(key, message);
    this.log[level](message);
    return true;
  }

  /**
   * The problem is over: `message` (info) when one was logged, nothing
   * otherwise. Returns true if it was active.
   */
  recover(key, message) {
    if (!this.active.delete(key)) {
      return false;
    }
    if (message) {
      this.log.info(message);
    }
    return true;
  }
}
