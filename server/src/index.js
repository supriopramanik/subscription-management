import mongoose from 'mongoose';
import { config } from './config.js';
import { models } from './models.js';
import { createApp } from './app.js';
import { exchangeRateService } from './exchange-rates.js';

if (!config.mongoUri) {
  console.error('MONGODB_URI is required. Add it to the root .env or server environment.');
  process.exit(1);
}
if (config.production && !process.env.APP_ORIGIN) {
  console.error('APP_ORIGIN must be set to your public HTTPS origin in production.');
  process.exit(1);
}
if (config.production && (!config.secure || !config.origin.startsWith('https://'))) {
  console.error('Production requires HTTPS APP_ORIGIN and secure cookies.');
  process.exit(1);
}
try {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid')
    throw new Error(
      'MongoDB must be a replica set (MongoDB Atlas works). Transactions protect payments and setup. See README for local MongoDB.'
    );
  await Promise.all(models.map((model) => model.init()));
  const stopRateRefresh = exchangeRateService.start();
  const server = createApp().listen(config.port, '0.0.0.0', () =>
    console.log(`Subtrack API ready on http://localhost:${config.port}`)
  );
  server.requestTimeout = 30000;
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    const forced = setTimeout(() => process.exit(1), 10000);
    forced.unref();
    server.close(async () => {
      await stopRateRefresh();
      await mongoose.disconnect();
      clearTimeout(forced);
      process.exit(0);
    });
  }
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
} catch (error) {
  // Do not print connection strings or credentials.
  console.error(
    'Startup failed:',
    error.message.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[redacted MongoDB URI]')
  );
  await mongoose.disconnect();
  process.exit(1);
}
