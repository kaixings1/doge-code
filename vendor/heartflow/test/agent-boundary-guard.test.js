// agent-boundary-guard 测试：跨界写入门禁
const path = require('path');
const { AgentBoundaryGuard } = require('../src/shield/agent-boundary-guard');

module.exports = function ({ test }) {
  const home = '/home/testuser';
  const guard = new AgentBoundaryGuard({ home, selfDirs: ['.hermes'], extraAllowed: ['/home/testuser/projects'] });

  test('own territory write → ALLOW', () => {
    const r = guard.checkWrite('/home/testuser/.hermes/skills/foo/SKILL.md', { actor: 'hermes', purpose: 'install' });
    if (r.verdict !== 'ALLOW') throw new Error(`expected ALLOW, got ${r.verdict}: ${r.reason}`);
  });

  test('cross-agent write into .claude → BLOCK', () => {
    const r = guard.checkWrite('/home/testuser/.claude/skills/foo/SKILL.md', { actor: 'hermes', purpose: 'install' });
    if (r.verdict !== 'BLOCK') throw new Error(`expected BLOCK, got ${r.verdict}: ${r.reason}`);
    if (r.targetAgent !== '.claude') throw new Error(`expected targetAgent .claude, got ${r.targetAgent}`);
  });

  test('cross-agent write into .agents → BLOCK', () => {
    const r = guard.checkWrite('/home/testuser/.agents/skills/foo', { actor: 'hermes' });
    if (r.verdict !== 'BLOCK') throw new Error(`expected BLOCK, got ${r.verdict}`);
  });

  test('explicitly allowed external dir → ALLOW', () => {
    const r = guard.checkWrite('/home/testuser/projects/myapp/README.md', { actor: 'hermes' });
    if (r.verdict !== 'ALLOW') throw new Error(`expected ALLOW, got ${r.verdict}`);
  });

  test('unknown dot-dir in home → WARN', () => {
    const r = guard.checkWrite('/home/testuser/.mystery/thing', { actor: 'hermes' });
    if (r.verdict !== 'WARN') throw new Error(`expected WARN, got ${r.verdict}`);
  });

  test('/tmp write → ALLOW', () => {
    const r = guard.checkWrite('/tmp/foo.txt', { actor: 'hermes' });
    if (r.verdict !== 'ALLOW') throw new Error(`expected ALLOW, got ${r.verdict}`);
  });

  test('audit log records BLOCK with actor', () => {
    guard.checkWrite('/home/testuser/.openclaw/skills/x', { actor: 'hermes', purpose: 'test' });
    const entries = guard.getAuditLog();
    const block = entries.find(e => e.verdict === 'BLOCK' && e.target.includes('.openclaw'));
    if (!block) throw new Error('no BLOCK entry found');
    if (block.actor !== 'hermes') throw new Error('actor not recorded');
  });

  test('stats tally', () => {
    const s = guard.getStats();
    if (s.BLOCK < 3) throw new Error(`expected >=3 BLOCK, got ${s.BLOCK}`);
  });
};
