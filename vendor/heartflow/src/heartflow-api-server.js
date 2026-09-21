#!/usr/bin/env node
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { checkOutput, checkInput, runPipeline } = require('./gate.js');

const PORT = Number(process.env.PORT) || 4317;
const HOST = '0.0.0.0';

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    if (url.pathname === '/health') {
      return res.end(JSON.stringify({ok:true, ts:Date.now()}));
    }

    if (req.method === 'POST' && url.pathname === '/v1/check/output') {
      const body = await new Promise(r => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>r(d)); });
      const {text, mode='fast'} = JSON.parse(body);
      if (!text) return res.end(JSON.stringify({error:'text required'}));
      const t0 = Date.now();
      const out = mode === 'deep' ? runPipeline({input:text, mode:'deep'}) : checkOutput(text);
      const ms = Date.now() - t0;
      return res.end(JSON.stringify({ok:true, ms, gate: out.gate, verdict: out.verdict, overallScore: out.overallScore, findings: (out.findings||[]).slice(0,20)}));
    }

    if (req.method === 'POST' && url.pathname === '/v1/check/input') {
      const body = await new Promise(r => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>r(d)); });
      const {text} = JSON.parse(body);
      if (!text) return res.end(JSON.stringify({error:'text required'}));
      const t0 = Date.now();
      const out = checkInput(text);
      const ms = Date.now() - t0;
      return res.end(JSON.stringify({ok:true, ms, gate: out.gate, verdict: out.verdict, overallScore: out.overallScore}));
    }

    if (req.method === 'POST' && url.pathname === '/v1/audit/repo') {
      const body = await new Promise(r => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>r(d)); });
      const {repoPath, repoName} = JSON.parse(body);
      if (!repoPath) return res.end(JSON.stringify({error:'repoPath required'}));
      const script = path.join(path.dirname(require.resolve('./gate.js')), '..', 'scripts', 'repo-audit.js');
      const outPath = path.join(repoPath, 'heartflow-audit-report.md');
      const args = [script, repoPath, repoName || 'repo', outPath];
      const child = spawnSync('node', args, {encoding:'utf8', timeout: 300000, maxBuffer: 10 * 1024 * 1024});
      const report = fs.readFileSync(outPath, 'utf8');
      const summary = {};
      for (const line of child.stdout.split('\n')) {
        const m = line.match(/^([A-Z]+)\s+(.+)$/);
        if (m) summary[m[1].toLowerCase()] = isNaN(Number(m[2])) ? m[2] : Number(m[2]);
      }
      return res.end(JSON.stringify({ok: child.status===0, status: child.status, stderr: child.stderr, summary, report}));
    }

    res.writeHead(404); return res.end(JSON.stringify({error:'not found', paths:['/v1/check/output','/v1/check/input','/v1/audit/repo','/health']}));
  } catch (e) {
    res.writeHead(500); return res.end(JSON.stringify({error: e.message}));
  }
}).listen(PORT, HOST, () => {
  console.log(`HeartFlow API up on http://${HOST}:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  POST /v1/check/output  {text, mode?}`);
  console.log(`  POST /v1/check/input   {text}`);
  console.log(`  POST /v1/audit/repo    {repoPath, repoName?}`);
});
