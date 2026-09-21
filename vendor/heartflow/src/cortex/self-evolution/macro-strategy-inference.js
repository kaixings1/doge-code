/**
 * Macro Strategy Inference Engine
 * 基于新闻信号做战略推演：机会 / 风险 / 时间线 / 对 HeartFlow 的影响
 * 规则驱动 + 诚实低置信：无信号时返回 null，不编造结论。
 */
class MacroStrategyInference {
  constructor({ projectRoot, signalStore } = {}) {
    this.projectRoot = projectRoot || process.cwd();
    this.signalStore = signalStore || [];
  }

  /**
   * 主入口：接收文本，返回结构化推演。
   * 约定输入：新闻摘要 / 多条信号拼接文本。
   */
  infer(text) {
    if (!text || typeof text !== 'string') {
      return this._empty('empty_input');
    }
    const trimmed = text.trim();
    if (trimmed.length < 40) {
      return this._empty('input_too_short');
    }

    const signals = this._extractSignals(trimmed);
    if (!signals.length) {
      return this._empty('no_structured_signals');
    }

    const opportunities = this._matchOpportunities(signals);
    const risks = this._matchRisks(signals);
    const horizon = this._inferHorizon(signals);
    const heartflowImpact = this._heartflowImpact(signals);

    const confidence = this._confidence(signals, opportunities, risks);
    const conclusion = this._conclude(opportunities, risks, horizon);

    return {
      taskType: 'macro_strategy_inference',
      confidence,
      conclusion,
      reasoning: this._buildReasoning(signals, opportunities, risks, horizon, heartflowImpact),
      opportunities,
      risks,
      horizon,
      heartflowImpact,
      signalCount: signals.length,
      signals,
    };
  }

  _empty(reason) {
    return {
      taskType: 'macro_strategy_inference',
      confidence: 0,
      conclusion: null,
      reasoning: `inference declined: ${reason}`,
      opportunities: [],
      risks: [],
      horizon: null,
      heartflowImpact: [],
      signalCount: 0,
      signals: [],
    };
  }

  /**
   * 从文本中抽取结构化信号：实体 + 趋势 + 时间锚点。
   * 不依赖 LLM，用正则 + 词典。
   */
  _extractSignals(text) {
    const signals = [];
    const lower = text.toLowerCase();

    // 实体 / 公司
    const entities = [
      { name: '小米', aliases: ['小米', 'xiaomi', '玄戒'] },
      { name: '阿里巴巴', aliases: ['阿里', 'alibaba', '淘宝', '天猫'] },
      { name: '英伟达', aliases: ['英伟达', 'nvidia', 'nvda'] },
      { name: '三星', aliases: ['三星', 'samsung'] },
      { name: '宇树科技', aliases: ['宇树', 'unitree'] },
      { name: '中诚华隆', aliases: ['中诚华隆', 'hl200'] },
      { name: '华为', aliases: ['华为', 'huawei'] },
      { name: '苹果', aliases: ['苹果', 'apple'] },
      { name: '特斯拉', aliases: ['特斯拉', 'tesla'] },
      { name: 'OpenAI', aliases: ['openai'] },
      { name: 'DeepSeek', aliases: ['deepseek', '深度求索'] },
      { name: 'Meta', aliases: ['meta', 'facebook'] },
    ];
    for (const e of entities) {
      for (const a of e.aliases) {
        if (lower.includes(a.toLowerCase())) {
          signals.push({ type: 'entity', name: e.name, matched: a });
          break;
        }
      }
    }

    // 趋势 / 方向词
    const trends = [
      { label: '端侧AI', patterns: ['端侧', '本地部署', '端侧大模型', 'on-device', 'edge ai'] },
      { label: '算力基建', patterns: ['万卡', '集群', '算力', '推理芯片', 'gpu集群'] },
      { label: '具身智能', patterns: ['机器人', '人形机器人', '具身', '自动驾驶', '智驾'] },
      { label: 'AI监管', patterns: ['监管', '合规', '审计', '立法', '政策'] },
      { label: '地缘风险', patterns: ['制裁', '关税', '霍尔木兹海峡', '供应链', '脱钩'] },
      { label: '资本开支', patterns: ['配股', '财报', '投资', 'ipo', '市值', '回购'] },
      { label: '消费Agent', patterns: ['电商', '交易', '比价', '下单', '售后', '客服'] },
      { label: '开源模型', patterns: ['开源', 'llama', 'qwen', 'deepseek', 'mistral'] },
    ];
    for (const t of trends) {
      if (t.patterns.some(p => lower.includes(p.toLowerCase()))) {
        signals.push({ type: 'trend', label: t.label });
      }
    }

    // 时间锚点
    const timePatterns = [
      { label: '近期', patterns: ['今日', '今天', '本周', '下周', '刚刚', '最新', '宣布'] },
      { label: '中期', patterns: ['明年', '未来半年', '2026', '2027', '预计', '计划'] },
    ];
    for (const tp of timePatterns) {
      if (tp.patterns.some(p => lower.includes(p.toLowerCase()))) {
        signals.push({ type: 'time', label: tp.label });
        break;
      }
    }

    // 去重
    const seen = new Set();
    return signals.filter(s => {
      const key = `${s.type}:${s.label || s.name || s.matched}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  _matchOpportunities(signals) {
    const opps = [];
    const types = new Set(signals.map(s => s.type === 'entity' ? s.name : s.label));

    if (types.has('端侧AI') || types.has('小米')) opps.push({ label: '端侧Agent推理成本下压', driver: '芯片专用化让本地大模型推理延迟<100ms', horizon: '0-6个月' });
    if (types.has('具身智能') || types.has('宇树科技')) opps.push({ label: '具身智能场景验证期', driver: '从发布会指标转向工厂/物流重复场景订单', horizon: '3-12个月' });
    if (types.has('算力基建')) opps.push({ label: '国产算力套餐化', driver: '万卡集群变成基础入口，单卡算力不再稀缺', horizon: '0-6个月' });
    if (types.has('消费Agent') || types.has('阿里巴巴')) opps.push({ label: '交易型Agent入口之争', driver: '比价/下单/售后型Agent比聊天框更易商业化', horizon: '0-6个月' });
    if (types.has('地缘风险')) opps.push({ label: '国产替代叙事强化', driver: '供应链脆弱性推动国产芯片/模型采购意愿', horizon: '6-12个月' });
    if (types.has('AI监管') || types.has('合规')) opps.push({ label: 'Agent合规审计刚需', driver: '金融/电商/制造Agent落地前必须过判别审计', horizon: '0-3个月' });
    if (types.has('资本开支')) opps.push({ label: 'Infra筛选期整合', driver: '资本从盲目扩张转向挑着投，推理层优先', horizon: '3-6个月' });
    if (types.has('开源模型')) opps.push({ label: '开源模型生态红利', driver: '低成本基座模型降低Agent开发门槛', horizon: '0-6个月' });

    return opps;
  }

  _matchRisks(signals) {
    const risks = [];
    const types = new Set(signals.map(s => s.type === 'entity' ? s.name : s.label));

    if (types.has('地缘风险')) risks.push({ label: '供应链冲击', driver: '霍尔木兹海峡/东亚芯片竞争可能短期推高能源+物流成本', severity: 'high' });
    if (types.has('资本开支')) risks.push({ label: '估值修整', driver: '宇树/三星等显示AI/机器人概念股 reality check 已开始', severity: 'medium' });
    if (types.has('具身智能')) risks.push({ label: '机器人订单不及预期', driver: '量产爬坡慢于发布会节奏', severity: 'medium' });
    if (types.has('消费Agent') || types.has('阿里巴巴')) risks.push({ label: 'Agent商业化周期长', driver: '交易型Agent需要生态授权，不是单点技术问题', severity: 'medium' });
    if (types.has('AI监管')) risks.push({ label: '合规成本上升', driver: '多法域适配增加Agent本地化成本', severity: 'low' });

    return risks;
  }

  _inferHorizon(signals) {
    const hasShort = signals.some(s => s.type === 'time' && s.label === '近期');
    const hasMid = signals.some(s => s.type === 'time' && s.label === '中期');
    if (hasShort && hasMid) return 'short_mid';
    if (hasShort) return 'short';
    if (hasMid) return 'mid';
    return 'unspecified';
  }

  _heartflowImpact(signals) {
    const impacts = [];
    const types = new Set(signals.map(s => s.type === 'entity' ? s.name : s.label));

    if (types.has('消费Agent') || types.has('阿里巴巴')) impacts.push('交易型Agent需要输出真实性保险');
    if (types.has('具身智能')) impacts.push('具身智能需要工具调用安全+行为边界判别');
    if (types.has('AI监管') || types.has('合规')) impacts.push('企业合规审计是 HeartFlow 的直接 to-B 场景');
    if (types.has('开源模型')) impacts.push('开源模型降低 Agent 门槛 → 判别层成为必备保险');
    if (types.has('地缘风险')) impacts.push('地缘碎片化需要多法域内容合规层');
    if (types.has('算力基建')) impacts.push('国产算力自主可控与 Agent 安全审计形成闭环');
    return impacts;
  }

  _confidence(signals, opportunities, risks) {
    const n = signals.length;
    if (n >= 8 && opportunities.length >= 3) return 0.85;
    if (n >= 5 && opportunities.length >= 2) return 0.7;
    if (n >= 3) return 0.55;
    return 0.4;
  }

  _conclude(opportunities, risks, horizon) {
    if (!opportunities.length && !risks.length) return '信号不足，无法形成有效推演';
    const topOpp = opportunities[0]?.label || '机会待识别';
    const topRisk = risks[0]?.label || '风险待评估';
    const h = horizon === 'short' ? '短期(0-3个月)' : horizon === 'mid' ? '中期(3-12个月)' : '中短期';
    return `${h}主旋律：${topOpp}，同时警惕${topRisk}。`;
  }

  _buildReasoning(signals, opportunities, risks, horizon, heartflowImpact) {
    const lines = [
      `信号提取：${signals.length} 个结构化信号`,
      `时间 horizon：${horizon || 'unspecified'}`,
      `机会维度：${opportunities.map(o => o.label).join('、') || '无'}`,
      `风险维度：${risks.map(r => `${r.label}(${r.severity})`).join('、') || '无'}`,
      `HeartFlow 影响：${heartflowImpact.join('；') || '无直接映射'}`,
    ];
    return lines.join('\n');
  }

  getStats() {
    return {
      module: 'MacroStrategyInference',
      version: '7.0.0',
      ready: true,
    };
  }
}

module.exports = { MacroStrategyInference };
