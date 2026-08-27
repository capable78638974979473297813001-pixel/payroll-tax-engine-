import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { calculateAlabamaPaycheck, AlabamaInputError } from '../src/alabama/index.ts';
import { allALMunicipalities } from '../src/registry.ts';

/**
 * A local web UI for the Alabama calculator.
 *
 * Deliberately a plain node:http server with zero new dependencies rather
 * than an Express app or a bundler-built SPA: this exists to put a form in
 * front of calculateAlabamaPaycheck(), not to be a framework showcase. The
 * page (alabama-ui.html) is static HTML/CSS/JS; the ONE thing it cannot do
 * itself is the tax math, which is why it POSTs to this server instead of
 * computing anything client-side — the arithmetic, the rates, and the
 * booklet-sourced rules all live in src/ and data/, exactly once, same as
 * the CLI and the test suite.
 *
 *   npm run ui:alabama
 *   then open http://localhost:4321
 */

const PORT = Number(process.env.PORT ?? 4321);
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(HERE, 'alabama-ui.html');

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      const html = readFileSync(HTML_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'GET' && req.url === '/api/alabama/cities') {
      // The 25-municipality occupational-tax list, served fresh from the
      // same registry the engine itself reads — the UI's dropdown can
      // never drift out of sync with what a calculation actually honours.
      const cities = allALMunicipalities('2026-01-01')
        .map((c) => ({ name: c.name, rate: c.rate }))
        .sort((a, b) => a.name.localeCompare(b.name));
      sendJson(res, 200, { cities });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/alabama/calculate') {
      const raw = await readBody(req);
      let input: unknown;
      try {
        input = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Request body was not valid JSON.' });
        return;
      }

      try {
        const output = calculateAlabamaPaycheck(input as never);
        sendJson(res, 200, { output });
      } catch (err) {
        if (err instanceof AlabamaInputError) {
          sendJson(res, 422, { error: err.message, problems: err.problems });
          return;
        }
        throw err;
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err instanceof Error ? err.message : 'Unknown server error' });
  }
});

server.listen(PORT, () => {
  console.log(`\nAlabama paycheck calculator running at http://localhost:${PORT}\n`);
});
