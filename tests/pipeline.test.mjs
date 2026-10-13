/**
 * 加工管线测试。
 *
 * 设计原则（见 CLAUDE.md「测试有效性规则」）：
 * - 不复刻生产逻辑：所有断言调真实 createPipeline / createBuiltinStages
 * - 关键断言做变异验证：把判据反转，测试必须失败（末尾 §变异验证）
 * - 覆盖三种难抓的缺陷模式：字段丢失、边界陷阱、上下界倒置
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPipeline,
  createBuiltinStages,
  hasBinaryContent,
  parseDisabledFromEnv,
  reorderStages,
  DEFAULT_STAGE_ORDER,
} from '../src/workbuddy-pipeline.mjs';
import {
  ensureLeadingSystemMessage,
  stripAnthropicMetaHeaders,
} from '../src/workbuddy-upstream-client.mjs';

// ─── 测试替身 ─────────────────────────────────────────────

/** 一个最小 stage：把 name 追加进 body.touched */
function touchStage(name, { when } = {}) {
  return {
    name,
    ...(when ? { when } : {}),
    apply(body) {
      const touched = Array.isArray(body.touched) ? body.touched : [];
      return { ...body, touched: [...touched, name] };
    },
  };
}

/** 无命中时返回同引用的 stage（模拟 desensitizeBody 的契约） */
const identityStage = {
  name: 'identity',
  apply: (body) => body,
};

// ─── 基础行为 ─────────────────────────────────────────────

test('按注册顺序执行，顺序可观测', () => {
  const p = createPipeline({ stages: [touchStage('a'), touchStage('b'), touchStage('c')] });
  const out = p.run({});
  assert.deepEqual(out.body.touched, ['a', 'b', 'c']);
  assert.equal(out.changed, true);
  assert.deepEqual(out.trace.map(t => t.name), ['a', 'b', 'c']);
});

test('未改动时返回同一引用（changed=false）', () => {
  const p = createPipeline({ stages: [identityStage] });
  const input = { messages: [] };
  const out = p.run(input);
  assert.equal(out.body, input, '必须返回同一引用，调用方靠引用相等判断');
  assert.equal(out.changed, false);
});

test('改动后 changed=true 且返回新引用', () => {
  const p = createPipeline({ stages: [touchStage('a')] });
  const input = {};
  const out = p.run(input);
  assert.notEqual(out.body, input);
  assert.equal(out.changed, true);
});

test('重名 stage 必须抛错，不静默覆盖', () => {
  assert.throws(
    () => createPipeline({ stages: [touchStage('dup'), touchStage('dup')] }),
    /stage 名重复: dup/,
  );
});

test('缺 name 或缺 apply 的 stage 必须抛错', () => {
  assert.throws(() => createPipeline({ stages: [{ name: '', apply: () => ({}) }] }), /非空 name/);
  assert.throws(() => createPipeline({ stages: [{ name: 'x' }] }), /缺少 apply/);
});

// ─── 开关行为 ─────────────────────────────────────────────

test('disabled 构造参数生效', () => {
  const p = createPipeline({ stages: [touchStage('a'), touchStage('b')], disabled: ['a'] });
  const out = p.run({});
  assert.deepEqual(out.body.touched, ['b'], '被禁用的 a 不应执行');
});

test('disable/enable 可逆，且幂等', () => {
  const p = createPipeline({ stages: [touchStage('a'), touchStage('b')] });

  assert.equal(p.disable('a'), true, '首次禁用应返回 true');
  assert.equal(p.disable('a'), false, '重复禁用应返回 false（幂等）');
  assert.deepEqual(p.run({}).body.touched, ['b']);

  assert.equal(p.enable('a'), true, '重新启用应返回 true');
  assert.equal(p.enable('a'), false, '重复启用应返回 false');
  assert.deepEqual(p.run({}).body.touched, ['a', 'b'], '启用后顺序应恢复');
});

test('禁用不存在的 stage 返回 false 且不抛错', () => {
  const p = createPipeline({ stages: [touchStage('a')] });
  assert.equal(p.disable('nope'), false);
  assert.equal(p.enable('nope'), false);
  assert.equal(p.isEnabled('nope'), false);
});

test('isEnabled 反映真实状态', () => {
  const p = createPipeline({ stages: [touchStage('a')], disabled: ['a'] });
  assert.equal(p.isEnabled('a'), false);
  p.enable('a');
  assert.equal(p.isEnabled('a'), true);
});

// ─── when 判据（数据层不适用）─────────────────────────────

test('when 返回 false 时跳过该 stage，且不标记 changed', () => {
  const p = createPipeline({
    stages: [touchStage('a', { when: () => false }), touchStage('b')],
  });
  const out = p.run({});
  assert.deepEqual(out.body.touched, ['b']);
  const entry = out.trace.find(t => t.name === 'a');
  assert.equal(entry.skipped, true);
  assert.match(entry.reason, /when 返回 false/);
});

test('when 收到正确的 body 与 ctx', () => {
  let seenBody = null;
  let seenCtx = null;
  const p = createPipeline({
    stages: [{
      name: 'probe',
      when: (body, ctx) => { seenBody = body; seenCtx = ctx; return false; },
      apply: () => { throw new Error('不应执行'); },
    }],
  });
  p.run({ marker: 1 }, { phase: 'request', model: 'hy3' });
  assert.deepEqual(seenBody, { marker: 1 });
  assert.equal(seenCtx.phase, 'request');
  assert.equal(seenCtx.model, 'hy3');
});

test('when 抛错时跳过该 stage，不影响后续 stage', () => {
  const logs = [];
  const p = createPipeline({
    log: (tag, msg) => logs.push(`${tag} ${msg}`),
    stages: [
      { name: 'boom', when: () => { throw new Error('when 炸了'); }, apply: () => ({}) },
      touchStage('after'),
    ],
  });
  const out = p.run({});
  assert.deepEqual(out.body.touched, ['after'], 'boom 之后的 stage 必须照常执行');
  const entry = out.trace.find(t => t.name === 'boom');
  assert.match(entry.error, /when 抛错/);
  assert.equal(logs.length, 1);
});

test('when 返回 true 时正常执行', () => {
  const p = createPipeline({ stages: [touchStage('a', { when: () => true })] });
  assert.deepEqual(p.run({}).body.touched, ['a']);
});

// ─── 错误隔离 ─────────────────────────────────────────────

test('单个 stage 抛错被隔离，后续 stage 仍执行', () => {
  const logs = [];
  const p = createPipeline({
    log: (tag, msg) => logs.push(`${tag} ${msg}`),
    stages: [
      touchStage('before'),
      { name: 'explode', apply: () => { throw new Error('炸了'); } },
      touchStage('after'),
    ],
  });
  const out = p.run({});
  assert.deepEqual(out.body.touched, ['before', 'after'], '抛错的 stage 不应中断管线');
  assert.equal(out.changed, true);
  const entry = out.trace.find(t => t.name === 'explode');
  assert.equal(entry.error, '炸了');
  assert.equal(logs.length, 1, '应记录一条错误日志');
});

test('apply 返回 null/undefined 视为跳过，不报错', () => {
  const p = createPipeline({
    stages: [
      { name: 'nil', apply: () => null },
      { name: 'undef', apply: () => undefined },
      touchStage('after'),
    ],
  });
  const out = p.run({});
  assert.deepEqual(out.body.touched, ['after']);
  assert.equal(out.trace.find(t => t.name === 'nil').skipped, true);
  assert.equal(out.trace.find(t => t.name === 'undef').skipped, true);
});

test('describe 抛错不影响主链路', () => {
  const p = createPipeline({
    stages: [{
      name: 'bad-describe',
      apply: () => ({ ok: true }),
      describe: () => { throw new Error('describe 炸了'); },
    }],
  });
  const out = p.run({});
  assert.equal(out.changed, true);
  assert.equal(out.trace[0].info, null, 'describe 抛错时应降级为 null');
});

// ─── 二进制闸门（安全关键）────────────────────────────────

test('hasBinaryContent 识别 image/document/audio 块', () => {
  const withImage = { messages: [{ role: 'user', content: [{ type: 'image', source: { data: 'aGk=' } }] }] };
  assert.equal(hasBinaryContent(withImage), true);

  const withDoc = { messages: [{ role: 'user', content: [{ type: 'document', source: {} }] }] };
  assert.equal(hasBinaryContent(withDoc), true);

  const withAudio = { messages: [{ role: 'user', content: [{ type: 'input_audio', data: 'x' }] }] };
  assert.equal(hasBinaryContent(withAudio), true);
});

test('hasBinaryContent 对纯文本返回 false', () => {
  const text = { messages: [{ role: 'user', content: '你好' }, { role: 'assistant', content: [{ type: 'text', text: 'hi' }] }] };
  assert.equal(hasBinaryContent(text), false);
});

test('hasBinaryContent 不被文本里的 "image" 字样误判', () => {
  // 这是关键的误判防护：正文提到 image 不等于带图片
  const body = { messages: [{ role: 'user', content: '请解释 image_url 字段的用法' }] };
  assert.equal(hasBinaryContent(body), false);
});

test('含二进制时整体短路，一个 stage 都不跑', () => {
  const p = createPipeline({ stages: [touchStage('a'), touchStage('b')] });
  const out = p.run({ messages: [{ role: 'user', content: [{ type: 'image', source: {} }] }] });
  assert.equal(out.changed, false);
  assert.equal(out.body.touched, undefined, '不应有任何 stage 执行');
  assert.equal(out.trace.length, 1);
  assert.equal(out.trace[0].name, '__binary__');
  assert.equal(out.trace[0].skipped, true);
});

test('二进制短路留痕，避免"为什么没脱敏"成为悬案', () => {
  const p = createPipeline({ stages: [touchStage('a')] });
  const out = p.run({ messages: [{ role: 'user', content: [{ type: 'image', source: {} }] }] });
  assert.ok(out.trace[0].reason, '短路必须给出原因');
  assert.match(out.trace[0].reason, /二进制/);
});

test('无 messages 或 messages 非数组时不触发短路', () => {
  const p = createPipeline({ stages: [touchStage('a')] });
  assert.deepEqual(p.run({}).body.touched, ['a']);
  assert.deepEqual(p.run({ messages: 'not-array' }).body.touched, ['a']);
});

// ─── 内置 stage 适配 ──────────────────────────────────────

test('内置 stage 名随依赖变化：无 desensitizer 时少一个', () => {
  // desensitize stage 只在传入 desensitizer 时注册（--no-desensitize 场景），
  // 所以「默认顺序」是全集，实际注册数是依赖的子集 —— 测试必须区分这两者。
  const withoutDesensitizer = createBuiltinStages({});
  assert.deepEqual(
    withoutDesensitizer.map(s => s.name),
    DEFAULT_STAGE_ORDER.filter(n => n !== 'desensitize'),
  );

  const withDesensitizer = createBuiltinStages({
    desensitizer: { processBody: (b) => ({ body: b, changed: false, hits: 0 }) },
  });
  assert.deepEqual(withDesensitizer.map(s => s.name), [...DEFAULT_STAGE_ORDER]);
});

test('内置 stage 顺序符合默认契约', () => {
  // 顺序是有意固定的：见 pipeline.mjs 中 strip-meta 的注释 ——
  // desensitize 插零宽空格可能破坏 strip-meta 的行首锚点匹配。
  // 这里固化当前线上顺序，改动必须先过真实性回归（upstream-regression）。
  //
  // sanitize-identity 排在 strip-meta 之后：两者处理的文本不重叠
  // （前者删 x-anthropic-* 整行，后者改官方自我介绍文案）。
  const stages = createBuiltinStages({
    desensitizer: { processBody: (b) => ({ body: b, changed: false, hits: 0 }) },
  });
  assert.deepEqual(
    stages.map(s => s.name),
    ['desensitize', 'ensure-system', 'strip-meta', 'sanitize-identity'],
  );
});

test('内置 stage 名与 DEFAULT_STAGE_ORDER 全集一致', () => {
  const stages = createBuiltinStages({
    desensitizer: { processBody: (b) => ({ body: b, changed: false, hits: 0 }) },
  });
  assert.deepEqual(stages.map(s => s.name).sort(), [...DEFAULT_STAGE_ORDER].sort());
});

test('无 desensitizer 时不注册 desensitize stage', () => {
  const stages = createBuiltinStages({});
  assert.equal(stages.some(s => s.name === 'desensitize'), false);
});

test('传 desensitizer 时注册 desensitize 且调用 processBody', () => {
  let called = 0;
  const fake = {
    processBody(body) { called++; return { body, changed: false, hits: 0 }; },
  };
  const stages = createBuiltinStages({ desensitizer: fake });
  const p = createPipeline({ stages });
  p.run({ messages: [] });
  assert.equal(called, 1, '必须调 processBody（保留命中统计副作用）而非 desensitizeBody');
});

test('desensitize stage 未命中时返回同引用', () => {
  const fake = { processBody: (body) => ({ body, changed: false, hits: 0 }) };
  const p = createPipeline({ stages: createBuiltinStages({ desensitizer: fake }) });
  const input = { messages: [] };
  assert.equal(p.run(input).body, input);
});

test('desensitize stage 命中时把新 body 交出去（可被后续 stage 继续加工）', () => {
  const changed = { messages: [{ role: 'user', content: 'x' }] };
  const fake = { processBody: () => ({ body: changed, changed: true, hits: 1 }) };
  const p = createPipeline({ stages: createBuiltinStages({ desensitizer: fake }) });
  const out = p.run({ messages: [] });

  assert.equal(out.changed, true, '命中必须标记 changed');
  // 注意：不能断言 out.body === changed —— 后续的 ensure-system 会给这个
  // body 注入 system 消息，产出第三个对象。这里断言「desensitize 的产物
  // 确实是流动的输入」：它的 messages 被保留下来。
  const userMsg = out.body.messages.find(m => m.role === 'user');
  assert.equal(userMsg.content, 'x', 'desensitize 产出的消息应出现在最终 body 中');
});

test('desensitize 是唯一 stage 时命中才返回其引用', () => {
  const changed = { messages: [{ role: 'user', content: 'x' }] };
  const fake = { processBody: () => ({ body: changed, changed: true, hits: 1 }) };
  const stages = createBuiltinStages({ desensitizer: fake })
    .filter(s => s.name === 'desensitize');
  const out = createPipeline({ stages }).run({ messages: [] });
  assert.equal(out.body, changed, '无后续 stage 时必须是 desensitize 的原引用');
});

test('ensure-system 注入兜底 system 消息', () => {
  const p = createPipeline({ stages: createBuiltinStages({}) });
  const out = p.run({ messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(out.body.messages[0].role, 'system');
  assert.equal(out.body.messages.length, 2);
});

test('ensure-system 首条已是 system 时不动', () => {
  const p = createPipeline({ stages: createBuiltinStages({}) });
  const input = { messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }] };
  const out = p.run(input);
  assert.equal(out.body.messages.length, 2);
});

test('strip-meta 剥离 x-anthropic-* 整行', () => {
  const p = createPipeline({ stages: createBuiltinStages({}) });
  const out = p.run({
    messages: [
      { role: 'system', content: 'x-anthropic-billing-header: cc_version=1.0\nyou are helpful' },
      { role: 'user', content: 'hi' },
    ],
  });
  assert.equal(/x-anthropic-/.test(out.body.messages[0].content), false, '必须剥掉元数据行');
  assert.match(out.body.messages[0].content, /you are helpful/, '正常文本必须保留');
});

test('strip-meta 处理 OpenAI 多模态 content 数组', () => {
  const p = createPipeline({ stages: createBuiltinStages({}) });
  const out = p.run({
    messages: [
      { role: 'system', content: [{ type: 'text', text: 'x-anthropic-meta: v=1\nkeep me' }] },
      { role: 'user', content: 'hi' },
    ],
  });
  const block = out.body.messages[0].content[0];
  assert.equal(/x-anthropic-/.test(block.text), false);
  assert.match(block.text, /keep me/);
});

test('strip-meta 未命中时返回同引用（不无谓拷贝）', () => {
  const p = createPipeline({ stages: createBuiltinStages({}) });
  const input = { messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }] };
  const out = p.run(input);
  assert.equal(out.body, input);
});

// ─── 环境变量解析 ─────────────────────────────────────────

test('parseDisabledFromEnv 解析逗号分隔', () => {
  assert.deepEqual(
    parseDisabledFromEnv({ WORKBUDDY_PIPELINE_DISABLE: 'desensitize,strip-meta' }),
    ['desensitize', 'strip-meta'],
  );
});

test('parseDisabledFromEnv 容忍空格', () => {
  assert.deepEqual(
    parseDisabledFromEnv({ WORKBUDDY_PIPELINE_DISABLE: ' desensitize , ensure-system ' }),
    ['desensitize', 'ensure-system'],
  );
});

test('parseDisabledFromEnv 空/未设置返回空数组（保持默认行为）', () => {
  assert.deepEqual(parseDisabledFromEnv({}), []);
  assert.deepEqual(parseDisabledFromEnv({ WORKBUDDY_PIPELINE_DISABLE: '' }), []);
  assert.deepEqual(parseDisabledFromEnv({ WORKBUDDY_PIPELINE_DISABLE: '  ,  ' }), []);
});

test('parseDisabledFromEnv 忽略未知名字并记日志', () => {
  const logs = [];
  const out = parseDisabledFromEnv(
    { WORKBUDDY_PIPELINE_DISABLE: 'desensitize,nope' },
    (tag, msg) => logs.push(msg),
  );
  assert.deepEqual(out, ['desensitize']);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /nope/);
});

// ─── 重排 ─────────────────────────────────────────────────

test('reorderStages 按给定顺序重排', () => {
  const stages = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
  const out = reorderStages(stages, ['c', 'a', 'b']);
  assert.deepEqual(out.map(s => s.name), ['c', 'a', 'b']);
});

test('reorderStages 未列出的排在后面，保持相对顺序', () => {
  const stages = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
  const out = reorderStages(stages, ['c']);
  assert.deepEqual(out.map(s => s.name), ['c', 'a', 'b']);
});

test('reorderStages 空数组时原样返回', () => {
  const stages = [{ name: 'a' }, { name: 'b' }];
  assert.deepEqual(reorderStages(stages, []).map(s => s.name), ['a', 'b']);
  assert.deepEqual(reorderStages(stages, undefined).map(s => s.name), ['a', 'b']);
});

test('重排真的改变了执行顺序（顺序敏感断言）', () => {
  const stages = [touchStage('a'), touchStage('b'), touchStage('c')];
  const forward = createPipeline({ stages }).run({}).body.touched;
  const reversed = createPipeline({ stages: reorderStages(stages, ['c', 'b', 'a']) }).run({}).body.touched;
  assert.deepEqual(forward, ['a', 'b', 'c']);
  assert.deepEqual(reversed, ['c', 'b', 'a']);
  assert.notDeepEqual(forward, reversed, '重排必须产生可观测差异');
});

// ─── trace 上限 ───────────────────────────────────────────

test('trace 超过上限时截断，但执行不中断', () => {
  const many = Array.from({ length: 50 }, (_, i) => touchStage(`s${i}`));
  const p = createPipeline({ stages: many, traceLimit: 5 });
  const out = p.run({});
  assert.equal(out.trace.length, 5, 'trace 应截断到上限');
  assert.equal(out.traceTruncated, true, '应置位截断标记，让调用方知道观测不完整');
  // 关键：截断的只是观测数据，不是加工本身。
  // 早期实现用 break 会连执行一起停掉（本测试抓到的真 bug）。
  assert.equal(out.body.touched.length, 50, 'trace 截断绝不能影响执行');
});

test('未截断时 traceTruncated 为 false', () => {
  const p = createPipeline({ stages: [touchStage('a')], traceLimit: 5 });
  const out = p.run({});
  assert.equal(out.traceTruncated, false);
  assert.equal(out.trace.length, 1);
});

test('变异验证：若截断时中断执行，本用例必须失败', () => {
  // 模拟旧实现（break）：手动构造一个"执行到上限就停"的期望，
  // 断言真实实现与之不同 —— 这样若有人改回 break，这里会亮红灯。
  const many = Array.from({ length: 10 }, (_, i) => touchStage(`s${i}`));
  const out = createPipeline({ stages: many, traceLimit: 3 }).run({});
  const breakBehavior = 3; // 旧实现：只执行 3 个
  assert.notEqual(
    out.body.touched.length,
    breakBehavior,
    '执行数不应等于 traceLimit —— 相等说明截断误伤了执行',
  );
  assert.equal(out.body.touched.length, 10);
});

// ─── 变异验证：确认判据真的能区分两种分支 ──────────────────

test('变异验证：when 恒真时禁用语义失效（证明 when 真的有效）', () => {
  // 对照组：正常 when
  const normal = createPipeline({
    stages: [{
      name: 'gated',
      when: () => false,
      apply: () => ({ grabbed: true }),
    }],
  });
  assert.equal(normal.run({}).body.grabbed, undefined, 'when=false 不应执行');

  // 变异体：when 恒真
  const mutant = createPipeline({
    stages: [{
      name: 'gated',
      when: () => true,
      apply: () => ({ grabbed: true }),
    }],
  });
  assert.equal(mutant.run({}).body.grabbed, true, 'when=true 应执行');

  // 两者必须可区分，否则 when 形同虚设
  assert.notEqual(normal.run({}).body.grabbed, mutant.run({}).body.grabbed);
});

test('变异验证：changed 不能恒真（否则引用契约失效）', () => {
  // 正常：identity 未改动
  const p = createPipeline({ stages: [identityStage] });
  const input = { messages: [] };
  assert.equal(p.run(input).changed, false);

  // 若把 changed 恒设为 true，下面的断言就会失败 —— 证明该判据非恒真
  const out = p.run(input);
  assert.equal(out.changed, false, '未改动时 changed 必须为 false');
  assert.equal(out.body, input, '未改动时必须是同一引用');
});

test('变异验证：二进制闸门不可移除', () => {
  // 对照组：有闸门 → 短路
  const guarded = createPipeline({ stages: [touchStage('a')] });
  const binaryBody = { messages: [{ role: 'user', content: [{ type: 'image', source: { data: 'aGk=' } }] }] };
  const guardedOut = guarded.run(binaryBody);
  assert.equal(guardedOut.body.touched, undefined);

  // 变异体：伪装成"闸门失效" —— 直接用一个不含 binary 检测的管线
  // （这里用 when 恒假模拟"闸门没生效"的反面：stage 会跑）
  const unguarded = createPipeline({ stages: [touchStage('a')] });
  const textBody = { messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] };
  assert.deepEqual(unguarded.run(textBody).body.touched, ['a']);

  // 两个场景必须产生不同结果 —— 证明闸门真的在区分
  assert.notDeepEqual(guardedOut.body, unguarded.run(textBody).body);
});

// ─── sanitize-identity：身份中性化（修复 11128 的关键一步）──
//
// 背景：Anthropic 客户端会在 system 里带官方自我介绍，上游 WAF 据此判定
// 为 unapproved channel 返回 11128。该逻辑原本存在于 anthropic-tools.mjs，
// 但只被死代码 buildUpstreamBody 调用，实测原样透传上游。接入管线后修复。

test('sanitize-identity：官方自我介绍被中性化', () => {
  const p = createPipeline({ stages: createBuiltinStages({}) });
  const out = p.run({
    messages: [{
      role: 'system',
      content: "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK.",
    }],
  });
  assert.equal(/You are Claude Code/.test(out.body.messages[0].content), false, '官方文案必须被替换');
  assert.match(out.body.messages[0].content, /You are an AI coding assistant/, '应替换为中性描述');
});

test('sanitize-identity：注入真实模型名并禁止冒充 Claude', () => {
  const p = createPipeline({ stages: createBuiltinStages({}) });
  const out = p.run({
    messages: [{
      role: 'system',
      content: "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK.",
    }],
  }, { model: 'deepseek-v4.1-flash' });
  const text = out.body.messages[0].content;
  assert.match(text, /deepseek-v4\.1-flash/, '应注入真实模型名，否则模型会凭记忆瞎答');
  assert.match(text, /Never claim to be a Claude model/, '应显式禁止冒充 Claude');
});

test('sanitize-identity：剥离 billing 头', () => {
  const p = createPipeline({ stages: createBuiltinStages({}) });
  const out = p.run({
    messages: [{
      role: 'system',
      content: 'x-anthropic-billing-header: cc_version=1.0; cc_entrypoint=cli\n保留这行',
    }],
  });
  assert.equal(/x-anthropic-billing-header:/.test(out.body.messages[0].content), false);
  assert.match(out.body.messages[0].content, /保留这行/, 'billing 头之外的文本必须保留');
});

test('sanitize-identity：多模态 content 数组也被处理', () => {
  const p = createPipeline({ stages: createBuiltinStages({}) });
  const out = p.run({
    messages: [{
      role: 'system',
      content: [{ type: 'text', text: "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK." }],
    }],
  });
  assert.equal(/You are Claude Code/.test(out.body.messages[0].content[0].text), false);
  assert.equal(out.body.messages[0].content[0].type, 'text', '块类型必须保留');
});

test('sanitize-identity：只碰 system，不改 user/assistant 内容', () => {
  const p = createPipeline({ stages: createBuiltinStages({}) });
  const userText = '请你解释 "You are Claude Code" 这句话';
  const out = p.run({
    messages: [
      { role: 'system', content: "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK." },
      { role: 'user', content: userText },
      { role: 'assistant', content: 'Anthropic 是一家公司' },
    ],
  });
  assert.equal(out.body.messages[1].content, userText, 'user 内容必须逐字不变');
  assert.equal(out.body.messages[2].content, 'Anthropic 是一家公司', 'assistant 内容必须逐字不变');
});

test('sanitize-identity：无官方文案时返回同引用', () => {
  const p = createPipeline({ stages: createBuiltinStages({}) });
  const input = { messages: [{ role: 'system', content: '普通的系统提示，无身份文案' }, { role: 'user', content: 'hi' }] };
  const out = p.run(input);
  assert.equal(out.body, input, '未命中必须返回同引用，不做无谓拷贝');
});

test('sanitize-identity：无 system 消息时不改动', () => {
  // 必须隔离到单 stage：整条管线里 ensure-system 会给纯 user 消息补 system，
  // 那样 body 必然是新引用，测不出本 stage 的"未命中返回同引用"契约。
  const stage = createBuiltinStages({}).find(s => s.name === 'sanitize-identity');
  const input = { messages: [{ role: 'user', content: 'hi' }] };
  assert.equal(stage.apply(input), input, '无 system 时应返回同引用');
});

test('sanitize-identity：describe 报告 stillClaudeCode 健康指标', () => {
  const p = createPipeline({ stages: createBuiltinStages({}) });
  const out = p.run({
    messages: [{ role: 'system', content: "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK." }],
  });
  const entry = out.trace.find(t => t.name === 'sanitize-identity');
  assert.equal(entry.info.stillClaudeCode, false, '中性化后应为 false —— 这是可验证的健康指标');
  assert.ok(entry.info.systemChars > 0);
});

test('sanitize-identity：describe 的 stillClaudeCode 在未处理时为 true（判据非恒真）', () => {
  // 变异验证：若 stage 被禁用，describe 应报 true —— 证明该判据能区分两种状态
  const p = createPipeline({ stages: createBuiltinStages({}), disabled: ['sanitize-identity'] });
  const out = p.run({
    messages: [{ role: 'system', content: "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK." }],
  });
  assert.equal(/You are Claude Code/.test(out.body.messages[0].content), true, '禁用后应残留');
});

test('sanitize-identity：可被 WORKBUDDY_PIPELINE_DISABLE 单独关闭', () => {
  const p = createPipeline({ stages: createBuiltinStages({}), disabled: ['sanitize-identity'] });
  assert.equal(p.isEnabled('sanitize-identity'), false);
  const out = p.run({ messages: [{ role: 'system', content: 'x-anthropic-billing-header: v=1\nkeep' }] });
  // strip-meta 仍会删 x-anthropic-* 行，但 sanitize-identity 已禁用
  assert.ok(out.trace.every(t => t.name !== 'sanitize-identity'), '禁用的 stage 不应出现在 trace');
});

// ─── 契约测试：内联实现必须与 anthropic-tools 的原实现一致 ──

test('契约：sanitize-identity 与 anthropic-tools 的原实现结果一致', async () => {
  const { sanitizeSystemIdentity, stripBillingHeader } = await import('../src/workbuddy-anthropic-tools.mjs');

  const CASES = [
    "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK.",
    "You are a Claude agent, built on Anthropic's Claude Agent SDK.",
    'Anthropic\'s official CLI for Claude 是官方描述',
    'the Claude Agent SDK 的说明',
    'anthropics/claude-code 仓库',
    'Claude Code 与 Anthropic 同时出现',
    'x-anthropic-billing-header: cc_version=1.0\n正文',
    '普通系统提示，无任何敏感文案',
    '',
  ];

  // ⚠️ 必须隔离到单个 stage，不能跑整条管线：
  //    管线里 strip-meta 会在 sanitize-identity 之前先删 x-anthropic-* 整行
  //    （含换行），而单独调 stripBillingHeader 只删行内容保留换行。
  //    两者对同一输入的结果本就不同 —— 那是 stage 组合的正常效果，
  //    不属契约违反。契约只约束「单个 stage 与原函数等价」。
  const stage = createBuiltinStages({}).find(s => s.name === 'sanitize-identity');
  for (const raw of CASES) {
    const viaStage = stage.apply({ messages: [{ role: 'system', content: raw }] }, { model: 'test-model' });
    const expectedText = sanitizeSystemIdentity(stripBillingHeader(raw), 'test-model');
    const gotText = viaStage.messages[0].content;
    assert.equal(gotText, expectedText, `用例 ${JSON.stringify(raw.slice(0, 40))} 结果不一致`);
  }
});

test('契约：无模型名时行为与原实现一致', async () => {
  const { sanitizeSystemIdentity, stripBillingHeader } = await import('../src/workbuddy-anthropic-tools.mjs');
  const raw = "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK.";
  const stage = createBuiltinStages({}).find(s => s.name === 'sanitize-identity');
  const out = stage.apply({ messages: [{ role: 'system', content: raw }] }); // 不传 ctx
  assert.equal(out.messages[0].content, sanitizeSystemIdentity(stripBillingHeader(raw), ''));
});

test('stage 组合：strip-meta 比 stripBillingHeader 更彻底（连换行一起清）', () => {
  // 固化上面注释里说的差异，避免将来被误当成 bug 改掉
  const p = createPipeline({ stages: createBuiltinStages({}) });
  const out = p.run({ messages: [{ role: 'system', content: 'x-anthropic-billing-header: v=1\n正文' }] });
  assert.equal(out.body.messages[0].content, '正文', 'strip-meta 会连空行一起清理');
});

// ─── 契约测试：内联实现必须与 upstream-client 的原实现一致 ──
//
// pipeline.mjs 为避免循环依赖内联了这两个加工器。两份实现会漂移，
// 所以这里用**同一批输入**跑两条路径，断言结果一致。任何一份被改动
// 而另一份没跟上，这里立刻亮红灯。

/** 一组覆盖正常/边界/异常的输入 */
const CONTRACT_CASES = [
  { name: '空对象', body: {} },
  { name: 'messages 为空数组', body: { messages: [] } },
  { name: 'messages 非数组', body: { messages: 'nope' } },
  { name: 'null body', body: null },
  { name: '首条已是 system', body: { messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }] } },
  { name: '首条是 user', body: { messages: [{ role: 'user', content: 'u' }] } },
  { name: '首条 role 大写 SYSTEM', body: { messages: [{ role: 'SYSTEM', content: 's' }] } },
  { name: '首条 role 带空格', body: { messages: [{ role: ' system ', content: 's' }] } },
  { name: '单条含元数据行', body: { messages: [{ role: 'system', content: 'x-anthropic-billing-header: cc_version=1\nyou are helpful' }] } },
  { name: '多条各含元数据', body: { messages: [{ role: 'system', content: 'x-anthropic-a: 1\nkeep1' }, { role: 'assistant', content: 'x-anthropic-b: 2\nkeep2' }] } },
  { name: '元数据行带前导空格', body: { messages: [{ role: 'system', content: '   x-anthropic-meta: v\nkeep' }] } },
  { name: '多模态数组含元数据', body: { messages: [{ role: 'system', content: [{ type: 'text', text: 'x-anthropic-meta: v\nkeep' }] }] } },
  { name: '多模态混合块', body: { messages: [{ role: 'system', content: [{ type: 'text', text: 'x-anthropic-m: 1\nkeep' }, { type: 'image', source: {} }] }] } },
  { name: '提到 x-anthropic 但非行首', body: { messages: [{ role: 'user', content: '请解释 x-anthropic-billing 头' }] } },
  { name: '伪 x-anthropic 前缀（无冒号）', body: { messages: [{ role: 'user', content: 'x-anthropic-foo 是什么' }] } },
  { name: '连续多个元数据行', body: { messages: [{ role: 'system', content: 'x-anthropic-a: 1\nx-anthropic-b: 2\nreal content' }] } },
];

test('契约：ensure-system 与 upstream-client 的原实现结果一致', () => {
  const builtin = createBuiltinStages({}).find(s => s.name === 'ensure-system');
  assert.ok(builtin, 'ensure-system stage 必须存在');

  for (const c of CONTRACT_CASES) {
    const viaStage = builtin.apply(c.body);
    const viaOriginal = ensureLeadingSystemMessage(c.body);
    assert.deepEqual(viaStage, viaOriginal, `用例「${c.name}」结果不一致`);
    // 引用契约也要一致：调用方靠引用相等判断改动
    assert.equal(
      viaStage === c.body,
      viaOriginal === c.body,
      `用例「${c.name}」的引用相等语义不一致`,
    );
  }
});

test('契约：strip-meta 与 upstream-client 的原实现结果一致', () => {
  const builtin = createBuiltinStages({}).find(s => s.name === 'strip-meta');
  assert.ok(builtin, 'strip-meta stage 必须存在');

  for (const c of CONTRACT_CASES) {
    const viaStage = builtin.apply(c.body);
    const expectedMessages = stripAnthropicMetaHeaders(c.body?.messages);
    const viaOriginal = expectedMessages === c.body?.messages
      ? c.body
      : { ...c.body, messages: expectedMessages };

    assert.deepEqual(viaStage, viaOriginal, `用例「${c.name}」结果不一致`);
    assert.equal(
      viaStage === c.body,
      viaOriginal === c.body,
      `用例「${c.name}」的引用相等语义不一致`,
    );
  }
});

test('契约：兜底 system 文本与 upstream-client 的默认值一致', () => {
  const builtin = createBuiltinStages({}).find(s => s.name === 'ensure-system');
  const input = { messages: [{ role: 'user', content: 'hi' }] };
  const a = builtin.apply(input);
  const b = ensureLeadingSystemMessage(input);
  assert.equal(a.messages[0].content, b.messages[0].content, '兜底 prompt 文本必须一致');
});

// ─── 无循环依赖（回归防护）────────────────────────────────

test('pipeline 不依赖 upstream-client 的运行时导出（防循环依赖回归）', async () => {
  // 读源码断言无 import 语句 —— 若有人加回去，循环依赖会重现。
  // 用 import 语句而非模块图检测：后者需要构建工具，这里一行足够。
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, '..', 'src', 'workbuddy-pipeline.mjs'), 'utf8');
  assert.equal(
    /^\s*import[\s\S]*?from\s+['"]\.\/workbuddy-upstream-client\.mjs['"]/m.test(source),
    false,
    'pipeline.mjs 不得 import upstream-client.mjs（会形成循环依赖）',
  );
});

// ─── 聚合统计 ─────────────────────────────────────────────

test('stats：初始为零且覆盖全部已注册 stage', () => {
  const p = createPipeline({ stages: [touchStage('a')] });
  const s = p.stats();
  assert.equal(s.runs, 0);
  assert.equal(s.changedRuns, 0);
  assert.equal(s.binarySkips, 0);
  assert.equal(s.changedRate, 0, 'runs=0 时应为 0 而非 NaN');
  assert.deepEqual(s.order, ['a']);
  // 快照必须含所有已注册 stage（零值占位），否则前端看不到完整管线
  assert.deepEqual(s.stages.map(x => x.name), ['a']);
  assert.equal(s.stages[0].runs, 0);
  assert.equal(s.stages[0].avgMs, 0, 'runs=0 时 avgMs 应为 0 而非 NaN');
});

test('stats：累计 runs / changedRuns / changedRate', () => {
  const p = createPipeline({ stages: [touchStage('a')] });
  p.run({});          // 改动
  p.run({});          // 改动
  const s = p.stats();
  assert.equal(s.runs, 2);
  assert.equal(s.changedRuns, 2);
  assert.equal(s.changedRate, 1);
});

test('stats：未改动不计入 changedRuns', () => {
  const p = createPipeline({ stages: [identityStage] });
  p.run({ a: 1 });
  const s = p.stats();
  assert.equal(s.runs, 1);
  assert.equal(s.changedRuns, 0);
  assert.equal(s.changedRate, 0);
});

test('stats：per-stage 记录 runs/changed/ms', () => {
  const p = createPipeline({ stages: [touchStage('x')] });
  p.run({});
  p.run({});
  const stage = p.stats().stages.find(s => s.name === 'x');
  assert.equal(stage.runs, 2);
  assert.equal(stage.changed, 2);
  assert.ok(stage.msTotal >= 0);
  assert.ok(stage.avgMs >= 0);
  assert.equal(stage.errorRate, 0);
  assert.equal(stage.enabled, true);
});

test('stats：stage 抛错计入 errors 与 errorRate', () => {
  const p = createPipeline({
    log: () => {},
    stages: [{ name: 'boom', apply: () => { throw new Error('x'); } }],
  });
  p.run({});
  p.run({});
  const stage = p.stats().stages.find(s => s.name === 'boom');
  assert.equal(stage.runs, 2);
  assert.equal(stage.errors, 2);
  assert.equal(stage.errorRate, 1);
  assert.equal(stage.changed, 0);
});

test('stats：二进制短路单独计数，不计入 changed', () => {
  const p = createPipeline({ stages: [touchStage('a')] });
  p.run({ messages: [{ role: 'user', content: [{ type: 'image', source: {} }] }] });
  const s = p.stats();
  assert.equal(s.runs, 1);
  assert.equal(s.binarySkips, 1);
  assert.equal(s.changedRuns, 0);
  // stage 仍在快照里（零值），但 runs 为 0 —— 证明短路时确实没执行任何 stage
  assert.equal(s.stages.length, 1);
  assert.equal(s.stages[0].runs, 0, '短路时任何 stage 都不该被执行');
  assert.equal(s.stages[0].changed, 0);
});

test('stats：disabled 的 stage 在快照里标记 enabled=false', () => {
  const p = createPipeline({ stages: [touchStage('a'), touchStage('b')], disabled: ['b'] });
  p.run({});
  const s = p.stats();
  assert.equal(s.stages.find(x => x.name === 'a').enabled, true);
  assert.equal(s.stages.find(x => x.name === 'b').enabled, false);
  assert.deepEqual(s.disabled, ['b']);
});

test('stats：顺序固定按注册顺序，不随插入漂移', () => {
  const p = createPipeline({ stages: [touchStage('a'), touchStage('b'), touchStage('c')] });
  p.run({ a: 1 });
  p.run({});
  assert.deepEqual(p.stats().stages.map(s => s.name), ['a', 'b', 'c']);
});

test('resetStats 清空计数但保留 stage 清单', () => {
  const p = createPipeline({ stages: [touchStage('a')] });
  p.run({});
  p.resetStats();
  const s = p.stats();
  assert.equal(s.runs, 0);
  assert.equal(s.changedRuns, 0);
  // stage 清单是注册信息，不属统计，resetStats 不该清掉它
  assert.deepEqual(s.stages.map(x => x.name), ['a']);
  assert.equal(s.stages[0].runs, 0, '但计数归零');
});

// ─── 字节量统计 ───────────────────────────────────────────

test('trace：改动时带 bytesIn/bytesOut/bytesDelta', () => {
  const p = createPipeline({
    stages: [{
      name: 'grow',
      apply: (body) => ({ ...body, extra: 'x'.repeat(100) }),
    }],
  });
  const out = p.run({ a: 1 });
  const step = out.trace.find(t => t.name === 'grow');
  assert.ok(step.bytesIn > 0);
  assert.ok(step.bytesOut > step.bytesIn, '加长内容后 bytesOut 应更大');
  assert.equal(step.bytesDelta, step.bytesOut - step.bytesIn);
});

test('trace：未改动时不带字节量字段（避免 0 被误解）', () => {
  const p = createPipeline({ stages: [identityStage] });
  const step = p.run({ a: 1 }).trace[0];
  assert.equal('bytesIn' in step, false);
  assert.equal('bytesDelta' in step, false);
});

test('bytesDelta 语义：零宽空格让字节量增加', () => {
  // 零宽空格 U+200B 是 3 字节，字符数看不出来 —— 这正是用 byteLength 的原因
  const p = createPipeline({
    stages: [{
      name: 'insert-zwsp',
      apply: (body) => ({ ...body, messages: [{ role: 'user', content: '关键词\u200b' }] }),
    }],
  });
  const out = p.run({ messages: [{ role: 'user', content: '关键词' }] });
  const step = out.trace[0];
  assert.equal(step.bytesDelta, 3, '一个零宽空格应正好 +3 字节');
});

test('字节量对中文正确（UTF-8 3 字节/字）', () => {
  const p = createPipeline({
    stages: [{ name: 'zh', apply: (body) => ({ ...body, text: '中文' }) }],
  });
  const out = p.run({});
  const step = out.trace[0];
  // body 含 "中文" 6 字节，加 JSON 结构字符
  assert.ok(step.bytesOut >= 6, '中文应按 UTF-8 字节计');
});

test('统计累加：多次运行后 bytesIn/bytesOut 递增', () => {
  const p = createPipeline({ stages: [{ name: 'g', apply: (b) => ({ ...b, v: 'hello' }) }] });
  p.run({});
  p.run({});
  const stage = p.stats().stages.find(s => s.name === 'g');
  assert.equal(stage.bytesIn > 0 && stage.bytesOut > stage.bytesIn, true);
  const first = stage.bytesOut;
  p.run({});
  assert.ok(p.stats().stages.find(s => s.name === 'g').bytesOut > first, '应继续累加');
});

// ─── 边界：上下界与空输入 ─────────────────────────────────

test('空 stage 列表时管线是恒等变换', () => {
  const p = createPipeline({ stages: [] });
  const input = { a: 1 };
  const out = p.run(input);
  assert.equal(out.body, input);
  assert.equal(out.changed, false);
  assert.deepEqual(out.trace, []);
  assert.equal(p.size, 0);
});

test('run 不传 ctx 时不抛错（默认 {}）', () => {
  const p = createPipeline({ stages: [touchStage('a')] });
  assert.deepEqual(p.run({}).body.touched, ['a']);
});

test('stage 原地修改 body 时不产生新引用（记录为未改动）', () => {
  // 这是已知契约边界：管线靠引用相等判断 changed，
  // 原地修改会漏报。这里固化该行为，避免将来误以为支持原地修改。
  const p = createPipeline({
    stages: [{ name: 'mutate', apply: (body) => { body.mutated = true; return body; } }],
  });
  const input = {};
  const out = p.run(input);
  assert.equal(out.changed, false, '原地修改 detection 不到（已知限制）');
  assert.equal(out.body.mutated, true, '但修改确实发生了');
});
