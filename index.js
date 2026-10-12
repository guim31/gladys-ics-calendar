// -----------------------------------------------------------------------------
// Entry point: wires the Gladys SDK to the calendar synchronization
// (src/app.js). No calendar logic here. Handlers are registered before
// connect().
//
// Environment provided by the Gladys supervisor: GLADYS_HOST_API_URL,
// GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR (read by the SDK), and
// TZ, the time zone of Gladys: full-day events and "today" follow it.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
const app = registerHandlers(gladys, {
  userAgent: `gladys-ics-calendar/${version} (+https://github.com/guim31/gladys-ics-calendar)`,
});

gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal}, stopping`);
  return app.stop();
});

logger.info(`Starting the ICS calendars integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
