/**
 * 思考块透传开关 — jsdom 端到端 UI 测试。
 *
 * 真实加载 desktop/renderer/index.html 的 DOM 结构，并在 jsdom 上下文中执行
 * 真实的 app.js（渲染层 + 事件绑定代码），用可控的 workbuddyAPI mock 驱动，
 * 验证「后端配置 → 开关渲染」与「点击开关 → saveConfig({ translateThinking })」闭环。
 *
 * 不依赖 Electron；仅依赖 devDependency jsdom。
 *
 * 运行: node --test tests/frontend-thinking-ui.test.mjs
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
const webApiJs = readFileSync(join(RENDER, 'web-api.js'), 'utf8');

/** 构造一个 jsdom + 注入 mock API + 执行真实渲染脚本的 harness。 */
function buildDom({ config }) {
  const vc = new VirtualConsole();
  // 吞掉渲染层里的 console.warn（如 getState 失败提示），保持测试输出干净
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole: vc,
  });
  const { window } = dom;

  // matchMedia 在 jsdom 默认无实现，app.js 启动即调用，需补齐
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });

  // 子面板桩（index.html 里 desensitize-panel.js / logs-panel.js 在 app.js 之后执行，
  // 这里用可选链调用，给桩即可；不影响 thinking 开关逻辑）
  window.wbDesensitizePanel = { load() {}, render() {} };
  window.wbLogsPanel = { load() {}, lastStats() { return null; } };

  // 可控的 workbuddyAPI mock
  const calls = [];
  let configValue = { ...config };
  const listeners = new Set();
  window.workbuddyAPI = {
    isWeb: true,
    getState: async () => ({ config: { apiKeySet: false, apiKey: null, ...configValue } }),
    getConfig: async () => ({ ...configValue }),
    saveConfig: async payload => {
      calls.push(payload);
      if (Object.prototype.hasOwnProperty.call(payload, 'translateThinking')) {
        configValue = { ...configValue, translateThinking: payload.translateThinking };
      }
      return payload;
    },
    onStateChanged: cb => { listeners.add(cb); return () => listeners.delete(cb); },
    onLoginState: () => {},
    onAutoMaintained: () => {},
    switchAccount() {},
    getUsage() { return { results: [] }; },
    getAllBalances() { return { results: [] }; },
    checkinAllAccounts() {},
    refreshAccountToken() {},
    setAccountEnabled() {},
    removeAccount() {},
    refreshSession() {},
    logout() {},
    startLogin() {},
    cancelLogin() {},
    getLoginState: async () => ({ active: false }),
    uploadAccount() {},
  };

  // 在 window 上下文执行真实脚本：web-api.js（定义 workbuddyAPI 包装，但已被上面的 mock 覆盖——此处不执行它，
  // 直接执行 app.js，让它读取 window.workbuddyAPI mock）。
  window.eval(appJs);

  return { window, calls, getConfig: () => configValue };
}

test('思考块透传开关：后端 translateThinking=true 时渲染为勾选 + 已开启徽标', async () => {
  const { window } = buildDom({ config: { translateThinking: true } });
  // refresh() 是异步的（getState/getConfig），等一拍让渲染完成
  await new Promise(r => setTimeout(r, 30));
  const toggle = window.document.getElementById('translate-thinking-enabled');
  const badge = window.document.getElementById('translate-thinking-badge');
  const stateText = window.document.getElementById('translate-thinking-state');
  assert.ok(toggle, '开关 DOM 应存在');
  assert.equal(toggle.checked, true, '后端 true 应渲染为勾选');
  assert.equal(badge.textContent, '已开启', `徽标应为「已开启」，实际「${badge.textContent}」`);
  assert.ok(/thinking 块呈现/.test(stateText.textContent), '文案应说明 thinking 块呈现');
});

test('思考块透传开关：后端 translateThinking=false 时渲染为未勾选 + 已关闭徽标', async () => {
  const { window } = buildDom({ config: { translateThinking: false } });
  await new Promise(r => setTimeout(r, 30));
  const toggle = window.document.getElementById('translate-thinking-enabled');
  const badge = window.document.getElementById('translate-thinking-badge');
  assert.equal(toggle.checked, false, '后端 false 应渲染为未勾选');
  assert.equal(badge.textContent, '已关闭', `徽标应为「已关闭」，实际「${badge.textContent}」`);
});

test('点击开关 → 触发 saveConfig({ translateThinking }) 闭环', async () => {
  const { window, calls } = buildDom({ config: { translateThinking: true } });
  await new Promise(r => setTimeout(r, 30));
  const toggle = window.document.getElementById('translate-thinking-enabled');

  // 模拟用户关闭开关
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event('change'));

  // change 处理是 async 的
  await new Promise(r => setTimeout(r, 30));

  const saved = calls.find(c => Object.prototype.hasOwnProperty.call(c, 'translateThinking'));
  assert.ok(saved, `应调用 saveConfig 且带 translateThinking，实际调用：${JSON.stringify(calls)}`);
  assert.equal(saved.translateThinking, false, '关闭开关应保存 translateThinking=false');
});

test('点击开关开启 → saveConfig({ translateThinking: true })', async () => {
  const { window, calls } = buildDom({ config: { translateThinking: false } });
  await new Promise(r => setTimeout(r, 30));
  const toggle = window.document.getElementById('translate-thinking-enabled');

  toggle.checked = true;
  toggle.dispatchEvent(new window.Event('change'));

  await new Promise(r => setTimeout(r, 30));

  const saved = calls.find(c => Object.prototype.hasOwnProperty.call(c, 'translateThinking'));
  assert.ok(saved, `应调用 saveConfig，实际：${JSON.stringify(calls)}`);
  assert.equal(saved.translateThinking, true, '开启开关应保存 translateThinking=true');
});

test('保存失败 → 开关回滚到真实后端状态', async () => {
  // 构造一个会抛错的 saveConfig（模拟 409/网络失败）
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.wbDesensitizePanel = { load() {}, render() {} };
  window.wbLogsPanel = { load() {}, lastStats() { return null; } };
  let configValue = { translateThinking: true };
  const listeners = new Set();
  window.workbuddyAPI = {
    isWeb: true,
    getState: async () => ({ config: { apiKeySet: false, apiKey: null, ...configValue } }),
    getConfig: async () => ({ ...configValue }),
    saveConfig: async () => { throw new Error('409 思考块透传由启动参数或环境变量管理'); },
    onStateChanged: cb => { listeners.add(cb); return () => listeners.delete(cb); },
    onLoginState: () => {}, onAutoMaintained: () => {}, switchAccount() {},
    getUsage() { return { results: [] }; }, getAllBalances() { return { results: [] }; },
    checkinAllAccounts() {}, refreshAccountToken() {}, setAccountEnabled() {}, removeAccount() {},
    refreshSession() {}, logout() {}, startLogin() {}, cancelLogin() {},
    getLoginState: async () => ({ active: false }), uploadAccount() {},
  };
  window.eval(appJs);
  await new Promise(r => setTimeout(r, 30));

  const toggle = window.document.getElementById('translate-thinking-enabled');
  // 用户尝试关闭（真实后端仍是 true）
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 30));

  // 回滚逻辑：保存失败 → 开关应回到 config.translateThinking === true 的勾选态
  assert.equal(toggle.checked, true, '保存失败后开关应回滚到后端真实状态（true）');
});
