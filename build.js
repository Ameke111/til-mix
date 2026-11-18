import { build, context } from 'esbuild';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const htmlPath = resolve(root, 'index.html');
const [mode] = process.argv.slice(2);
const dev = mode === '--dev';
const outdir = resolve(root, dev ? '.til-data/dev' : 'dist');
const entryPoints = ['app.js', 'site.css', 'mark.svg'];
const model = 'vosk-model-small-kz-0.42.tar.gz';
const speechWorker = 'vosk-worker-0-0-8.js';
let speechCopy;

const options = {
  absWorkingDir: root,
  entryPoints,
  outdir,
  entryNames: 'assets/[name]-[hash]',
  assetNames: 'assets/[name]-[hash]',
  chunkNames: 'assets/[name]-[hash]',
  bundle: true,
  splitting: true,
  minify: !dev,
  charset: 'utf8',
  format: 'esm',
  target: 'es2022',
  loader: { '.svg': 'copy', '.wav': 'file' },
  metafile: true,
  plugins: [{
    name: 'site-html',
    setup(builder) {
      let workerSource;
      // Serve the pinned worker separately so the page keeps its normal script policy.
      builder.onLoad({ filter: /[/\\]vosk-browser[/\\]dist[/\\]vosk\.js$/ }, async ({ path }) => {
        const contents = await readFile(path, 'utf8');
        const factory = /var WorkerFactory = createBase64WorkerFactory\('([A-Za-z0-9+/=]+)', null, false\);/;
        const match = factory.exec(contents);
        if (!match) throw new Error('Could not extract the pinned Vosk worker');
        workerSource = Buffer.from(match[1], 'base64');
        return {
          contents: contents.replace(factory,
            'var WorkerFactory = function () { return new Worker(new URL("assets/' + speechWorker + '", document.baseURI)); };'),
          loader: 'js'
        };
      });
      if (dev) {
        builder.onLoad({ filter: /[/\\]app\.js$/ }, async ({ path }) => ({
          contents: await readFile(path, 'utf8') + "\nnew EventSource('/esbuild').addEventListener('change', () => location.reload());",
          loader: 'js',
          resolveDir: root,
          watchFiles: [htmlPath]
        }));
      }
      builder.onEnd(async (result) => {
        if (result.errors.length) return;
        const assets = new Map(Object.entries(result.metafile.outputs)
          .map(([path, { entryPoint }]) => [entryPoint, './' + relative(outdir, resolve(root, path)).split(sep).join('/')]));
        let html = await readFile(htmlPath, 'utf8');
        for (const name of entryPoints) {
          const asset = assets.get(name);
          if (!asset) throw new Error('Build output not found: ' + name);
          html = html.replace('="./' + name + '"', '="' + asset + '"');
        }
        await writeFile(resolve(outdir, 'index.html'), html, 'utf8');
        if (workerSource) await writeFile(resolve(outdir, 'assets', speechWorker), workerSource);
        speechCopy ??= copyFile(resolve(root, '.til-data', model), resolve(outdir, 'assets', model)).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
        await speechCopy;
      });
    }
  }],
  logLevel: 'info'
};

if (dev || mode === '--preview') {
  const server = await context(options);
  try {
    await server.rebuild();
    if (dev) await server.watch();
    const { port } = await server.serve({ servedir: outdir, host: '127.0.0.1', port: dev ? 5173 : 4174 });
    console.log('Тіл Mix: http://127.0.0.1:' + port);
  } catch (error) {
    await server.dispose();
    throw error;
  }
} else {
  await build(options);
}
