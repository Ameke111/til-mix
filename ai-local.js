import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTilServer } from './server.js';

const executable = resolve(process.env.TIL_LLAMA_EXE || '.til-data/llama-cuda/llama-server.exe');
const model = resolve(process.env.TIL_GGUF || '.til-data/Qolda-Q4_K_M.gguf');
if (!existsSync(executable) || !existsSync(model)) {
  throw new Error('Для локальной нейросети нужны llama-server и GGUF. Укажи TIL_LLAMA_EXE и TIL_GGUF. См. README.md.');
}
if (!existsSync('dist/index.html')) throw new Error('Сначала выполни npm run build.');
mkdirSync('.til-data', { recursive: true });
const key = randomBytes(32).toString('hex');
const modelPort = Number(process.env.TIL_MODEL_PORT || 8014);
const sitePort = Number(process.env.PORT || 4176);
const child = spawn(executable, ['-m', model, '--host', '127.0.0.1', '--port', String(modelPort),
  '-ngl', process.env.TIL_GPU_LAYERS || '99', '-c', '8192', '-np', '1', '--jinja', '--alias', 'til-tutor',
  '--reasoning', 'off', '--api-key', key],
{ windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
let server;
function stop() {
  server?.close();
  child.kill();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
child.on('error', (error) => { console.error('Не удалось запустить модель', error.message); process.exitCode = 1; stop(); });
child.on('exit', () => { server?.close(); });
try {
  console.log('Загружаю локальную нейросеть…');
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (child.exitCode !== null) throw new Error('Модель завершила работу при загрузке. Проверь драйвер и путь к GGUF.');
    try {
      const response = await fetch(`http://127.0.0.1:${modelPort}/v1/models`, {
        headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(1500)
      });
      ready = response.ok;
    } catch { /* The model server is still starting. */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error('Модель не запустилась за 90 секунд.');
  server = createTilServer({ origin: `http://127.0.0.1:${sitePort}`, dbPath: resolve('.til-data/til-mix.sqlite'),
    ai: { url: `http://127.0.0.1:${modelPort}/v1/chat/completions`, model: 'til-tutor', key } });
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; stop(); });
  server.listen(sitePort, '127.0.0.1', () => console.log(`Тіл Mix с нейросетью http://127.0.0.1:${sitePort}/#assistant`));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  stop();
}
