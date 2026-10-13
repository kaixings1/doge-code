/* WorkBuddy 本地代理 · 请求加工管线面板（stage 开关 / 命中统计 / 字节增量） */
/* global workbuddyDesktop, wbApp */

/**
 * 与 desensitize-panel.js 同构：自持一份管线状态，独立于 app.js 的主 state。
 *
 * 为什么自持状态：/api/session 里不带管线明细（只有 stage 名字列表），
 * 若混进主 state 会被 refresh 覆盖成不完整的结构。
 *
 * 依赖 app.js 暴露的 window.wbApp（esc / toast）。
 */
(() => {
  const api = window.workbuddyAPI || window.workbuddyDesktop;
  const $ = id => document.getElementById(id);

  let panelBusy = false;
  /** 最近一次从后端读到的完整管线状态 */
  let current = null;

  // ─── 计算 ──────────────────────────────────

  /**
   * 把「是否命中过」翻译成人能一眼看懂的档位。
   *
   * 为什么分档而不是直接显示百分比：单次请求下命中率只有 0%/100%，
   * 数字反而不如「命中 3/10 次」直观。而「从未运行」必须与「运行了但没命中」
   * 区分开 —— 前者说明 stage 被禁用或请求没走到这一步，是要排查的信号。
   */
  function hitLevel(stage) {
    if (stage.runs === 0) return { cls: 'muted', text: '未运行' };
    if (stage.changed === 0) return { cls: 'muted', text: `运行 ${stage.runs} 次 · 未命中` };
    return { cls: 'ok', text: `命中 ${stage.changed}/${stage.runs} 次` };
  }

  /** 字节增量：正数变大、负数变小、0 无变化 */
  function formatBytes(delta) {
    if (!delta) return '±0';
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta}`;
  }

  /**
   * 字节增量按语义着色：变小（删数据）与变大（注入数据）是两回事，
   * 用同一个灰色会让人以为「没变化」。
   */
  function byteClass(delta) {
    if (!delta) return 'muted';
    return delta > 0 ? 'grow' : 'shrink';
  }

  /** 时间量级自适应：多数 stage 是亚毫秒级，直接显示 0ms 会误导为「没执行」 */
  function formatMs(avgMs) {
    if (!avgMs) return '<0.01ms';
    if (avgMs < 1) return `${avgMs}ms`;
    return `${Math.round(avgMs)}ms`;
  }

  // ─── 渲染 ──────────────────────────────────

  function render(data) {
    if (data !== undefined) current = data;
    const badge = $('pipeline-badge');
    const list = $('pipeline-stages');
    if (!badge || !list) return;

    if (!current) {
      badge.className = 'badge warn';
      badge.textContent = '不可用';
      list.innerHTML = '<div class="empty" style="padding:14px 0">代理未返回管线状态</div>';
      return;
    }

    const stages = Array.isArray(current.stages) ? current.stages : [];
    const enabled = stages.filter(s => s.enabled).length;
    const disabled = stages.length - enabled;

    badge.className = disabled ? 'badge warn' : 'badge ok';
    badge.textContent = disabled ? `${enabled}/${stages.length} 步启用` : `${stages.length} 步全部启用`;

    // 汇总统计
    $('pipeline-runs').textContent = String(current.runs ?? 0);
    $('pipeline-changed').textContent = String(current.changedRuns ?? 0);
    const rate = Number(current.changedRate || 0);
    $('pipeline-rate').textContent = `${Math.round(rate * 100)}%`;
    $('pipeline-binary').textContent = String(current.binarySkips ?? 0);

    // 步骤列表
    if (!stages.length) {
      list.innerHTML = '<div class="empty" style="padding:14px 0">管线里没有步骤</div>';
      return;
    }

    list.innerHTML = stages.map((stage, index) => {
      const hit = hitLevel(stage);
      const isOff = !stage.enabled;
      return `
        <div class="pipeline-stage${isOff ? ' off' : ''}">
          <span class="pipeline-index">${index + 1}</span>
          <span class="pipeline-name" title="${esc(stage.name)}">${esc(stage.name)}</span>
          <span class="pipeline-hit ${hit.cls}">${esc(hit.text)}</span>
          <span class="pipeline-bytes ${byteClass(stage.bytesDelta)}" title="本步让请求体变化的字节数">${esc(formatBytes(stage.bytesDelta))}</span>
          <span class="pipeline-ms muted" title="平均耗时">${esc(formatMs(stage.avgMs))}</span>
          ${stage.errors ? `<span class="pipeline-err" title="执行失败次数">错误 ${esc(String(stage.errors))}</span>` : ''}
          <label class="switch pipeline-switch" title="${isOff ? '点击启用这一步' : '点击临时禁用这一步'}">
            <input type="checkbox" data-stage="${esc(stage.name)}"${isOff ? '' : ' checked'}>
            <span class="track"></span>
          </label>
        </div>`;
    }).join('');
  }

  /** 从后端拉完整状态并渲染 */
  async function load() {
    if (!api?.getPipeline) { render(null); return; }
    try {
      render(await api.getPipeline());
    } catch (error) {
      console.warn('读取管线状态失败:', error.message);
      render(null);
    }
  }

  // ─── 操作 ──────────────────────────────────

  function apply(data) {
    if (data && typeof data === 'object') render(data);
  }

  async function guard(button, label, action) {
    if (panelBusy) return;
    panelBusy = true;
    const original = button?.textContent;
    if (button) { button.disabled = true; if (label) button.textContent = label; }
    try {
      await action();
    } catch (error) {
      toast(`操作失败：${error.message}`, 'err');
    } finally {
      panelBusy = false;
      if (button) { button.disabled = false; if (label) button.textContent = original; }
    }
  }

  async function toggleStage(name, enabled) {
    if (!api?.setPipelineStage) { toast('当前客户端不支持该操作', 'err'); return; }
    await guard(null, null, async () => {
      apply(await api.setPipelineStage(name, enabled));
      toast(enabled ? `✅ 已启用 ${name}` : `已临时禁用 ${name}（重启后恢复）`);
    });
    // 失败时把开关拨回真实状态 —— 否则界面会与后端不一致
    const box = document.querySelector(`#pipeline-stages input[data-stage="${CSS.escape(name)}"]`);
    if (box && current) {
      const real = current.stages?.find(s => s.name === name);
      if (real) box.checked = real.enabled;
    }
  }

  async function resetStats() {
    if (!api?.resetPipelineStats) { toast('当前客户端不支持该操作', 'err'); return; }
    await guard($('btn-pipeline-reset-stats'), '重置中…', async () => {
      apply(await api.resetPipelineStats());
      toast('管线统计已重置');
    });
  }

  // ─── 事件绑定 ──────────────────────────────

  const refreshButton = $('btn-pipeline-refresh');
  if (refreshButton) refreshButton.addEventListener('click', () => guard(refreshButton, '刷新中…', load));

  const resetButton = $('btn-pipeline-reset-stats');
  if (resetButton) resetButton.addEventListener('click', resetStats);

  $('pipeline-stages')?.addEventListener('change', event => {
    const box = event.target.closest('input[data-stage]');
    if (box) toggleStage(box.dataset.stage, box.checked);
  });

  window.wbPipelinePanel = { load, render };

  // 自持首屏加载：切页时 app.js 也会调 load()，这里保证刷新页面直接进入本页时也能显示
  void load();
})();
