import { fileURLToPath } from 'node:url';
import { createTilServer } from './server.js';

const port = Number(process.env.TIL_DEMO_PORT ?? 4180);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('TIL_DEMO_PORT должен быть числом от 1024 до 65535.');
}
const origin = 'http://127.0.0.1:' + port;
createTilServer({ origin, demo: true, staticDir: fileURLToPath(new URL('./dist/', import.meta.url)) })
  .listen(port, '127.0.0.1', () => console.log('Демо Тіл Mix: ' + origin));
