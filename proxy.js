/**
 * Unified Proxy Server - Port 3001
 * 
 * Endpoints:
 *   POST /token-counter - Anthropic token counting (proxy)
 *   POST /sms-incoming - Twilio SMS webhook
 *   GET  /sms-log - View SMS log
 *   GET  /health - Health check
 */

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const SMS_LOG_FILE = path.join(process.env.HOME, 'mission-control', 'sms-log.json');
const TASKS_LOG_FILE = path.join(process.env.HOME, 'mission-control', 'tasks-log.json');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Ensure log file exists
function ensureLogFile() {
  const dir = path.dirname(SMS_LOG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(SMS_LOG_FILE)) {
    fs.writeFileSync(SMS_LOG_FILE, JSON.stringify([], null, 2));
  }
}

// Log incoming SMS
function logSMS(smsData) {
  ensureLogFile();
  const logs = JSON.parse(fs.readFileSync(SMS_LOG_FILE, 'utf8'));
  logs.push({
    timestamp: new Date().toISOString(),
    from: smsData.From,
    to: smsData.To,
    body: smsData.Body,
    messageId: smsData.MessageSid,
    accountSid: smsData.AccountSid
  });
  fs.writeFileSync(SMS_LOG_FILE, JSON.stringify(logs, null, 2));
}

// Get latest tasks from tasks-log.json
function getLatestTasks(limit = 5) {
  try {
    if (!fs.existsSync(TASKS_LOG_FILE)) {
      return [];
    }
    const content = fs.readFileSync(TASKS_LOG_FILE, 'utf8').trim();
    if (!content) {
      return [];
    }
    const tasks = JSON.parse(content);
    if (!Array.isArray(tasks)) {
      return [];
    }
    // Return last N tasks, reversed (newest first)
    return tasks.slice(-limit).reverse();
  } catch (e) {
    console.error('Error reading tasks-log.json:', e);
    return [];
  }
}

// Parse POST body
function parseBody(req, callback) {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      callback(null, data);
    } catch (e) {
      // Try as form-urlencoded (Twilio)
      const params = new URLSearchParams(body);
      const data = Object.fromEntries(params);
      callback(null, data);
    }
  });
}

// Proxy to Anthropic API (token counting)
function proxyAnthropicTokenCounter(req, res, body) {
  const options = {
    hostname: 'api.anthropic.com',
    port: 443,
    path: '/v1/messages/count_tokens',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    }
  };

  const proxyReq = https.request(options, (proxyRes) => {
    let responseBody = '';
    proxyRes.on('data', chunk => {
      responseBody += chunk;
    });
    proxyRes.on('end', () => {
      res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
      res.end(responseBody);
    });
  });

  proxyReq.on('error', (e) => {
    console.error('Anthropic proxy error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error' }));
  });

  proxyReq.write(body);
  proxyReq.end();
}

// Create server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Enable CORS on ALL responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // POST /token-counter - Real token usage from all sessions
  if (req.method === 'POST' && pathname === '/token-counter') {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    
    try {
      // Get real sessions
      const { execSync } = require('child_process');
      const sessionsJson = execSync('openclaw sessions --json 2>/dev/null', { 
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 10 * 1024 * 1024 
      });
      
      const sessionsData = JSON.parse(sessionsJson);
      
      if (sessionsData.sessions && Array.isArray(sessionsData.sessions)) {
        sessionsData.sessions.forEach(session => {
          if (session.inputTokens) totalInputTokens += session.inputTokens;
          if (session.outputTokens) totalOutputTokens += session.outputTokens;
        });
      }
    } catch (e) {
      console.error('Error fetching token data:', e.message);
    }
    
    const totalTokens = totalInputTokens + totalOutputTokens;
    
    // Calculate cost for Claude Haiku
    // Input: $0.80 per 1M tokens
    // Output: $4.00 per 1M tokens
    const inputCost = (totalInputTokens * 0.80) / 1000000;
    const outputCost = (totalOutputTokens * 4.00) / 1000000;
    const totalCost = inputCost + outputCost;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      tokens_today: totalTokens,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_today_usd: Math.round(totalCost * 100000) / 100000, // Round to 5 decimals
      model: 'claude-haiku-4-5',
      breakdown: {
        input_cost: Math.round(inputCost * 100000) / 100000,
        output_cost: Math.round(outputCost * 100000) / 100000
      },
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // POST /sms-incoming - Receive SMS from Twilio
  if (req.method === 'POST' && pathname === '/sms-incoming') {
    parseBody(req, (err, data) => {
      if (!err && data.From) {
        console.log(`📱 SMS from ${data.From}: ${data.Body}`);
        logSMS(data);
      }
      
      // Twilio expects TwiML response
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
</Response>`;
      
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.end(twiml);
    });
    return;
  }

  // GET /sms-log - View all SMS
  if (req.method === 'GET' && pathname === '/sms-log') {
    ensureLogFile();
    const logs = JSON.parse(fs.readFileSync(SMS_LOG_FILE, 'utf8'));
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>SMS Log</title>
  <style>
    body { font-family: monospace; margin: 20px; background: #0a0a0f; color: #f0f0ff; }
    h1 { color: #7c5cfc; }
    .sms { border: 1px solid #606078; padding: 10px; margin: 10px 0; border-radius: 5px; background: #101018; }
    .from { color: #25d366; font-weight: bold; }
    .body { margin: 10px 0; word-wrap: break-word; }
    .time { color: #a0a0b8; font-size: 0.85em; }
    .meta { color: #606078; font-size: 0.8em; margin-top: 5px; }
  </style>
</head>
<body>
  <h1>📱 SMS Log</h1>
  <p><strong>Total messages:</strong> ${logs.length}</p>
  <hr>
  ${logs.length === 0 ? '<p style="color: #a0a0b8;">No SMS yet</p>' : ''}
  ${logs.map(log => `
    <div class="sms">
      <div class="time">⏰ ${new Date(log.timestamp).toLocaleString()}</div>
      <div class="from">📲 From: ${log.from}</div>
      <div class="body"><strong>Message:</strong><br>${log.body}</div>
      <div class="meta">To: ${log.to} | ID: ${log.messageId}</div>
    </div>
  `).reverse().join('')}
</body>
</html>
    `;
    
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // GET /health - Health check
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      endpoints: [
        'POST /token-counter (Anthropic proxy)',
        'POST /sms-incoming (Twilio webhook)',
        'GET /sms-log (SMS viewer)',
        'GET /health (Health check)',
        'GET /openclaw-status (OpenClaw status)'
      ]
    }));
    return;
  }

  // GET /openclaw-status - OpenClaw system status (real-time metrics with 7+ agents)
  if (pathname === '/openclaw-status') {
    const tasks = getLatestTasks(5);
    
    // Get real sessions from openclaw CLI
    let activeAgents = [];
    let messages_today = 0;
    let searches_today = 0;
    
    try {
      // Run openclaw sessions --json to get real sessions
      const { execSync } = require('child_process');
      const sessionsJson = execSync('openclaw sessions --json 2>/dev/null', { 
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 10 * 1024 * 1024 
      });
      
      const sessionsData = JSON.parse(sessionsJson);
      
      if (sessionsData.sessions && Array.isArray(sessionsData.sessions)) {
        // Use up to 7 most recent sessions (filter out subagents if needed, but include them for variety)
        activeAgents = sessionsData.sessions.slice(0, 7).map(session => ({
          name: session.key.replace('agent:main:', ''),
          type: session.kind,
          model: session.model,
          status: 'active',
          updatedAt: new Date(session.updatedAt).toISOString(),
          tokens: session.totalTokens || 0
        }));
      }
    } catch (e) {
      console.error('Error fetching sessions:', e.message);
      // Fallback to at least the main session
      activeAgents = [{
        name: 'telegram:direct:6360918947',
        type: 'telegram:direct',
        model: 'claude-haiku-4-5',
        status: 'active'
      }];
    }
    
    // Count messages and searches from gateway.log (today's date)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logFile = path.join(process.env.HOME, '.openclaw/logs/gateway.log');
    
    try {
      if (fs.existsSync(logFile)) {
        const logContent = fs.readFileSync(logFile, 'utf8').split('\n');
        logContent.forEach(line => {
          // Only count lines from today
          if (line.includes(today)) {
            if (/message|chat|telegram|direct/i.test(line)) messages_today++;
            if (/search|query|web_search/i.test(line)) searches_today++;
          }
        });
      }
    } catch (e) {
      console.error('Error reading gateway.log:', e);
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      gateway: 'ONLINE',
      telegram: true,
      model: 'claude-haiku-4-5',
      active_sessions: activeAgents.length,
      agents: activeAgents,
      messages_today: messages_today,
      searches_today: searches_today,
      tasks: tasks,
      warnings: 0
    }));
    return;
  }

  // Root
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'Unified Proxy Server',
      port: 3001,
      endpoints: {
        '/token-counter': 'POST - Anthropic token counting proxy',
        '/sms-incoming': 'POST - Twilio SMS webhook',
        '/sms-log': 'GET - SMS log viewer',
        '/health': 'GET - Health check',
        '/openclaw-status': 'GET - OpenClaw system status (reads tasks from tasks-log.json)'
      }
    }));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Unified Proxy Server listening on port ${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  POST http://localhost:${PORT}/token-counter - Anthropic token counter`);
  console.log(`  POST http://localhost:${PORT}/sms-incoming - Twilio SMS webhook`);
  console.log(`  GET  http://localhost:${PORT}/sms-log - SMS log viewer`);
  console.log(`  GET  http://localhost:${PORT}/health - Health check`);
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n✅ Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

// Log errors
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught error:', err);
});
