/**
 * src/knowledge/classics-feedback.js
 *
 * 思想心虫古典规则反哺机制 v1
 * 从 search_guji.sh 命中原文中自动提取潜在新触发词，
 * 供规则维护者Review后手工加入 classics-rules.js。
 *
 * 设计原则：
 * 1. 只建议，不自动改写 classics-rules.js（规则变更需人工确认）
 * 2. 基于词频 + 现有触发词差集计算候选
 * 3. 与 classics-rules.js / classics-value-mapper.js 无循环依赖
 */

const fs = require('fs');
const path = require('path');

const CLASSICS_BASE = path.join(__dirname, '..', '..', '..', '..', 'daizhigev20');

/**
 * 从原始命中文本中提取高频候选词（2-4字中文词）
 * 简单实现：按标点/空白分词后统计，排除已知停用词
 */
function extractCandidateTerms(rawTexts, existingTriggers = []) {
  if (!Array.isArray(rawTexts) || rawTexts.length === 0) return [];
  const stopwords = new Set([
    '之', '乎', '者', '也', '而', '且', '若', '则', '其', '于', '以', '不', '无',
    '有', '是', '在', '于', '为', '曰', '云', '亦', '何', '焉', '哉', '矣', '焉',
    '所', '如', '斯', '此', '彼', '夫', '盖', '凡', '自', '从', '到', '得', '能',
    '可', '将', '与', '及', '或', '岂', '宁', '虽', '即', '必', '当', '未', '已',
    '但', '然', '所', '故', '况', '岂', '且', '今', '古', '上下', '前后', '左右',
    '东西', '南北', '内外', '大小', '多少', '长短', '高下', '远近', '彼此', '人物',
    '世', '时', '年', '月', '日', '生', '死', '去', '来', '入', '出', '行', '止',
    '言', '语', '心', '身', '手', '足', '目', '耳', '口', '首', '面', '声', '气',
    '天', '地', '人', '鬼', '神', '帝', '王', '公', '侯', '伯', '子', '男', '妃',
    '臣', '民', '父', '母', '子', '女', '兄', '弟', '姊', '妹', '夫', '妻', '朋',
    '友', '师', '弟子', '门人', '大夫', '君子', '小人', '圣人', '贤人', '仁人',
    '义人', '道人', '僧人', '道士', '隐者', '处士', '学者', '儒者', '墨者', '法家',
    '名家', '阴阳', '纵横', '农', '工', '商', '兵', '医', '卜', '筮', '占', '梦',
    '礼', '乐', '射', '御', '书', '数', '诗', '书', '易', '礼', '春秋', '大学',
    '中庸', '论语', '孟子', '孝经', '尔雅', '说文', '史记', '汉书', '后汉书', '三国志',
    '晋书', '宋书', '南齐书', '梁书', '陈书', '魏书', '北齐书', '周书', '隋书',
    '南史', '北史', '旧唐书', '新唐书', '旧五代史', '新五代史', '宋史', '辽史',
    '金史', '元史', '明史', '清史稿', '资治通鉴', '续资治通鉴', '文献通考',
    '通典', '通志', '文献通考', '太平御览', '文苑英华', '册府元龟', '太平广记',
    '艺文类聚', '初学记', '白孔六帖', '蒙求', '三字经', '百家姓', '千字文', '弟子规',
    '朱子家礼', '朱子语类', '近思录', '传习录', '呻吟语', '菜根谭', '小窗幽记',
    '围炉夜话', '了凡四训', '颜氏家训', '温公家范', '袁氏世范', '许云邨贻范',
    '太公家教', '女论语', '女孝经', '女诫', '内训', '职方', '仪礼', '礼记',
    '周礼', '仪礼', '大戴礼记', '小戴礼记', '逸礼', '古礼', '礼运', '礼器', '玉藻',
    '明堂位', '丧服小记', '大传', '少仪', '学记', '乐记', '经解', '哀公问', '仲尼燕居',
    '孔子闲居', '坊记', '表记', '缁衣', '奔丧', '问丧', '服问', '间传', '三年问',
    '深衣', '投壶', '儒行', '大学', '冠义', '昏义', '乡饮酒义', '射义', '燕义',
    '聘义', '丧服四制', '孔子家语', '孔丛子', '孟子', '荀子', '论语', '大学', '中庸',
    '诗经', '尚书', '易经', '春秋', '公羊传', '谷梁传', '左氏传', '国语', '战国策',
    '老子', '庄子', '列子', '文子', '鹖冠子', '孙子', '吴子', '六韬', '三略', '司马法',
    '尉缭子', '管子', '商君书', '韩非子', '墨子', '惠子', '尹文子', '公孙龙子',
    '吕氏春秋', '淮南子', '论衡', '潜夫论', '申鉴', '中论', '新语', '新序', '说苑',
    '法言', '太玄', '人物志', '世说新语', '水经注', '洛阳伽蓝记', '大唐西域记',
    '佛国记', '高僧传', '景德传灯录', '五灯会元', '宗镜录', '翻译名义集', '释氏稽古略',
    '武林西湖高僧事略', '佛祖统纪', '历代法宝记', '六祖坛经', '碧岩录', '从容录',
    '无门关', '正法眼藏', '禅林僧宝传', '嘉泰普灯录', '佛祖历代通载', '佛法金汤',
    '金刚经', '心经', '维摩诘经', '无量寿经', '观无量寿经', '阿弥陀经', '药师经',
    '地藏经', '金刚经', '楞伽经', '楞严经', '法华经', '华严经', '涅槃经', '解深密经',
    '大般若经', '中论', '百论', '十二门论', '大智度论', '瑜伽师地论', '成唯识论',
    '八识规矩颂', '宗镜录', '传心法要', '楞严经大义', '法华经玄义', '涅槃经疏',
    '华严经疏', '维摩经注', '金刚经注', '心经注', '阿弥陀经注', '观经疏', '四分律',
    '五分律', '十诵律', '摩诃僧祇律', '根本说一切有部律', '梵网经', '菩萨戒本',
    '沙弥律仪', '教行信证', '选择本愿念佛集', '往生论', '安乐集', '西方要决',
    '释净土群疑论', '华严经合论', '法华经文句', '涅槃经游意', '大乘止观', '小止观',
    '六妙法门', '释禅波罗蜜', '修习止观坐禅法要', '天台四教仪', '始终心要', '金刚錍',
    '十不二门', '法华经疏', '涅槃经疏', '维摩经疏', '金光明经疏', '盂兰盆经疏',
    '阿弥陀经疏', '请观音经疏', '观普贤行法经疏', '药师经疏', '金刚经疏', '心经疏',
    '观音玄义', '观音义疏', '观音感应传', '法华经显异录', '金刚经感应', '阿弥陀经感应',
    '地藏经感应', '药师经感应', '观世音菩萨普门品', '大势至菩萨念佛圆通章',
    '普贤菩萨行愿品', '文殊菩萨般若经', '普贤菩萨十大愿王', '地藏菩萨本愿经',
    '千手千眼大悲心陀罗尼', '大悲咒', '楞严咒', '十小咒', '准提神咒', '大吉祥天女咒',
    '功德天咒', '药师灌顶真言', '阿弥陀佛神咒', '观音灵感真言', '普庵咒', '五会念佛',
    '六字名号', '四字名号', '南无阿弥陀佛', '南无观世音菩萨', '南无大势至菩萨',
    '南无地藏王菩萨', '南无普贤菩萨', '南无文殊师利菩萨', '南无弥勒菩萨', '南无药师佛',
    '南无本师释迦牟尼佛', '南无过去佛', '南无现在佛', '南无未来佛', '南无十方佛',
    '南无三宝', '南无佛法僧', '南无菩萨', '南无罗汉', '南无护法诸天', '南无伽蓝圣众',
    '南无祖师', '南无历代传教士', '南无开山祖师', '南无方丈和尚', '南无当家师父',
    '南无首座大师', '南无维那师父', '南无典座师父', '南无知客师父', '南无僧值师父',
    '南无清众师父', '南无檀越施主', '南无护法居士', '南无善男信女', '南无有缘众生',
    '南无法界众生', '南无幽冥众生', '南无饿鬼道众生', '南无畜生道众生', '南无阿修罗道众生',
    '南无天道众生', '南无人道众生', '南无佛道众生', '南无仙道众生', '南无神道众生',
    '南无一切众生', '南无无量众生', '南无十方众生', '南无过去未来现在众生',
    '南无有形无形众生', '南无有想无想众生', '南无有色无色众生', '南无有见无见众生',
    '南无有对无对众生', '南无不有不如众生', '南无不生不灭众生', '南无不断不常众生',
    '南无不一不异众生', '南无不来不去众生', '南无不增不减众生', '南无不垢不净众生',
    '南无不苦不乐众生', '南无不生不死众生', '南无不老不死众生', '南无无尽无尽众生',
    '南无自在众生', '南无解脱众生', '南无清净众生', '南无智慧众生', '南无慈悲众生',
    '南无喜舍众生', '南无忍辱众生', '南无精进众生', '南无禅定众生', '南无般若众生',
    '南无方便众生', '南无愿力众生', '南无智慧众生', '南无方便众生', '南无慈悲众生',
    '南无喜舍众生', '南无忍辱众生', '南无精进众生', '南无禅定众生', '南无般若众生'
  ]);

  const existingSet = new Set(existingTriggers.map(t => t.toLowerCase()));
  const counter = {};

  for (const raw of rawTexts) {
    if (!raw || typeof raw !== 'string') continue;
    // 提取连续中文字符段（2-6字）
    const matches = raw.match(/[\u4e00-\u9fff]{2,6}/g) || [];
    for (const term of matches) {
      const t = term.toLowerCase();
      if (stopwords.has(t)) continue;
      if (existingSet.has(t)) continue;
      counter[t] = (counter[t] || 0) + 1;
    }
  }

  // 按频次降序，取 top 20
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([term, freq]) => ({ term, freq }));
}

/**
 * 对单条 evaluateRules 输出做覆盖分析：
 * - findings 的 evidence.raw 是否包含未命中 trigger 的高频词
 */
function analyzeRuleCoverage(evaluationResult, existingTriggers = []) {
  if (!evaluationResult || !evaluationResult.findings) {
    return { suggestions: [], analyzedFindings: 0 };
  }

  const rawTexts = evaluationResult.findings
    .map(f => f.evidence?.raw)
    .filter(Boolean);

  const candidates = extractCandidateTerms(rawTexts, existingTriggers);

  return {
    suggestions: candidates,
    analyzedFindings: evaluationResult.findings.length,
    hitCount: evaluationResult.hitCount || 0
  };
}

/**
 * 对多组评估结果汇总反哺建议
 */
function summarizeFeedback(evaluationResultsWithTriggers) {
  const totalSuggestions = [];
  for (const item of evaluationResultsWithTriggers) {
    const coverage = analyzeRuleCoverage(item.evaluation, item.triggers || []);
    if (coverage.suggestions.length > 0) {
      totalSuggestions.push({
        ruleId: item.ruleId || 'unknown',
        domain: item.evaluation.domain || 'unknown',
        suggestions: coverage.suggestions,
        analyzedFindings: coverage.analyzedFindings
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalRules: evaluationResultsWithTriggers.length,
    rulesWithSuggestions: totalSuggestions.length,
    details: totalSuggestions
  };
}

/**
 * 从 classics-value-mapper 的 hits 中直接提取建议（无需先跑 evaluateRules）
 */
function suggestFromHits(hits, existingTriggers = []) {
  const rawTexts = hits.map(h => h.raw).filter(Boolean);
  return extractCandidateTerms(rawTexts, existingTriggers);
}

module.exports = {
  extractCandidateTerms,
  analyzeRuleCoverage,
  summarizeFeedback,
  suggestFromHits
};
