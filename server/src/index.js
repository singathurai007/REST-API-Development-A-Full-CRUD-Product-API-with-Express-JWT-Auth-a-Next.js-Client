import 'dotenv/config';
import { createApp } from './app.js';
import { SEED_CREDENTIALS } from './data/store.js';

/** ===== Entry point: starts the HTTP server ===== */

const PORT = Number(process.env.PORT ?? 4000);
const app = createApp();

const server = app.listen(PORT, () => {
  const base = `http://localhost:${PORT}/api`;
  console.log('');
  console.log('  REST API Development - Express server');
  console.log(`  Listening on        ${base}`);
  console.log(`  Health check        ${base}/health`);
  console.log(`  CORS allowed origins ${process.env.CLIENT_ORIGIN ?? 'http://localhost:3000'}`);
  console.log('');
  console.log('  Demo accounts');
  console.log(`    admin  ${SEED_CREDENTIALS.admin.email}  /  ${SEED_CREDENTIALS.admin.password}`);
  console.log(`    user   ${SEED_CREDENTIALS.user.email}   /  ${SEED_CREDENTIALS.user.password}`);
  console.log('');
  console.log('  Import postman/REST-API-Development.postman_collection.json into Postman or Insomnia.');
  console.log('');
});

/** Graceful shutdown so `Ctrl+C` closes keep-alive connections cleanly. */
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n${signal} received - shutting down.`);
    server.close(() => process.exit(0));
  });
}
