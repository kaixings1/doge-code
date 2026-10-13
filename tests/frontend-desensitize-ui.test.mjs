/**
 * 敏感词脱敏面板 — jsdom 端到端 UI 测试。
 *
 * 与 frontend-thinking-ui.test.mjs 同模式：真实加载 desktop/renderer/index.html 的 DOM，
 * 在 jsdom 窗口上下文中按序执行真实脚本（app.js → desensitize-panel.js），用可控的
 * workbuddyAPI mock 驱动，验证「后端脱敏状态 → 面板渲染」与各类操作的 saveConfig 闭环。
 *
 * 不依赖 Electron（当前环境无 electron.exe），在 node --test 下直接跑通。
 * 覆盖原 desensitize-ui-test.mjs 在无 Electron 时无法运行的真浏览器交互场景。
 *
 * 运行: node --test tests/frontend-desensitize-ui.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const HERE = dirname(fileURLToPath(import.meta.url));
const RENDER = join(HERE, '..', 'desktop', 'renderer');
const html = readFileSync(join(RENDER, 'index.html'), 'utf8');
const appJs = readFileSync(join(RENDER, 'app.js'), 'utf8');
const desensitizeJs = readFileSync(join(RENDER, 'desensitize-panel.js'), 'utf8');

const DEFAULT_DESENSITIZE = {
  enabled: true,
  termCount: 31,
  terms: Array.from({ length: 31 }, (_, i) => `词${i}`),
  roles: ['system', 'user'],
  stats: { requests: 120, changedRequests: 12, totalHits: 45, topTerms: [{ term: '词1', count: 9 }] },
  file: 'data/desensitize.json',
};

/** 构造 jsdom + mock API + 按序执行真实 app.js / desensitize-panel.js。 */
function buildDom({ desensitize = DEFAULT_DESENSITIZE, config = {} } = {}) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole: vc,
  });
  const { window } = dom;

  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.wbLogsPanel = { load() {}, lastStats() { return null; } };

  // 记录所有 api 调用，便于断言闭环
  const calls = [];
  let state = {
    enabled: desensitize.enabled,
    termCount: desensitize.termCount,
    terms: [...desensitize.terms],
    roles: [...desensitize.roles],
    stats: { ...desensitize.stats },
    file: desensitize.file,
  };

  const listeners = new Set();
  window.workbuddyAPI = {
    isWeb: true,
    getState: async () => ({ config: { apiKeySet: false, apiKey: null, ...config } }),
    getConfig: async () => ({ ...config }),
    saveConfig: async payload => payload,
    getDesensitize: async () => ({ ...state }),
    setDesensitizeEnabled: async enabled => { calls.push({ fn: 'setDesensitizeEnabled', enabled }); state.enabled = enabled; return { ...state, enabled }; },
    setDesensitizeRoles: async roles => { calls.push({ fn: 'setDesensitizeRoles', roles }); state.roles = [...roles]; return { ...state, roles }; },
    saveDesensitizeTerms: async terms => { state.terms = [...terms]; return { ...state, terms: state.terms }; },
    addDesensitizeTerms: async terms => { calls.push({ fn: 'addDesensitizeTerms', terms }); state.terms.push(...terms); state.termCount = state.terms.length; return { ...state }; },
    removeDesensitizeTerm: async term => { calls.push({ fn: 'removeDesensitizeTerm', term }); state.terms = state.terms.filter(t => t !== term); state.termCount = state.terms.length; return { ...state }; },
    resetDesensitizeTerms: async () => { calls.push({ fn: 'resetDesensitizeTerms' }); state.terms = [...DEFAULT_DESENSITIZE.terms]; state.termCount = state.terms.length; return { ...state }; },
    resetDesensitizeStats: async () => { calls.push({ fn: 'resetDesensitizeStats' }); state.stats = { requests: 0, changedRequests: 0, totalHits: 0, topTerms: [] }; return { ...state }; },
    onStateChanged: cb => { listeners.add(cb); return () => listeners.delete(cb); },
    onLoginState: () => {}, onAutoMaintained: () => {}, switchAccount() {},
    getUsage() { return { results: [] }; }, getAllBalances() { return { results: [] }; },
    checkinAllAccounts() {}, refreshAccountToken() {}, setAccountEnabled() {}, removeAccount() {},
    refreshSession() {}, logout() {}, startLogin() {}, cancelLogin() {},
    getLoginState: async () => ({ active: false }), uploadAccount() {},
  };

  // 按真实加载顺序执行：app.js（定义 wbApp、渲染账号/网关页） → desensitize-panel.js（定义 wbDesensitizePanel、绑定事件、自调 load）
  window.eval(appJs);
  window.eval(desensitizeJs);

  return { window, calls, getState: () => state };
}

const tick = () => new Promise(r => setTimeout(r, 30));

test('脱敏面板：后端 enabled=true 时渲染为勾选 + 已启用徽标 + 词表 chips', async () => {
  const { window } = buildDom();
  await tick();
  const toggle = window.document.getElementById('desensitize-enabled');
  const badge = window.document.getElementById('desensitize-badge');
  const chips = window.document.querySelectorAll('#term-list .term-chip');
  assert.equal(toggle.checked, true, '后端 enabled=true 应渲染为勾选');
  assert.equal(badge.textContent, '已启用 · 31 个词', `徽标应为「已启用 · 31 个词」，实际「${badge.textContent}」`);
  assert.equal(chips.length, 31, `应渲染 31 个词 chip，实际 ${chips.length}`);
});

test('脱敏面板：后端 enabled=false 时渲染为未勾选 + 已关闭徽标', async () => {
  const { window } = buildDom({ desensitize: { ...DEFAULT_DESENSITIZE, enabled: false } });
  await tick();
  const toggle = window.document.getElementById('desensitize-enabled');
  const badge = window.document.getElementById('desensitize-badge');
  assert.equal(toggle.checked, false, '后端 enabled=false 应渲染为未勾选');
  assert.equal(badge.textContent, '已关闭', `徽标应为「已关闭」，实际「${badge.textContent}」`);
});

test('脱敏面板：角色勾选渲染与后端 roles 一致', async () => {
  const { window } = buildDom({ desensitize: { ...DEFAULT_DESENSITIZE, roles: ['system', 'assistant'] } });
  await tick();
  const checked = [...window.document.querySelectorAll('#desensitize-roles input:checked')].map(b => b.value);
  assert.deepEqual(checked.sort(), ['assistant', 'system'], `角色应为 assistant+system，实际 ${checked.join(',')}`);
});

test('点击脱敏开关 → setDesensitizeEnabled 闭环', async () => {
  const { window, calls } = buildDom({ desensitize: { ...DEFAULT_DESENSITIZE, enabled: true } });
  await tick();
  const toggle = window.document.getElementById('desensitize-enabled');
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event('change'));
  await tick();
  const call = calls.find(c => c.fn === 'setDesensitizeEnabled');
  assert.ok(call, `应调用 setDesensitizeEnabled，实际调用：${JSON.stringify(calls)}`);
  assert.equal(call.enabled, false, '关闭开关应保存 enabled=false');
});

test('添加词 → addDesensitizeTerms 闭环并更新 UI', async () => {
  const { window, calls } = buildDom();
  await tick();
  const input = window.document.getElementById('term-input');
  const btn = window.document.getElementById('btn-add-term');
  input.value = '新敏感词';
  btn.click();
  await tick();
  const call = calls.find(c => c.fn === 'addDesensitizeTerms');
  assert.ok(call, `应调用 addDesensitizeTerms，实际：${JSON.stringify(calls)}`);
  // 注意 call.terms 来自 jsdom realm，与测试 realm 的字符串 instance 不同，deepStrictEqual 会误判，故用 JSON 比较
  assert.equal(JSON.stringify(call.terms), JSON.stringify(['新敏感词']), '应解析输入为单条词');
  const chips = window.document.querySelectorAll('#term-list .term-chip');
  assert.equal(chips.length, 32, `词表应从 31 增至 32，实际 ${chips.length}`);
});

test('删除词 → removeDesensitizeTerm 闭环', async () => {
  const { window, calls } = buildDom();
  await tick();
  const firstRemove = window.document.querySelector('#term-list .term-chip button');
  const removedTerm = firstRemove.dataset.term;
  firstRemove.click();
  await tick();
  const call = calls.find(c => c.fn === 'removeDesensitizeTerm');
  assert.ok(call, `应调用 removeDesensitizeTerm，实际：${JSON.stringify(calls)}`);
  assert.equal(call.term, removedTerm, '应删除被点击的词');
});

test('切换角色 → setDesensitizeRoles 闭环', async () => {
  const { window, calls } = buildDom();
  await tick();
  // 取消勾选 system
  const systemBox = [...window.document.querySelectorAll('#desensitize-roles input')].find(b => b.value === 'system');
  systemBox.checked = false;
  systemBox.dispatchEvent(new window.Event('change'));
  await tick();
  const call = calls.find(c => c.fn === 'setDesensitizeRoles');
  assert.ok(call, `应调用 setDesensitizeRoles，实际：${JSON.stringify(calls)}`);
  // jsdom realm 字符串差异：用 JSON 比较避免 deepStrictEqual 误判
  assert.equal(JSON.stringify(call.roles.sort()), JSON.stringify(['user']), `取消 system 后角色应为 user，实际 ${call.roles.join(',')}`);
});

test('恢复默认词表（confirm 放行）→ resetDesensitizeTerms 闭环', async () => {
  const { window, calls } = buildDom();
  await tick();
  window.confirm = () => true;
  window.document.getElementById('btn-reset-terms').click();
  await tick();
  const call = calls.find(c => c.fn === 'resetDesensitizeTerms');
  assert.ok(call, `应调用 resetDesensitizeTerms，实际：${JSON.stringify(calls)}`);
});

test('清空统计 → resetDesensitizeStats 闭环', async () => {
  const { window, calls } = buildDom();
  await tick();
  window.document.getElementById('btn-reset-stats').click();
  await tick();
  const call = calls.find(c => c.fn === 'resetDesensitizeStats');
  assert.ok(call, `应调用 resetDesensitizeStats，实际：${JSON.stringify(calls)}`);
});
