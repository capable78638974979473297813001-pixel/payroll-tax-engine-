const http = require('http');
const url = require('url');
const { calculatePaycheck, STATUTORY_CONSTANTS, FEDERAL_BRACKETS_2024 } = require('../core/taxEngine');

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const { pathname } = parsedUrl;
  const method = req.method.toUpperCase();

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/health' && method === 'GET') {
    return sendJson(res, 200, { status: 'healthy', timestamp: new Date().toISOString() });
  }

  if (pathname === '/api/v1/constants' && method === 'GET') {
    return sendJson(res, 200, {
      statutory: STATUTORY_CONSTANTS,
      brackets: FEDERAL_BRACKETS_2024
    });
  }

  if (pathname === '/api/v1/calculate' && method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { grossPay, ytdGross, filingStatus, payFrequency, preTaxDeductions, postTaxDeductions } = body;

      if (grossPay === undefined || grossPay === null || isNaN(Number(grossPay)) || Number(grossPay) < 0) {
        return sendJson(res, 400, { error: 'grossPay must be a non-negative number' });
      }

      const result = calculatePaycheck({
        grossPay: String(grossPay),
        ytdGross: ytdGross !== undefined ? String(ytdGross) : '0',
        filingStatus: filingStatus || 'SINGLE',
        payFrequency: payFrequency || 'BIWEEKLY',
        preTaxDeductions: preTaxDeductions !== undefined ? String(preTaxDeductions) : '0',
        postTaxDeductions: postTaxDeductions !== undefined ? String(postTaxDeductions) : '0'
      });

      return sendJson(res, 200, { success: true, data: result });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  sendJson(res, 404, { error: 'Route not found' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Payroll Tax API running on port ${PORT}`);
  });
}

module.exports = server;
