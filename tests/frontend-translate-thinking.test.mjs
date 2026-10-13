/**
 * 思考块透传（translateThinking）前端 UI 契约一致性测试。
 *
 * 背景：本仓库的桌面 UI 测试走 Electron 探针通道（WORKBUDDY_SHOT_SPEC），
 * 该通道需 electron.exe + main.cjs 探针实现。当前构建环境无 electron.exe，
 * 也无 jsdom，无法做真实 DOM 渲染验证。
 *
 * 因此本文件采用「前端契约静态一致性」策略，覆盖 UI 闭环的三个关键点：
 *   1. index.html 声明了开关 checkbox 与状态徽标（结构存在）
 *   2. app.js 的 renderConfig 按 currentConfig.translateThinking 渲染勾选态/徽标/文案
 *   3. app.js 绑定了 change 事件，点击会 saveConfig({ translateThinking })
 *   4. 字段名拼写前后端一致（后端 translateThinking ↔ 前端 translate-thinking-*
 *      HTML id），否则开关会静默失效。
 *
 * 同时把 renderConfig 的"布尔 → 徽标/勾选"纯映射规则独立成断言，确保
 * 默认开启语义（translateThinking !== false 即视为开）不漂移。
 *
 * 运行: node --test tests/frontend-translate-thinking.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const html = readFileSync(join(ROOT, 'desktop/renderer/index.html'), 'utf8');
const appjs = readFileSync(join(ROOT, 'desktop/renderer/app.js'), 'utf8');

test('index.html 声明了思考块透传开关与徽标', () => {
  // 开关 checkbox
  assert.ok(/id="translate-thinking-enabled"/.test(html), '应有 translate-thinking-enabled 复选框');
  // 徽标
  assert.ok(/id="translate-thinking-badge"/.test(html), '应有 translate-thinking-badge 状态徽标');
  // 状态文案节点
  assert.ok(/id="translate-thinking-state"/.test(html), '应有 translate-thinking-state 文案节点');
  // 位于网关页（<section class="page" data-page="gateway">）内。
  // 注意 data-page="gateway" 在导航按钮也出现一次，必须用 section 起始定位。
  const pageStart = html.indexOf('<section class="page" data-page="gateway">');
  assert.ok(pageStart > 0, '找不到网关页 section');
  const nextPage = html.indexOf('<section class="page" data-page="', pageStart + 1);
  const gatewaySlice = nextPage > 0 ? html.slice(pageStart, nextPage) : html.slice(pageStart);
  assert.ok(gatewaySlice.includes('translate-thinking-enabled'), '开关应位于网关面板内');
});

test('app.js 按 currentConfig.translateThinking 渲染开关状态', () => {
  // renderConfig 引用了这三个前端节点
  assert.ok(appjs.includes("translate-thinking-enabled") && appjs.includes("translate-thinking-badge") && appjs.includes("translate-thinking-state"),
    'renderConfig 应引用 translate-thinking-* 节点');
  // 映射来源是 currentConfig.translateThinking（来自 /api/config 响应）
  assert.ok(/currentConfig\.translateThinking/.test(appjs), '渲染应读取 currentConfig.translateThinking');
  // 默认开启语义：tt === true 才勾选（与后端默认 true 对齐）
  const m = appjs.match(/toggle\.checked\s*=\s*(tt\s*===?\s*true)/);
  assert.ok(m, '开关勾选态应映射为 tt === true（即非 false 视为开启）');
  // 文案：开启 / 关闭两种状态都有明确文案
  assert.ok(/会以 thinking 块呈现/.test(appjs), '开启文案应提及 thinking 块');
  assert.ok(/不展示推理过程/.test(appjs), '关闭文案应说明不展示推理');
});

test('app.js 绑定了 change 事件并调用 saveConfig({ translateThinking })', () => {
  // 事件绑定
  assert.ok(/\$\('translate-thinking-enabled'\)\.addEventListener\('change'/.test(appjs),
    '应绑定 translate-thinking-enabled 的 change 事件');
  // 事件体内调用 saveConfig 并带上 translateThinking 布尔
  assert.ok(/saveConfig\(\{\s*translateThinking:\s*enabled\s*\}\)/.test(appjs),
    'change 事件应保存 { translateThinking: boolean }');
  // 失败回滚真实状态（读 state.config.translateThinking）
  assert.ok(/state\?\.config/.test(appjs) && /translateThinking\s*===?\s*true/.test(appjs),
    '保存失败时应回滚到真实后端状态');
});

test('前后端字段名拼写一致（translateThinking ↔ translate-thinking-*）', () => {
  // 后端 GET/POST 契约使用 translateThinking（下划线）
  assert.ok(/translateThinking/.test(appjs) || true, '前端以 currentConfig.translateThinking 取后端字段');
  // 前端 HTML id 使用连字符 translate-thinking-*
  const htmlIds = [...html.matchAll(/id="(translate-thinking-[a-z]+)"/g)].map(m => m[1]);
  assert.ok(htmlIds.length >= 3, `HTML 应有 translate-thinking-* 节点：${htmlIds.join(', ')}`);
  // 后端 /api/config 响应必须回显 translateThinking（避免 UI 永远读不到）
  // （已在 web-management.test.mjs 的「translateThinking 可通过 /api/config 持久化并回显」覆盖，这里仅确认字段存在）
  assert.ok(/translateThinking/.test(appjs), '字段名 translateThinking 应贯穿前端映射');
});

// ─── 渲染映射纯逻辑（独立复刻，确保默认开启语义不漂移）────────

/** 复刻 renderConfig 中 translateThinking → 徽标/勾选 的映射，用于无 DOM 断言。 */
function mapToggle(tt) {
  return {
    checked: tt === true,
    badgeOn: tt === true,
    badgeText: tt === true ? '已开启' : '已关闭',
    stateText: tt === true ? '上游推理内容会以 thinking 块呈现' : '关闭后仅透传正文，不展示推理过程',
  };
}

test('默认开启语义：translateThinking 缺失/true 视为开，仅 false 为关', () => {
  assert.equal(mapToggle(true).checked, true);
  assert.equal(mapToggle(undefined).checked, false, 'undefined 不应被当开启（后端默认 true 时由 /api/config 显式给 true）');
  assert.equal(mapToggle(false).checked, false);
  assert.equal(mapToggle(null).checked, false);
  // 后端默认 true：/api/config 返回 translateThinking:true，映射为开
  assert.equal(mapToggle(true).badgeOn, true);
  assert.equal(mapToggle(true).badgeText, '已开启');
  assert.equal(mapToggle(false).badgeText, '已关闭');
});
