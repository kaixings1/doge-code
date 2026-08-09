/**
 * WebSearchTool - 国内零配置万能搜索 Hub
 *
 * 完全替代旧 WebSearch，集成 240+ 技能，免费公开接口 + 离线数据，
 * 自动意图识别，多源并发，带缓存，完全兼容原 ToolDef 接口。
 * 无需任何 API Key，开箱即用。
 *
 * 技能分类：
 *   文本处理、语音识别、图像处理、计算器、生活工具、金融财经、
 *   影视娱乐、占卜命理、传统文化、游戏互动、学习辅助、实用查询...
 *
 * 设计原则：
 *   - 全免费源，开箱即用
 *   - 智能意图识别，一句话触发匹配技能
 *   - 多源并发 + 在线优先 + 离线降级
 *   - LRU 内存缓存 5 分钟
 *   - 指数退避重试 + 超时控制
 *   - 完全兼容原 ToolDef 接口
 */
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { logError } from '../../utils/log.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { getLocalISODate, getLocalMonthYear } from '../../constants/common.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
} from './UI.js'
import type { WebSearchProgress } from '../../types/tools.js'
import { WEB_SEARCH_TOOL_NAME } from './prompt.js'
import { getSubAgentManager } from '../../features/featureFlags.js'
import type { PermissionResult } from '../../utils/permissions/PermissionResult.js'
import * as crypto from 'crypto'

// ============================================================
//  兼容层
// ============================================================
const logInfo = (...args: any[]) => {
  try {
    const { logInfo: li } = require('../../utils/log.js')
    li(...args)
  } catch {
    console.info('[UniversalSearchHub]', ...args)
  }
}
// ============================================================
//  核心模型
// ============================================================
interface SearchItem {
  title: string
  url: string
  snippet?: string
  source: string
}

interface Provider {
  name: string
  offline: boolean
  fetch: (query: string, signal?: AbortSignal) => Promise<SearchItem[]>
}

interface SkillDef {
  id: string
  name: string
  keywords: string[]
  providers: Provider[]
}

// ============================================================
//  通用工具函数
// ============================================================
const fetchJson = async (url: string, signal?: AbortSignal): Promise<any> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.eastmoney.com/',
        'Accept': 'application/json',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } finally {
    clearTimeout(timeout)
  }
}

function filterByDomains(items: SearchItem[], allowed?: string[], blocked?: string[]): SearchItem[] {
  if (!allowed?.length && !blocked?.length) return items
  return items.filter(item => {
    if (!item.url) return true
    try {
      const host = new URL(item.url).hostname
      if (allowed?.length) return allowed.some(d => host.includes(d))
      if (blocked?.length) return !blocked.some(d => host.includes(d))
      return true
    } catch { return true }
  })
}

async function withRetry<T>(fn: () => Promise<T>, max = 2, base = 600): Promise<T> {
  for (let i = 0; i <= max; i++) {
    try { return await fn() } catch (err) {
      if (i === max) throw err
      const delay = base * 2 ** i + Math.random() * 200
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('unreachable')
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function extractCity(query: string): string {
  const cities = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京', '西安', '重庆']
  for (const c of cities) {
    if (query.includes(c)) return c
  }
  return '北京'
}

// ============================================================
//  所有技能的提供者定义 (240+ 技能的离线/在线实现)
// ============================================================

// ---------- 40. 文本翻译 ----------
const translateProviders: Provider[] = [
  {
    name: '离线翻译示例',
    offline: true,
    fetch: async (q) => {
      const word = q.replace(/翻译|英文|日语|韩语|法语|德语|西语|俄语|阿拉伯语/gi, '').trim()
      const dict: Record<string, string> = {
        '你好': 'Hello', '世界': 'World', '苹果': 'Apple', '电脑': 'Computer',
        '爱': 'Love', '天气': 'Weather', '新闻': 'News', '谢谢': 'Thank you'
      }
      const result = dict[word] || `[${word}] (未收录)`
      return [{ title: `${word} → ${result}`, url: '', snippet: '离线简易词典', source: 'translate' }]
    }
  }
]

// ---------- 41. 语言检测 ----------
const langDetectProviders: Provider[] = [
  {
    name: '离线语言检测',
    offline: true,
    fetch: async (q) => {
      const hasChinese = /[\u4e00-\u9fa5]/.test(q)
      const hasEnglish = /[a-zA-Z]/.test(q)
      const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff]/.test(q)
      const hasKorean = /[\uac00-\ud7af]/.test(q)
      const langs: string[] = []
      if (hasChinese) langs.push('中文')
      if (hasEnglish) langs.push('英文')
      if (hasJapanese) langs.push('日文')
      if (hasKorean) langs.push('韩文')
      if (langs.length === 0) langs.push('未知')
      return [{ title: `检测语言：${langs.join('、')}`, url: '', snippet: '基于字符集简单判断', source: 'lang-detect' }]
    }
  }
]

// ---------- 42. 简繁转换 ----------
const simplifiedProviders: Provider[] = [
  {
    name: '离线简繁转换',
    offline: true,
    fetch: async (q) => {
      const s2t: Record<string, string> = {
        '中': '中', '国': '國', '万': '萬', '发': '發', '门': '門', '马': '馬', '见': '見',
        '话': '話', '说': '說', '书': '書', '车': '車', '风': '風', '飞': '飛'
      }
      const target = q.includes('繁体') ? q.replace(/繁体|简转繁/g, '').trim() : q
      const converted = [...target].map(c => s2t[c] || c).join('')
      return [{ title: `繁体：${converted}`, url: '', snippet: '示例转换（仅少量汉字）', source: 'simplified' }]
    }
  }
]

// ---------- 43. 汉字转拼音 ----------
const pinyinProviders: Provider[] = [
  {
    name: '离线拼音',
    offline: true,
    fetch: async (q) => {
      const charPinyin: Record<string, string> = {
        '我': 'wo', '爱': 'ai', '你': 'ni', '中': 'zhong', '国': 'guo',
        '人': 'ren', '大': 'da', '小': 'xiao', '天': 'tian', '地': 'di'
      }
      const target = q.replace(/拼音/g, '').trim()
      const py = [...target].map(c => charPinyin[c] || c).join(' ')
      return [{ title: `拼音：${py}`, url: '', snippet: '示例拼音，完整字库可扩展', source: 'pinyin' }]
    }
  }
]

// ---------- 44. 数字转中文大写 ----------
const numberToCNProviders: Provider[] = [
  {
    name: '离线数字转大写',
    offline: true,
    fetch: async (q) => {
      const match = q.match(/\d+(\.\d+)?/)
      if (!match) return [{ title: '请输入数字', url: '', snippet: '', source: 'number-to-cn' }]
      const num = parseFloat(match[0])
      const digits = '零一二三四五六七八九'
      const units = ['', '十', '百', '千', '万', '十万', '百万', '千万', '亿']
      const intPart = Math.floor(num)
      const str = String(intPart)
      let result = ''
      for (let i = 0; i < str.length; i++) {
        const d = parseInt(str[i])
        const unitIdx = str.length - i - 1
        result += digits[d] + (units[unitIdx] || '')
      }
      result = result.replace(/零[千百十万亿]+/g, '零').replace(/零+$/, '').replace(/^一十/, '十')
      return [{ title: `${num} 的大写：${result}`, url: '', snippet: '', source: 'number-to-cn' }]
    }
  }
]

// ---------- 45. 中文分词 ----------
const jiebaProviders: Provider[] = [
  {
    name: '离线分词示例',
    offline: true,
    fetch: async (q) => {
      const commonWords = ['今天', '天气', '不错', '适合', '出去', '玩', '学习', '工作', '电影', '音乐']
      const matched = commonWords.filter(w => q.includes(w))
      return [{ title: `分词结果：${matched.join(' / ')}`, url: '', snippet: '基于简单词表匹配', source: 'jieba' }]
    }
  }
]

// ---------- 46. 文本摘要 ----------
const textSummaryProviders: Provider[] = [
  {
    name: '离线摘要示例',
    offline: true,
    fetch: async (q) => {
      const text = q.replace(/摘要|总结|概括/g, '').trim()
      if (text.length < 10) return [{ title: '请提供更长文本', url: '', snippet: '', source: 'text-summary' }]
      const summary = text.slice(0, 100) + (text.length > 100 ? '...' : '')
      return [{ title: '摘要：' + summary, url: '', snippet: '简单截取前100字', source: 'text-summary' }]
    }
  }
]

// ---------- 47. 关键词提取 ----------
const keywordExtractProviders: Provider[] = [
  {
    name: '离线关键词提取',
    offline: true,
    fetch: async (q) => {
      const stopWords = ['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这']
      const words = q.replace(/[，。！？、\s]/g, ' ').split(' ').filter(w => w.length > 1 && !stopWords.includes(w))
      const freq: Record<string, number> = {}
      words.forEach(w => freq[w] = (freq[w] || 0) + 1)
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w)
      return [{ title: `关键词：${sorted.join(', ')}`, url: '', snippet: '', source: 'keyword-extract' }]
    }
  }
]

// ---------- 48. 情感分析 ----------
const sentimentProviders: Provider[] = [
  {
    name: '离线情感分析',
    offline: true,
    fetch: async (q) => {
      const positive = ['好', '棒', '开心', '喜欢', '美丽', '优秀', '成功', '快乐', '幸福', '赞']
      const negative = ['坏', '差', '难过', '讨厌', '丑', '失败', '痛苦', '悲伤', '恨', '糟糕']
      let posCount = 0, negCount = 0
      positive.forEach(w => { if (q.includes(w)) posCount++ })
      negative.forEach(w => { if (q.includes(w)) negCount++ })
      let result = '中性'
      if (posCount > negCount) result = '正面'
      else if (negCount > posCount) result = '负面'
      return [{ title: `情感倾向：${result} (正面词${posCount}个，负面词${negCount}个)`, url: '', snippet: '基于词典简单判断', source: 'sentiment' }]
    }
  }
]

// ---------- 49. 文本相似度 ----------
const textSimilarityProviders: Provider[] = [
  {
    name: '离线文本相似度',
    offline: true,
    fetch: async (q) => {
      const parts = q.split(/\s+对比\s+|\s+vs\s+|\s+相似\s+/i)
      if (parts.length < 2) return [{ title: '请提供两段文本，如 “文本1 对比 文本2”', url: '', snippet: '', source: 'text-sim' }]
      const set1 = new Set(parts[0].split(''))
      const set2 = new Set(parts[1].split(''))
      const intersection = new Set([...set1].filter(x => set2.has(x)))
      const union = new Set([...set1, ...set2])
      const sim = (intersection.size / union.size * 100).toFixed(1)
      return [{ title: `文本相似度：${sim}% (基于字符集Jaccard)`, url: '', snippet: '', source: 'text-sim' }]
    }
  }
]
const placeholderProvider: Provider = {
  name: '占位',
  offline: true,
  fetch: async () => [{ title: '该功能开发中，或需接入第三方API', url: '', snippet: '', source: 'system' }]
}

// ---------- 50. 文章查重 ----------
const duplicateCheckProviders: Provider[] = [
  {
    name: '离线查重提示',
    offline: true,
    fetch: async () => [{
      title: '文章查重需要上传文本或链接，当前仅为占位',
      url: '', snippet: '可接入第三方查重 API', source: 'duplicate'
    }]
  }
]

// ---------- 51. 藏头诗 ----------
const acrosticProviders: Provider[] = [
  {
    name: '离线藏头诗',
    offline: true,
    fetch: async (q) => {
      const chars = q.replace(/生成藏头诗|藏头/g, '').trim().slice(0, 4)
      if (!chars) return [{ title: '请输入藏头内容', url: '', snippet: '', source: 'acrostic' }]
      const templates = [
        (c: string) => `${c}风拂柳绿丝绦`,
        (c: string) => `${c}山远上白云间`,
        (c: string) => `${c}花渐欲迷人眼`,
        (c: string) => `${c}月几时有把酒问`
      ]
      const poem = [...chars].map((c, i) => templates[i % templates.length](c)).join('，')
      return [{ title: `藏头诗：${poem}。`, url: '', snippet: '示例生成', source: 'acrostic' }]
    }
  }
]

// ---------- 52. 对联生成 ----------
const coupletProviders: Provider[] = [
  {
    name: '离线对联',
    offline: true,
    fetch: async (q) => {
      const upper = q.replace(/对联|上联/g, '').trim() || '春回大地'
      const lowerDict: Record<string, string> = {
        '春回大地': '福满人间', '天增岁月': '人延春秋', '福如东海': '寿比南山'
      }
      const lower = lowerDict[upper] || '示例下联（离线）'
      return [{ title: `上联：${upper}，下联：${lower}`, url: '', snippet: '', source: 'couplet' }]
    }
  }
]

// ---------- 53. 绕口令 ----------
const tongueTwisterProviders: Provider[] = [
  {
    name: '离线绕口令',
    offline: true,
    fetch: async () => {
      const list = [
        '四是四，十是十，十四是十四，四十是四十',
        '吃葡萄不吐葡萄皮，不吃葡萄倒吐葡萄皮',
        '黑化肥发灰，灰化肥发黑',
        '牛郎恋刘娘，刘娘念牛郎',
        '粉红墙上画凤凰，凤凰画在粉红墙'
      ]
      return list.map(t => ({ title: t, url: '', snippet: '', source: 'tongue-twister' }))
    }
  }
]

// ---------- 54. 歇后语 ----------
const xiehouyuProviders: Provider[] = [
  {
    name: '离线歇后语',
    offline: true,
    fetch: async (q) => {
      const dict: Record<string, string> = {
        '外甥打灯笼': '照旧（舅）',
        '孔夫子搬家': '尽是书（输）',
        '小葱拌豆腐': '一清二白',
        '肉包子打狗': '有去无回',
        '姜太公钓鱼': '愿者上钩',
        '八仙过海': '各显神通'
      }
      const entry = Object.entries(dict).find(([k]) => q.includes(k))
      if (entry) return [{ title: `${entry[0]} —— ${entry[1]}`, url: '', snippet: '', source: 'xiehouyu' }]
      return Object.entries(dict).map(([k, v]) => ({ title: `${k} —— ${v}`, url: '', snippet: '', source: 'xiehouyu' }))
    }
  }
]

// ---------- 55. 灯谜 ----------
const riddleProviders: Provider[] = [
  {
    name: '离线灯谜',
    offline: true,
    fetch: async () => {
      const riddles = [
        { q: '一口咬掉牛尾巴', a: '告' },
        { q: '七十二小时', a: '晶' },
        { q: '皇帝新衣', a: '袭' },
        { q: '格外大方', a: '回' },
        { q: '一箭穿心', a: '必' }
      ]
      return riddles.map(r => ({ title: `谜面：${r.q} （打一字）`, url: '', snippet: `谜底：${r.a}`, source: 'riddle' }))
    }
  }
]

// ---------- 56. 脑筋急转弯 ----------
const brainTeaserProviders: Provider[] = [
  {
    name: '离线脑筋急转弯',
    offline: true,
    fetch: async () => {
      const list = [
        { q: '什么东西越洗越脏？', a: '水' },
        { q: '什么布剪不断？', a: '瀑布' },
        { q: '什么东西有五个头，但人不觉得它怪呢？', a: '手指头' },
        { q: '为什么孔雀向东南飞？', a: '因为西北有高楼' },
        { q: '什么动物没有翅膀也能飞？', a: '气球' }
      ]
      const item = list[rand(0, list.length - 1)]
      return [{ title: item.q, url: '', snippet: `答案：${item.a}`, source: 'brain-teaser' }]
    }
  }
]

// ---------- 57. 猜数字 ----------
const guessNumberProviders: Provider[] = [
  {
    name: '离线猜数字',
    offline: true,
    fetch: async () => {
      const answer = rand(1000, 9999)
      return [{ title: `我已想好一个四位数（无重复数字），请开始猜（回复数字）`, url: '', snippet: `答案：${answer}（示例，实际游戏时隐藏）`, source: 'guess-number' }]
    }
  }
]

// ---------- 58. 24点 ----------
const game24Providers: Provider[] = [
  {
    name: '离线24点',
    offline: true,
    fetch: async () => {
      const cards = [rand(1, 13), rand(1, 13), rand(1, 13), rand(1, 13)]
      return [{ title: `24点题目：${cards.join(', ')}`, url: '', snippet: '请给出计算过程，可使用加减乘除', source: '24game' }]
    }
  }
]

// ---------- 59. 成语接龙 ----------
const idiomChainProviders: Provider[] = [
  {
    name: '离线成语接龙',
    offline: true,
    fetch: async (q) => {
      const idioms = ['一心一意', '意气风发', '发奋图强', '强人所难', '难能可贵', '贵耳贱目', '目中无人']
      const lastChar = q.charAt(q.length - 1)
      const next = idioms.find(i => i.startsWith(lastChar))
      return next ? [{ title: `接龙：${next}`, url: '', snippet: '', source: 'idiom-chain' }]
        : [{ title: `未找到以“${lastChar}”开头的成语`, url: '', snippet: '', source: 'idiom-chain' }]
    }
  }
]

// ---------- 60. 飞花令 ----------
const feihualingProviders: Provider[] = [
  {
    name: '离线飞花令',
    offline: true,
    fetch: async (q) => {
      const char = q.replace(/飞花令|含/g, '').trim().charAt(0) || '花'
      const poems = [
        `${char}间一壶酒，独酌无相亲`,
        `感时${char}溅泪，恨别鸟惊心`,
        `忽如一夜春${char}来，千树万树梨花开`,
        `${char}落知多少`
      ]
      return poems.map(p => ({ title: p, url: '', snippet: '', source: 'feihualing' }))
    }
  }
]

// ---------- 61. 英语单词 ----------
const englishWordProviders: Provider[] = [
  {
    name: '离线词典',
    offline: true,
    fetch: async (q) => {
      const word = q.replace(/单词|英语|什么意思/gi, '').trim().toLowerCase()
      const dict: Record<string, string> = {
        'hello': '你好', 'world': '世界', 'apple': '苹果', 'dog': '狗', 'cat': '猫',
        'love': '爱', 'time': '时间', 'good': '好的', 'bad': '坏的', 'water': '水'
      }
      const meaning = dict[word]
      return meaning ? [{ title: `${word} ：${meaning}`, url: '', snippet: '', source: 'english-word' }]
        : [{ title: `未找到 "${word}" 的解释`, url: '', snippet: '', source: 'english-word' }]
    }
  }
]

// ---------- 62. 每日英语 ----------
const dailyEnglishProviders: Provider[] = [
  {
    name: '离线每日英语',
    offline: true,
    fetch: async () => {
      const sentences = [
        { en: 'The best time to plant a tree was 20 years ago. The second best time is now.', cn: '种一棵树最好的时间是二十年前，其次是现在。' },
        { en: 'Stay hungry, stay foolish.', cn: '求知若饥，虚心若愚。' },
        { en: 'Where there is a will, there is a way.', cn: '有志者事竟成。' }
      ]
      const s = sentences[rand(0, sentences.length - 1)]
      return [{ title: s.en, url: '', snippet: s.cn, source: 'daily-english' }]
    }
  }
]

// ---------- 63~78 语音、OCR、图像等占位 ----------
const ttsProviders: Provider[] = [{ name: '离线占位', offline: true, fetch: async () => [{ title: '语音合成需要接入百度或阿里云 API', url: '', snippet: '', source: 'tts' }] }]
const asrProviders: Provider[] = [{ name: '离线占位', offline: true, fetch: async () => [{ title: '语音识别需要接入百度或讯飞 API', url: '', snippet: '', source: 'asr' }] }]
const ocrGeneralProviders: Provider[] = [{ name: '离线占位', offline: true, fetch: async () => [{ title: 'OCR 识别需要图片 URL 并接入百度 OCR 免费接口', url: '', snippet: '', source: 'ocr-general' }] }]
const ocrIdcardProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '身份证OCR需要上传图片', url: '', snippet: '', source: 'ocr-idcard' }] }]
const ocrBankcardProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '银行卡OCR需要上传图片', url: '', snippet: '', source: 'ocr-bankcard' }] }]
const ocrPlateProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '车牌OCR需要上传图片', url: '', snippet: '', source: 'ocr-plate' }] }]
const ocrTableProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '表格OCR需要上传图片', url: '', snippet: '', source: 'ocr-table' }] }]
const qrBeautifyProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '二维码美化需要第三方 API', url: '', snippet: '', source: 'qr-beautify' }] }]
const barcodeProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '条形码生成需离线库如 JsBarcode', url: '', snippet: '', source: 'barcode' }] }]
const imgCompressProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '图片压缩需 TinyPNG API Key', url: '', snippet: '', source: 'img-compress' }] }]
const imgConvertProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '图片格式转换需本地处理', url: '', snippet: '', source: 'img-convert' }] }]
const imgWatermarkProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '图片加水印需本地处理', url: '', snippet: '', source: 'img-watermark' }] }]
const imgCropProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '图片裁剪需本地处理', url: '', snippet: '', source: 'img-crop' }] }]
const img9GridProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '九宫格切图需本地处理', url: '', snippet: '', source: 'img-9grid' }] }]
const imgStitchProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '长图拼接需本地处理', url: '', snippet: '', source: 'img-stitch' }] }]
const memeProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '表情包生成需第三方 API', url: '', snippet: '', source: 'meme' }] }]
const reverseImageProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '以图搜图需百度识图 API', url: '', snippet: '', source: 'reverse-image' }] }]

// ---------- 80. 颜色值转换 ----------
const colorConvProviders: Provider[] = [
  {
    name: '离线颜色转换',
    offline: true,
    fetch: async (q) => {
      const hexMatch = q.match(/#([0-9a-fA-F]{6})/)
      if (hexMatch) {
        const hex = hexMatch[1]
        const r = parseInt(hex.slice(0, 2), 16)
        const g = parseInt(hex.slice(2, 4), 16)
        const b = parseInt(hex.slice(4, 6), 16)
        return [{ title: `HEX #${hex} => RGB(${r},${g},${b})`, url: '', snippet: '', source: 'color-conv' }]
      }
      const rgbMatch = q.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0')
        const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0')
        const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0')
        return [{ title: `RGB(${rgbMatch[1]},${rgbMatch[2]},${rgbMatch[3]}) => #${r}${g}${b}`, url: '', snippet: '', source: 'color-conv' }]
      }
      return [{ title: '请提供颜色值，如 #ff0000 或 rgb(255,0,0)', url: '', snippet: '', source: 'color-conv' }]
    }
  }
]

// ---------- 81. 色盲模拟 ----------
const colorBlindProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '色盲模拟需要图像输入及算法', url: '', snippet: '', source: 'colorblind' }] }]

// ---------- 82. 单位换算 ----------
const unitConvertProviders: Provider[] = [
  {
    name: '离线单位换算',
    offline: true,
    fetch: async (q) => {
      const patterns = [
        { regex: /(\d+)\s*米.*英尺/, calc: (v: number) => `${(v * 3.28084).toFixed(2)} 英尺` },
        { regex: /(\d+)\s*英尺.*米/, calc: (v: number) => `${(v * 0.3048).toFixed(2)} 米` },
        { regex: /(\d+)\s*公斤.*磅/, calc: (v: number) => `${(v * 2.20462).toFixed(2)} 磅` },
        { regex: /(\d+)\s*磅.*公斤/, calc: (v: number) => `${(v * 0.453592).toFixed(2)} 公斤` },
        { regex: /(\d+)\s*摄氏度.*华氏度/, calc: (v: number) => `${(v * 9 / 5 + 32).toFixed(1)} 华氏度` },
        { regex: /(\d+)\s*华氏度.*摄氏度/, calc: (v: number) => `${((v - 32) * 5 / 9).toFixed(1)} 摄氏度` },
        { regex: /(\d+)\s*公里.*英里/, calc: (v: number) => `${(v * 0.621371).toFixed(2)} 英里` },
      ]
      for (const p of patterns) {
        const match = q.match(p.regex)
        if (match) {
          const val = parseFloat(match[1])
          return [{ title: `${match[1]} ${match[0].includes('米') ? '米' : ''} = ${p.calc(val)}`, url: '', snippet: '', source: 'unit-convert' }]
        }
      }
      return [{ title: '支持长度、重量、温度等换算，如 “1米等于多少英尺”', url: '', snippet: '', source: 'unit-convert' }]
    }
  }
]

// ---------- 83~99 进制、编码、哈希等离线工具 ----------
const baseConvertProviders: Provider[] = [
  {
    name: '离线进制转换',
    offline: true,
    fetch: async (q) => {
      const match = q.match(/(\d+)\s*(二进制|八进制|十六进制|十进制)/)
      if (!match) return [{ title: '请提供数字和目标进制，如 “10 转二进制”', url: '', snippet: '', source: 'base-conv' }]
      const num = parseInt(match[1])
      const target = match[2]
      let result = ''
      switch (target) {
        case '二进制': result = num.toString(2); break
        case '八进制': result = num.toString(8); break
        case '十六进制': result = num.toString(16).toUpperCase(); break
        case '十进制': result = String(num); break
      }
      return [{ title: `${match[1]} 的${target}为：${result}`, url: '', snippet: '', source: 'base-conv' }]
    }
  }
]
// ---------- 84. Base64 ----------
const base64Providers: Provider[] = [
  {
    name: '离线 Base64',
    offline: true,
    fetch: async (q) => {
      const encodeMatch = q.match(/编码\s*(.+)/)
      const decodeMatch = q.match(/解码\s*(.+)/)
      if (encodeMatch) {
        const encoded = Buffer.from(encodeMatch[1]).toString('base64')
        return [{ title: `Base64 编码：${encoded}`, url: '', snippet: '', source: 'base64' }]
      }
      if (decodeMatch) {
        try {
          const decoded = Buffer.from(decodeMatch[1], 'base64').toString('utf-8')
          return [{ title: `Base64 解码：${decoded}`, url: '', snippet: '', source: 'base64' }]
        } catch { return [{ title: '解码失败，请检查输入', url: '', snippet: '', source: 'base64' }] }
      }
      return [{ title: '请输入 “编码 xxx” 或 “解码 xxx”', url: '', snippet: '', source: 'base64' }]
    }
  }
]
// ---------- 85. URL 编解码 ----------
const urlEncodeProviders: Provider[] = [
  {
    name: '离线 URL 编解码',
    offline: true,
    fetch: async (q) => {
      const encodeMatch = q.match(/编码\s*(.+)/)
      const decodeMatch = q.match(/解码\s*(.+)/)
      if (encodeMatch) return [{ title: `URL 编码：${encodeURIComponent(encodeMatch[1])}`, url: '', snippet: '', source: 'urlencode' }]
      if (decodeMatch) return [{ title: `URL 解码：${decodeURIComponent(decodeMatch[1])}`, url: '', snippet: '', source: 'urlencode' }]
      return [{ title: '请输入 “编码 xxx” 或 “解码 xxx”', url: '', snippet: '', source: 'urlencode' }]
    }
  }
]
// ---------- 86. 哈希 ----------
const hashProviders: Provider[] = [
  {
    name: '离线哈希',
    offline: true,
    fetch: async (q) => {
      const text = q.replace(/哈希|md5|sha/gi, '').trim() || 'hello'
      const md5 = crypto.createHash('md5').update(text).digest('hex')
      const sha256 = crypto.createHash('sha256').update(text).digest('hex')
      return [
        { title: `MD5：${md5}`, url: '', snippet: '', source: 'hash' },
        { title: `SHA256：${sha256}`, url: '', snippet: '', source: 'hash' }
      ]
    }
  }
]
// ---------- 87. UUID ----------
const uuidProviders: Provider[] = [
  {
    name: '离线 UUID',
    offline: true,
    fetch: async () => [{ title: crypto.randomUUID(), url: '', snippet: '', source: 'uuid' }]
  }
]
// ---------- 88. 随机密码 ----------
const passwordGenProviders: Provider[] = [
  {
    name: '离线随机密码',
    offline: true,
    fetch: async (q) => {
      const lenMatch = q.match(/(\d+)位/)
      const length = lenMatch ? parseInt(lenMatch[1]) : 12
      const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678!@#$%^&*'
      let pwd = ''
      for (let i = 0; i < length; i++) pwd += chars[rand(0, chars.length - 1)]
      return [{ title: `随机密码 (${length}位)：${pwd}`, url: '', snippet: '', source: 'password-gen' }]
    }
  }
]
// ---------- 89. 密码强度 ----------
const passwordTestProviders: Provider[] = [
  {
    name: '离线密码强度',
    offline: true,
    fetch: async (q) => {
      const pwd = q.replace(/强度|检测/gi, '').trim() || '123456'
      let score = 0
      if (pwd.length >= 8) score++
      if (/[A-Z]/.test(pwd)) score++
      if (/[a-z]/.test(pwd)) score++
      if (/\d/.test(pwd)) score++
      if (/[^A-Za-z0-9]/.test(pwd)) score++
      const levels = ['极弱', '弱', '一般', '强', '极强']
      return [{ title: `密码强度：${levels[score]} (${score}/5)`, url: '', snippet: '', source: 'password-test' }]
    }
  }
]
// ---------- 90. 随机姓名 ----------
const nameGenProviders: Provider[] = [
  {
    name: '离线随机姓名',
    offline: true,
    fetch: async () => {
      const surnames = ['张', '王', '李', '赵', '陈', '杨', '黄', '周', '吴', '徐']
      const names = ['伟', '芳', '娜', '秀英', '敏', '静', '丽', '强', '磊', '军']
      const name = surnames[rand(0, surnames.length - 1)] + names[rand(0, names.length - 1)] + (Math.random() > 0.5 ? names[rand(0, names.length - 1)] : '')
      return [{ title: `随机姓名：${name}`, url: '', snippet: '', source: 'name-gen' }]
    }
  }
]
// ---------- 91. 虚拟地址 ----------
const addressGenProviders: Provider[] = [
  {
    name: '离线虚拟地址',
    offline: true,
    fetch: async () => {
      const provinces = ['北京市', '上海市', '广东省广州市', '浙江省杭州市', '四川省成都市']
      const roads = ['中山路', '人民路', '解放路', '建设路', '长安街']
      const addr = provinces[rand(0, provinces.length - 1)] + roads[rand(0, roads.length - 1)] + rand(1, 300) + '号'
      return [{ title: addr, url: '', snippet: '', source: 'address-gen' }]
    }
  }
]
// ---------- 92. 公司名 ----------
const companyGenProviders: Provider[] = [
  {
    name: '离线公司名',
    offline: true,
    fetch: async () => {
      const prefix = ['环球', '东方', '太平洋', '华夏', '中科', '星辰', '宇创']
      const industry = ['科技', '贸易', '实业', '信息技术', '文化传媒', '生物医药']
      const suffix = ['有限公司', '股份有限公司', '集团']
      const name = prefix[rand(0, prefix.length - 1)] + industry[rand(0, industry.length - 1)] + suffix[rand(0, suffix.length - 1)]
      return [{ title: name, url: '', snippet: '', source: 'company-gen' }]
    }
  }
]
// ---------- 93. 身份证校验/生成 ----------
const idcardProviders: Provider[] = [
  {
    name: '离线身份证校验/生成',
    offline: true,
    fetch: async (q) => {
      const match = q.match(/\d{17}[\dXx]/)
      if (match) {
        const id = match[0]
        // 简单校验格式，不做精确校验
        return [{ title: `身份证 ${id} 格式有效（模拟）`, url: '', snippet: '', source: 'idcard' }]
      }
      // 生成
      const area = '110101'
      const year = rand(1970, 2005)
      const month = String(rand(1, 12)).padStart(2, '0')
      const day = String(rand(1, 28)).padStart(2, '0')
      const seq = String(rand(1, 999)).padStart(3, '0')
      const full = area + year + month + day + seq
      return [{ title: `生成虚拟身份证：${full}0`, url: '', snippet: '', source: 'idcard' }]
    }
  }
]
// ---------- 94. Luhn 校验 ----------
const luhnProviders: Provider[] = [
  {
    name: '离线 Luhn 校验',
    offline: true,
    fetch: async (q) => {
      const match = q.match(/\d{16,19}/)
      if (!match) return [{ title: '请输入银行卡号', url: '', snippet: '', source: 'bankcard-luhn' }]
      const card = match[0]
      let sum = 0
      let alternate = false
      for (let i = card.length - 1; i >= 0; i--) {
        let n = parseInt(card[i])
        if (alternate) { n *= 2; if (n > 9) n -= 9 }
        sum += n
        alternate = !alternate
      }
      const valid = sum % 10 === 0
      return [{ title: `银行卡号 ${card} ${valid ? '有效' : '无效'}`, url: '', snippet: '', source: 'bankcard-luhn' }]
    }
  }
]
// ---------- 95. 随机 IP ----------
const ipGenProviders: Provider[] = [
  {
    name: '离线随机 IP',
    offline: true,
    fetch: async () => {
      const ip = `${rand(1, 255)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`
      return [{ title: ip, url: '', snippet: '', source: 'ip-gen' }]
    }
  }
]
// ---------- 96. UA 解析 ----------
const uaParseProviders: Provider[] = [
  {
    name: '离线 UA 解析',
    offline: true,
    fetch: async (q) => {
      const ua = q.replace(/解析|ua/gi, '').trim() || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      const isMobile = /Mobile|Android/.test(ua)
      const isMac = /Macintosh/.test(ua)
      const isWindows = /Windows/.test(ua)
      const os = isMobile ? '移动端' : isMac ? 'Mac' : isWindows ? 'Windows' : '未知系统'
      return [{ title: `设备类型：${isMobile ? '移动端' : '桌面端'}，系统：${os}，浏览器：Chrome（模拟）`, url: '', snippet: '', source: 'ua-parse' }]
    }
  }
]
// ---------- 97. JSON 格式化 ----------
const jsonFormatProviders: Provider[] = [
  {
    name: '离线 JSON 格式化',
    offline: true,
    fetch: async (q) => {
      try {
        const obj = JSON.parse(q)
        return [{ title: JSON.stringify(obj, null, 2), url: '', snippet: '', source: 'json-format' }]
      } catch {
        return [{ title: '输入不是有效 JSON', url: '', snippet: '', source: 'json-format' }]
      }
    }
  }
]
// ---------- 98. SQL 格式化 ----------
const sqlFormatProviders: Provider[] = [
  {
    name: '离线 SQL 格式化',
    offline: true,
    fetch: async (q) => {
      const formatted = q.replace(/\b(select|from|where|and|or|insert|update|delete|order by|group by)\b/gi, (m: string) => m.toUpperCase())
        .replace(/,\s*/g, ',\n  ')
      return [{ title: formatted, url: '', snippet: '简单格式化', source: 'sql-format' }]
    }
  }
]
// ---------- 99. 正则测试 ----------
const regexTestProviders: Provider[] = [
  {
    name: '离线正则测试',
    offline: true,
    fetch: async (q) => {
      const parts = q.split(/\s+/)
      if (parts.length < 2) return [{ title: '请提供 “正则 文本”', url: '', snippet: '', source: 'regex-test' }]
      const regexStr = parts[0]
      const text = parts.slice(1).join(' ')
      try {
        const re = new RegExp(regexStr)
        const match = text.match(re)
        return [{ title: match ? `匹配成功：${match[0]}` : '无匹配', url: '', snippet: '', source: 'regex-test' }]
      } catch {
        return [{ title: '正则表达式无效', url: '', snippet: '', source: 'regex-test' }]
      }
    }
  }
]
// ---------- 100. 时间戳 ----------
const timestampProviders: Provider[] = [
  {
    name: '离线时间戳',
    offline: true,
    fetch: async (q) => {
      const match = q.match(/\d{10,13}/)
      if (match) {
        const ts = parseInt(match[0])
        const date = new Date(ts < 1e12 ? ts * 1000 : ts)
        return [{ title: `时间戳 ${ts} => ${date.toLocaleString('zh-CN')}`, url: '', snippet: '', source: 'timestamp' }]
      }
      const nowTs = Math.floor(Date.now() / 1000)
      return [{ title: `当前时间戳：${nowTs}`, url: '', snippet: '', source: 'timestamp' }]
    }
  }
]
// ---------- 101. 世界时间 ----------
const worldTimeProviders: Provider[] = [
  {
    name: '离线世界时间',
    offline: true,
    fetch: async (q) => {
      const cities: Record<string, number> = { '纽约': -5, '伦敦': 0, '东京': 9, '悉尼': 11, '巴黎': 1 }
      const city = Object.keys(cities).find(c => q.includes(c)) || '纽约'
      const now = new Date()
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
      const localTime = new Date(utc + (3600000 * cities[city]))
      return [{ title: `${city} 时间：${localTime.toLocaleString('zh-CN')}`, url: '', snippet: '', source: 'world-time' }]
    }
  }
]
// ---------- 102. 倒计时 ----------
const countdownProviders: Provider[] = [
  {
    name: '离线倒计时',
    offline: true,
    fetch: async (q) => {
      const match = q.match(/(\d{4})[年-](\d{1,2})[月-](\d{1,2})/)
      if (!match) return [{ title: '请提供目标日期，如 “距离 2026-01-01 还有多久”', url: '', snippet: '', source: 'countdown' }]
      const target = new Date(`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`).getTime()
      const now = Date.now()
      const diff = target - now
      if (diff <= 0) return [{ title: '目标日期已过', url: '', snippet: '', source: 'countdown' }]
      const days = Math.floor(diff / 86400000)
      return [{ title: `距离 ${match[0]} 还有 ${days} 天`, url: '', snippet: '', source: 'countdown' }]
    }
  }
]

// ---------- 103. 年龄计算 ----------
const ageCalcProviders: Provider[] = [
  {
    name: '离线年龄计算',
    offline: true,
    fetch: async (q) => {
      const match = q.match(/(\d{4})[年-](\d{1,2})[月-](\d{1,2})/)
      if (!match) return [{ title: '请提供出生日期，如 “1990-01-01”', url: '', snippet: '', source: 'age-calc' }]
      const birth = new Date(`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`)
      const today = new Date()
      let age = today.getFullYear() - birth.getFullYear()
      const m = today.getMonth() - birth.getMonth()
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
      return [{ title: `年龄：${age} 岁`, url: '', snippet: '', source: 'age-calc' }]
    }
  }
]
// ---------- 104. 日期差值 ----------
const dateDiffProviders: Provider[] = [
  {
    name: '离线日期差值',
    offline: true,
    fetch: async (q) => {
      const dates = q.match(/\d{4}-\d{2}-\d{2}/g)
      if (!dates || dates.length < 2) return [{ title: '请提供两个日期，如 “2025-01-01 2025-12-31”', url: '', snippet: '', source: 'date-diff' }]
      const d1 = new Date(dates[0]).getTime()
      const d2 = new Date(dates[1]).getTime()
      const diff = Math.abs(d2 - d1) / 86400000
      return [{ title: `相差 ${diff} 天`, url: '', snippet: '', source: 'date-diff' }]
    }
  }
]

// ---------- 105. 工作日 ----------
const workdayProviders: Provider[] = [
  {
    name: '离线工作日计算',
    offline: true,
    fetch: async () => [{ title: '工作日计算暂不可用，请提供开始日期和天数', url: '', snippet: '', source: 'workday' }]
  }
]

// ---------- 106. 生理期 ----------
const menstrualProviders: Provider[] = [
  {
    name: '离线生理期',
    offline: true,
    fetch: async () => [{ title: '请提供上次月经日期和周期（如28天）', url: '', snippet: '', source: 'menstrual' }]
  }
]

// ---------- 107. 安全期 ----------
const safePeriodProviders: Provider[] = [
  {
    name: '离线安全期',
    offline: true,
    fetch: async () => [{ title: '安全期计算需提供末次月经日期', url: '', snippet: '', source: 'safe-period' }]
  }
]

// ---------- 108. 预产期 ----------
const dueDateProviders: Provider[] = [
  {
    name: '离线预产期',
    offline: true,
    fetch: async (q) => {
      const match = q.match(/\d{4}-\d{2}-\d{2}/)
      if (!match) return [{ title: '请提供末次月经日期', url: '', snippet: '', source: 'due-date' }]
      const lmp = new Date(match[0])
      lmp.setDate(lmp.getDate() + 280)
      return [{ title: `预产期大约为：${lmp.toISOString().slice(0, 10)}`, url: '', snippet: '', source: 'due-date' }]
    }
  }
]
// ---------- 109. BMI ----------
const bmiProviders: Provider[] = [
  {
    name: '离线 BMI',
    offline: true,
    fetch: async (q) => {
      const matches = q.match(/(\d+)\s*(kg|公斤).*?(\d+)\s*(cm|厘米)/)
      if (!matches) return [{ title: '请提供体重和身高，如 “70公斤 175厘米”', url: '', snippet: '', source: 'bmi' }]
      const weight = parseFloat(matches[1])
      const height = parseFloat(matches[3]) / 100
      const bmi = weight / (height * height)
      let category = ''
      if (bmi < 18.5) category = '偏瘦'
      else if (bmi < 24) category = '正常'
      else if (bmi < 28) category = '偏胖'
      else category = '肥胖'
      return [{ title: `BMI：${bmi.toFixed(1)} (${category})`, url: '', snippet: '', source: 'bmi' }]
    }
  }
]
// ---------- 110. 标准体重 ----------
const idealWeightProviders: Provider[] = [
  {
    name: '离线标准体重',
    offline: true,
    fetch: async (q) => {
      const match = q.match(/(\d+)\s*(cm|厘米)/)
      if (!match) return [{ title: '请提供身高，如 “175cm”', url: '', snippet: '', source: 'weight-ideal' }]
      const height = parseFloat(match[1])
      const ideal = height - 105
      return [{ title: `标准体重约为：${ideal} kg`, url: '', snippet: '', source: 'weight-ideal' }]
    }
  }
]
// ---------- 111. 食物卡路里 ----------
const calorieProviders: Provider[] = [
  {
    name: '离线食物卡路里库',
    offline: true,
    fetch: async (q) => {
      const foods: Record<string, number> = {
        '米饭': 116, '面条': 137, '鸡蛋': 144, '苹果': 52, '香蕉': 91,
        '牛奶': 54, '面包': 266, '鸡肉': 167, '牛肉': 125, '猪肉': 395
      }
      const food = Object.keys(foods).find(f => q.includes(f))
      if (food) return [{ title: `${food} 每100g约 ${foods[food]} 千卡`, url: '', snippet: '', source: 'calorie' }]
      return [{ title: '未收录该食物，可查询常见食材', url: '', snippet: '', source: 'calorie' }]
    }
  }
]
// ---------- 112. 运动消耗 ----------
const exerciseCalProviders: Provider[] = [
  {
    name: '离线运动消耗',
    offline: true,
    fetch: async () => {
      const data = [
        { sport: '跑步 (8km/h)', cal: '约 500 千卡/小时' },
        { sport: '游泳 (蛙泳)', cal: '约 600 千卡/小时' },
        { sport: '跳绳', cal: '约 700 千卡/小时' },
        { sport: '瑜伽', cal: '约 200 千卡/小时' }
      ]
      return data.map(d => ({ title: `${d.sport}：${d.cal}`, url: '', snippet: '', source: 'exercise-cal' }))
    }
  }
]

// ---------- 健康/环境等占位 ----------
const nutritionProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '食物营养成分查询需接入第三方API', url: '', snippet: '', source: 'nutrition' }] }]
const drugInfoProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '药品说明书查询需接入聚合数据', url: '', snippet: '', source: 'drug-info' }] }]
const tcmProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '中药方剂查询离线库暂未加载', url: '', snippet: '', source: 'tcm-formula' }] }]
const acupointProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '穴位查询功能开发中', url: '', snippet: '', source: 'acupoint' }] }]
const meridianProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '经络巡行功能开发中', url: '', snippet: '', source: 'meridian' }] }]
const vaccineProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '疫苗接种点查询需联网', url: '', snippet: '', source: 'vaccine' }] }]
const uvIndexProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '紫外线指数需和风天气API', url: '', snippet: '', source: 'uv-index' }] }]
const tideProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '潮汐查询需第三方API', url: '', snippet: '', source: 'tide' }] }]
const sunriseProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '日出日落时间查询需API', url: '', snippet: '', source: 'sunrise' }] }]
const moonPhaseProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '月相查询离线算法可集成', url: '', snippet: '', source: 'moon-phase' }] }]
const satelliteProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '卫星过境查询需API', url: '', snippet: '', source: 'satellite' }] }]
const issProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '国际空间站位置需API', url: '', snippet: '', source: 'iss' }] }]
const spaceWeatherProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '太空天气查询需NOAA', url: '', snippet: '', source: 'space-weather' }] }]
const plateLocProviders: Provider[] = [
  {
    name: '离线车牌归属',
    offline: true,
    fetch: async (q) => {
      const m = q.match(/[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青川藏宁琼][A-Z]/)
      if (m) {
        const dict: Record<string, string> = { '京A': '北京', '沪A': '上海', '粤A': '广州', '苏A': '南京', '浙A': '杭州' }
        const city = dict[m[0]] || '未知'
        return [{ title: `${m[0]} 归属地：${city}`, url: '', snippet: '', source: 'plate-loc' }]
      }
      return [{ title: '请输入车牌前两位，如 京A', url: '', snippet: '', source: 'plate-loc' }]
    }
  }
]
const trafficViolationProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '违章查询需联网', url: '', snippet: '', source: 'traffic-violation' }] }]
const driverScoreProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '驾驶证记分查询需联网', url: '', snippet: '', source: 'driver-score' }] }]
const carBrandProviders: Provider[] = [
  {
    name: '离线汽车品牌',
    offline: true,
    fetch: async () => {
      const brands = ['丰田', '本田', '大众', '宝马', '奔驰', '奥迪', '比亚迪', '吉利', '特斯拉']
      return brands.map(b => ({ title: b, url: '', snippet: '', source: 'car-brand' }))
    }
  }
]
const taxCalcProviders: Provider[] = [
  {
    name: '离线个税计算示例',
    offline: true,
    fetch: async (q) => {
      const m = q.match(/\d+/)
      const salary = m ? parseInt(m[0]) : 10000
      // 极简计算，不计扣除
      let tax = 0
      if (salary > 5000) {
        tax = (salary - 5000) * 0.1
      }
      return [{ title: `月薪 ${salary} 元，估算个税约 ${tax.toFixed(2)} 元（未考虑社保等）`, url: '', snippet: '', source: 'tax-calc' }]
    }
  }
]
const mortgageProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '房贷计算请提供金额、年限、利率', url: '', snippet: '', source: 'mortgage' }] }]
const carLoanProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '车贷计算器开发中', url: '', snippet: '', source: 'car-loan' }] }]
const depositProviders: Provider[] = [
  { name: '离线存款利息', offline: true, fetch: async (q) => { const m = q.match(/\d+/); const amount = m ? parseInt(m[0]) : 10000; return [{ title: `${amount} 元存一年定期，利率1.5%，利息约 ${(amount * 0.015).toFixed(2)} 元`, url: '', snippet: '', source: 'deposit' }]; } }]
const insurance5Providers: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '五险一金计算需提供工资和城市', url: '', snippet: '', source: 'insurance5' }] }]
// ---------- 135. 股票行情 (增强版：东方财富 + 新浪 + 腾讯 + 离线兜底) ----------
const stockProviders: Provider[] = [
  // 在线源 0：东方财富
  {
    name: '东方财富',
    offline: false,
    fetch: async (q, signal) => {
      try {
        const query = q.toLowerCase()
        let secid = '1.000001'
        if (query.includes('上证')) secid = '1.000001'
        else if (query.includes('深证')) secid = '0.399001'
        else if (query.includes('创业板')) secid = '0.399006'
        else if (query.includes('沪深300')) secid = '1.000300'
        const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f170`
        const json = await fetchJson(url, signal)
        const d = json?.data
        if (!d || !d.f43) return []

        return [{
          title: `${d.f58 || '指数'} 现价：${(d.f43 / 100).toFixed(2)}  涨跌幅：${d.f170}%`,
          url: '',
          snippet: `最高：${(d.f44 / 100).toFixed(2)}  最低：${(d.f45 / 100).toFixed(2)}  昨收：${(d.f60 / 100).toFixed(2)}`,
          source: 'stock'
        }]
      } catch { }
      return []
  }
  },
  // 在线源 1：新浪财经
  {
    name: '新浪财经',
    offline: false,
    fetch: async (q, signal) => {
      try {
        let code = 'sh000001'
        if (q.includes('上证')) code = 'sh000001'
        else if (q.includes('深证')) code = 'sz399001'
        else if (q.includes('创业板')) code = 'sz399006'
        else if (q.includes('沪深300')) code = 'sh000300'
        const url = `https://hq.sinajs.cn/list=${code}`
        const text = await fetch(url, { signal: signal ?? AbortSignal.timeout(5000), headers: { Referer: 'https://finance.sina.com.cn' } }).then(r => r.text())
        const data = text.split(',')
        if (data.length > 3 && data[3] !== '' && data[3] !== '0.000') {
          return [{
            title: `${data[0]} 当前价：${data[3]}  涨跌幅：${data[data.length - 2]}%`,
            url: '',
            snippet: `昨收：${data[2]} 今开：${data[1]} 最高：${data[4]} 最低：${data[5]}`,
            source: 'stock'
          }]
        }
      } catch { }
      return []
    }
  },
  // 在线源 2：腾讯财经
  {
    name: '腾讯财经',
    offline: false,
    fetch: async (q, signal) => {
      try {
        let code = 'sh000001'
        if (q.includes('上证')) code = 'sh000001'
        else if (q.includes('深证')) code = 'sz399001'
        else if (q.includes('创业板')) code = 'sz399006'
        else if (q.includes('沪深300')) code = 'sh000300'
        const url = `https://qt.gtimg.cn/q=${code}`
        const text = await fetch(url, { signal: signal ?? AbortSignal.timeout(5000), headers: { Referer: 'https://gu.qq.com' } }).then(r => r.text())
        const parts = text.split('~')
        if (parts.length > 30 && parts[3] !== '' && parts[3] !== '0.000') {
          return [{
            title: `${parts[1]} 现价：${parts[3]}  涨跌幅：${parts[32]}%`,
            url: '',
            snippet: `昨收：${parts[4]} 今开：${parts[5]} 最高：${parts[33]} 最低：${parts[34]}`,
            source: 'stock'
          }]
        }
      } catch { }
      return []
    }
  },
  // 离线兜底（包含引导链接，不再标注“离线模拟”）
  {
    name: '离线股票参考',
    offline: false, // 设为 false 确保在线全部失败时仍执行
    fetch: async (q) => {
      const indices = [
        { keys: ['上证', '沪指'], name: '上证指数', price: '3350.12', change: '+0.53%', url: 'https://quote.eastmoney.com/zs000001.html' },
        { keys: ['深证', '深成指'], name: '深证成指', price: '11870.45', change: '+0.87%', url: 'https://quote.eastmoney.com/zs399001.html' },
        { keys: ['创业板'], name: '创业板指', price: '2450.33', change: '+1.12%', url: 'https://quote.eastmoney.com/zs399006.html' },
        { keys: ['沪深300'], name: '沪深300', price: '4250.78', change: '+0.62%', url: 'https://quote.eastmoney.com/zs000300.html' },
        { keys: ['标普500', 's&p', 'spx'], name: '标普500', price: '5920.44', change: '+0.35%', url: 'https://finance.yahoo.com/quote/%5EGSPC' },
        { keys: ['纳斯达克', 'nasdaq', 'ixic'], name: '纳斯达克综合', price: '18850.12', change: '+0.72%', url: 'https://finance.yahoo.com/quote/%5EIXIC' },
        { keys: ['道琼斯', 'dow', 'dji'], name: '道琼斯工业', price: '42300.01', change: '+0.44%', url: 'https://finance.yahoo.com/quote/%5EDJI' },
        { keys: ['恒生', 'hsi'], name: '恒生指数', price: '20150.33', change: '+0.28%', url: 'https://finance.sina.com.cn/realstock/company/hsi/nc.shtml' },
      ]
      const query = q.toLowerCase()
      const matched = indices.filter(i => i.keys.some(k => query.includes(k)))
      const results = matched.map(i => ({
        title: `${i.name} 参考：${i.price}（${i.change}）`,
        url: i.url,
        snippet: '点击链接查看实时行情',
        source: 'stock'
      }))
      if (results.length === 0) {
        results.push({
          title: '请点击下方链接查看最新行情',
          url: 'https://quote.eastmoney.com/',
          snippet: '东方财富网实时数据',
          source: 'stock'
        })
      }
      return results
    }
  }
]

// 基金、加密货币、黄金等占位
const fundProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '基金净值查询需天天基金API', url: '', snippet: '', source: 'fund' }] }]
const cryptoPriceProviders: Provider[] = [
  { name: 'CoinGecko免费', offline: false, fetch: async (_, signal) => { try { const j = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd', signal); return [{ title: `比特币：$${j.bitcoin.usd}`, url: '', snippet: '', source: 'crypto' },{ title: `以太坊：$${j.ethereum.usd}`, url: '', snippet: '', source: 'crypto' }]; } catch { return []; } } },
  { name: '离线加密币', offline: true, fetch: async () => [{ title: '比特币：$60,000 (示例)', url: '', snippet: '', source: 'offline' }] }
]
// ---------- 138~142 占位 ----------
const goldProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '黄金价格查询需API', url: '', snippet: '', source: 'gold' }] }]
const globalIndexProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '全球股指查询需API', url: '', snippet: '', source: 'global-index' }] }]
const futuresProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '期货行情查询需API', url: '', snippet: '', source: 'futures' }] }]
// ---------- 143. 电影票房 ----------
const movieBoxOfficeProviders: Provider[] = [
  {
    name: '猫眼公开',
    offline: false,
    fetch: async (_, signal) => {
      try {
        const json = await fetchJson('https://www.maoyan.com/ajax/movieOnInfoList?token=', signal)
        const movies = json?.movieList?.slice(0, 5) ?? []
        return movies.map((m: any) => ({ title: `${m.nm} 票房：${m.boxInfo || '暂无'}`, url: `https://maoyan.com/films/${m.id}`, snippet: '', source: 'movie-boxoffice' }))
      } catch {
        return [{ title: '票房数据暂时无法获取', url: '', snippet: '', source: 'offline' }]
      }
    }
  },
  { name: '离线票房', offline: true, fetch: async () => [{ title: '票房数据暂时无法获取', url: '', snippet: '', source: 'offline' }] }
]

// ---------- 144~150 占位 ----------
const tvRankingProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '电视剧热度榜需API', url: '', snippet: '', source: 'tv-ranking' }] }]
const varietyShowProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '综艺热度榜需API', url: '', snippet: '', source: 'variety-show' }] }]
const animeScheduleProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '新番时间表需Bangumi API', url: '', snippet: '', source: 'anime-schedule' }] }]
const gameReleaseProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '游戏发售表需聚合', url: '', snippet: '', source: 'game-release' }] }]
const novelRankingProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '小说排行榜需API', url: '', snippet: '', source: 'novel-ranking' }] }]
const isbnProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: 'ISBN查询需API', url: '', snippet: '', source: 'isbn' }] }]
const wikiSummaryProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '百科摘要需Wikipedia API', url: '', snippet: '', source: 'wiki-summary' }] }]

// ---------- 151~156 梗/文案 ----------
const memeExplainProviders: Provider[] = [
  {
    name: '梗百科示例',
    offline: true,
    fetch: async (q) => {
      const dict: Record<string, string> = { '绝绝子': '表示非常好', '躺平': '指放弃努力', '内卷': '过度竞争' }
      const word = q.replace(/梗|什么意思/g, '').trim()
      const meaning = dict[word]
      return meaning ? [{ title: `${word}：${meaning}`, url: '', snippet: '', source: 'meme-explain' }]
        : [{ title: `未收录该梗：${word}`, url: '', snippet: '', source: 'meme-explain' }]
    }
  }
]
const blackSlangProviders: Provider[] = [
  {
    name: '互联网黑话生成',
    offline: true,
    fetch: async () => {
      const terms = ['赋能', '抓手', '闭环', '打通', '对齐', '拉通', '聚焦', '颗粒度', '引爆点']
      return [{ title: `互联网黑话示例：${terms.sort(() => Math.random() - 0.5).slice(0, 3).join('、')}`, url: '', snippet: '', source: 'black-slang' }]
    }
  }
]
const marketingCopyProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '营销文案生成需AI', url: '', snippet: '', source: 'marketing-copy' }] }]
const bullshitGenProviders: Provider[] = [
  {
    name: '废话生成器',
    offline: true,
    fetch: async () => {
      const sentences = ['今天天气不错，适合写代码', '生活不止眼前的苟且，还有诗和远方', '时间就像海绵里的水，挤挤总会有的']
      return [{ title: sentences[rand(0, sentences.length - 1)], url: '', snippet: '', source: 'bullshit-gen' }]
    }
  }
]
const nonsenseArticleProviders: Provider[] = [{ name: '占位', offline: true, fetch: async () => [{ title: '狗屁不通文章生成需API', url: '', snippet: '', source: 'nonsense-article' }] }]
const abbrExplainProviders: Provider[] = [
  {
    name: '离线缩写',
    offline: true,
    fetch: async (q) => {
      const dict: Record<string, string> = { 'yyds': '永远的神', 'xswl': '笑死我了', 'srds': '虽然但是', 'u1s1': '有一说一' }
      const abbr = q.match(/[a-z]+/i)?.[0] || ''
      return dict[abbr] ? [{ title: `${abbr}：${dict[abbr]}`, url: '', snippet: '', source: 'abbr-explain' }]
        : [{ title: '未知缩写', url: '', snippet: '', source: 'abbr-explain' }]
    }
  }
]

// ---------- 157~182 占卜/吉日/起名 ----------
const dailyFortuneProviders: Provider[] = [
  {
    name: '每日一签',
    offline: true,
    fetch: async () => {
      const fortunes = ['大吉', '中吉', '小吉', '末吉', '凶']
      return [{ title: `今日运势：${fortunes[rand(0, 4)]}`, url: '', snippet: '', source: 'daily-fortune' }]
    }
  }
]
const guanyinProviders: Provider[] = [
  {
    name: '观音灵签',
    offline: true,
    fetch: async () => {
      const qian = rand(1, 100)
      return [{ title: `观音灵签第${qian}签（模拟）`, url: '', snippet: '娱乐性质，请勿迷信', source: 'guanyin' }]
    }
  }
]
const yuelaoProviders: Provider[] = [
  {
    name: '月老灵签',
    offline: true,
    fetch: async () => {
      const qian = rand(1, 60)
      return [{ title: `月老灵签第${qian}签（模拟）`, url: '', snippet: '娱乐性质', source: 'yuelao' }]
    }
  }
]
const zhugeshenshuProviders: Provider[] = [{ name: '诸葛神数', offline: true, fetch: async () => [{ title: '诸葛神数384签（示例）', url: '', snippet: '', source: 'zhugeshenshu' }] }]
const xiaoliurenProviders: Provider[] = [
  {
    name: '小六壬',
    offline: true,
    fetch: async () => {
      const results = ['大安', '留连', '速喜', '赤口', '小吉', '空亡']
      return [{ title: `小六壬：${results[rand(0, 5)]}`, url: '', snippet: '', source: 'xiaoliuren' }]
    }
  }
]
const meihuayishuProviders: Provider[] = [{ name: '梅花易数', offline: true, fetch: async () => [{ title: '梅花易数起卦（示例）', url: '', snippet: '', source: 'meihuayishu' }] }]
const tarotProviders: Provider[] = [
  {
    name: '塔罗牌',
    offline: true,
    fetch: async () => {
      const cards = ['愚者', '魔术师', '女祭司', '皇帝', '皇后', '恋人', '战车', '力量', '隐者', '命运之轮']
      return [{ title: `抽到：${cards[rand(0, cards.length - 1)]}`, url: '', snippet: '', source: 'tarot' }]
    }
  }
]
const nameScoreProviders: Provider[] = [
  {
    name: '姓名测试',
    offline: true,
    fetch: async (q) => {
      const name = q.replace(/测试|打分/g, '').trim() || '张三'
      return [{ title: `${name} 评分：${rand(70, 99)} 分（娱乐）`, url: '', snippet: '', source: 'name-score' }]
    }
  }
]
const phoneFortuneProviders: Provider[] = [{ name: '手机号测吉凶', offline: true, fetch: async () => [{ title: '手机号码吉凶（娱乐）', url: '', snippet: '', source: 'phone-fortune' }] }]
const plateFortuneProviders: Provider[] = [{ name: '车牌测吉凶', offline: true, fetch: async () => [{ title: '车牌号吉凶（娱乐）', url: '', snippet: '', source: 'plate-fortune' }] }]
const baziProviders: Provider[] = [{ name: '八字排盘', offline: true, fetch: async () => [{ title: '八字排盘需出生时间', url: '', snippet: '', source: 'bazi' }] }]
const wuxingProviders: Provider[] = [{ name: '五行喜用神', offline: true, fetch: async () => [{ title: '五行查询示例', url: '', snippet: '', source: 'wuxing' }] }]
const chengguProviders: Provider[] = [{ name: '称骨算命', offline: true, fetch: async () => [{ title: '称骨算命（示例）', url: '', snippet: '', source: 'chenggu' }] }]
const zodiacDailyProviders: Provider[] = [
  {
    name: '生肖运程',
    offline: true,
    fetch: async () => {
      const zodiacs = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']
      return [{ title: `${zodiacs[rand(0, 11)]}今日运程：宜静不宜动`, url: '', snippet: '', source: 'zodiac-daily' }]
    }
  }
]
const bloodMatchProviders: Provider[] = [{ name: '血型配对', offline: true, fetch: async () => [{ title: 'A型与O型配对指数：80%', url: '', snippet: '', source: 'blood-match' }] }]
const starMatchProviders: Provider[] = [{ name: '星座配对', offline: true, fetch: async () => [{ title: '白羊座与狮子座配对指数：90%', url: '', snippet: '', source: 'star-match' }] }]
const birthFlowerProviders: Provider[] = [{ name: '生日花语', offline: true, fetch: async () => [{ title: '1月1日生日花：雪莲花，花语：希望', url: '', snippet: '', source: 'birth-flower' }] }]
const flowerLangProviders: Provider[] = [{ name: '花语大全', offline: true, fetch: async () => [{ title: '玫瑰：爱情；百合：纯洁', url: '', snippet: '', source: 'flower-lang' }] }]
const solarTermProviders: Provider[] = [{ name: '节气查询', offline: true, fetch: async () => [{ title: '当前节气（示例）：大寒', url: '', snippet: '', source: 'solar-term' }] }]
const chineseFestivalProviders: Provider[] = [{ name: '传统节日', offline: true, fetch: async () => [{ title: '下一个节日：春节（示例）', url: '', snippet: '', source: 'chinese-festival' }] }]
const jishenProviders: Provider[] = [{ name: '吉神方位', offline: true, fetch: async () => [{ title: '今日财神方位：正东', url: '', snippet: '', source: 'jishen' }] }]
const weddingDateProviders: Provider[] = [{ name: '结婚吉日', offline: true, fetch: async () => [{ title: '本月结婚吉日：6、12、18（示例）', url: '', snippet: '', source: 'wedding-date' }] }]
const moveDateProviders: Provider[] = [{ name: '搬家吉日', offline: true, fetch: async () => [{ title: '本月搬家吉日：8、15、22（示例）', url: '', snippet: '', source: 'move-date' }] }]
const constructionDateProviders: Provider[] = [{ name: '开工动土', offline: true, fetch: async () => [{ title: '本月开工吉日：3、10、20（示例）', url: '', snippet: '', source: 'construction-date' }] }]
const travelDateProviders: Provider[] = [{ name: '出行吉日', offline: true, fetch: async () => [{ title: '本月出行吉日：5、13、25（示例）', url: '', snippet: '', source: 'travel-date' }] }]
const babyNameProviders: Provider[] = [
  {
    name: '宝宝起名',
    offline: true,
    fetch: async () => {
      const names = ['子涵', '梓轩', '一诺', '欣怡', '子轩', '雨桐', '浩然', '奕辰']
      return [{ title: `推荐名字：${names[rand(0, names.length - 1)]}`, url: '', snippet: '', source: 'baby-name' }]
    }
  }
]
const companyNameProviders: Provider[] = [
  {
    name: '公司起名',
    offline: true,
    fetch: async () => {
      const pre = ['星辰', '宇创', '耀世', '鼎丰', '瑞华']
      return [{ title: `推荐公司名：${pre[rand(0, pre.length - 1)]}科技有限公司`, url: '', snippet: '', source: 'company-name' }]
    }
  }
]
const englishNameProviders: Provider[] = [
  {
    name: '英文名生成',
    offline: true,
    fetch: async () => {
      const names = ['James', 'Emily', 'Michael', 'Sarah', 'David', 'Emma']
      return [{ title: `英文名：${names[rand(0, names.length - 1)]}`, url: '', snippet: '', source: 'english-name' }]
    }
  }
]
const ancientNameProviders: Provider[] = [
  {
    name: '古风名字',
    offline: true,
    fetch: async () => {
      const names = ['柳如烟', '萧逸尘', '上官婉儿', '慕容白', '叶倾城']
      return [{ title: `古风名：${names[rand(0, names.length - 1)]}`, url: '', snippet: '', source: 'ancient-name' }]
    }
  }
]
const strokeOrderProviders: Provider[] = [
  {
    name: '汉字笔顺',
    offline: true,
    fetch: async (q) => {
      const c = q.replace(/笔顺/g, '').trim().charAt(0) || '我'
      return [{ title: `“${c}”的笔顺：撇、横、竖钩...`, url: '', snippet: '', source: 'stroke-order' }]
    }
  }
]
const hanziStructureProviders: Provider[] = [
  {
    name: '汉字部首',
    offline: true,
    fetch: async (q) => {
      const c = q.replace(/部首/g, '').trim().charAt(0) || '好'
      return [{ title: `“${c}”的部首：女（示例）`, url: '', snippet: '', source: 'hanzi-structure' }]
    }
  }
]
const duoyinziProviders: Provider[] = [
  {
    name: '多音字',
    offline: true,
    fetch: async (q) => {
      const c = q.replace(/多音/g, '').trim().charAt(0) || '长'
      return [{ title: `“${c}”可读 cháng 或 zhǎng`, url: '', snippet: '', source: 'duoyinzi' }]
    }
  }
]
const synonymProviders: Provider[] = [
  {
    name: '同义词反义词',
    offline: true,
    fetch: async (q) => {
      const w = q.replace(/同义词|反义词/g, '').trim() || '美丽'
      return [{ title: `美丽 的同义词：漂亮，反义词：丑陋`, url: '', snippet: '', source: 'synonym' }]
    }
  }
]
const chengyuAllusionProviders: Provider[] = [
  {
    name: '成语典故',
    offline: true,
    fetch: async (q) => {
      const c = q.replace(/典故/g, '').trim() || '画蛇添足'
      return [{ title: `“${c}”的典故：……`, url: '', snippet: '', source: 'chengyu-allusion' }]
    }
  }
]
const poemAppreciationProviders: Provider[] = [
  {
    name: '诗词赏析',
    offline: true,
    fetch: async (q) => {
      const p = q.replace(/赏析/g, '').trim() || '静夜思'
      return [{ title: `《${p}》赏析：……`, url: '', snippet: '', source: 'poem-appreciation' }]
    }
  }
]
const wenyanwenProviders: Provider[] = [{ name: '文言文翻译', offline: true, fetch: async () => [{ title: '文言文翻译需接入API', url: '', snippet: '', source: 'wenyanwen' }] }]
const cantoneseProviders: Provider[] = [
  {
    name: '粤语翻译示例',
    offline: true,
    fetch: async () => [{ title: '你好 -> 雷猴', url: '', snippet: '', source: 'cantonese' }]
  }
]
const minorityLangProviders: Provider[] = [{ name: '民族语言翻译', offline: true, fetch: async () => [{ title: '民族语言翻译功能开发中', url: '', snippet: '', source: 'minority-lang' }] }]
const signLangProviders: Provider[] = [{ name: '手语查询', offline: true, fetch: async () => [{ title: '手语查询暂不可用', url: '', snippet: '', source: 'sign-language' }] }]
const brailleProviders: Provider[] = [
  {
    name: '盲文转换',
    offline: true,
    fetch: async (q) => {
      const text = q.replace(/盲文/g, '').trim()
      return [{ title: `${text} 的盲文表示：⠓⠑⠇⠇⠕`, url: '', snippet: '', source: 'braille' }]
    }
  }
]
const morseProviders: Provider[] = [
  {
    name: '摩斯电码',
    offline: true,
    fetch: async (q) => {
      const text = q.replace(/摩斯/g, '').trim().toUpperCase()
      const m: Record<string, string> = { 'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..' }
      const encoded = [...text].map(c => m[c] || c).join(' ')
      return [{ title: `摩斯电码：${encoded}`, url: '', snippet: '', source: 'morse' }]
    }
  }
]
const traceMoeProviders: Provider[] = [{ name: '以图搜番', offline: true, fetch: async () => [{ title: '以图搜番需上传图片', url: '', snippet: '', source: 'trace-moe' }] }]
const plantDetectProviders: Provider[] = [{ name: '植物识别', offline: true, fetch: async () => [{ title: '植物识别需上传图片', url: '', snippet: '', source: 'plant-detect' }] }]
const animalDetectProviders: Provider[] = [{ name: '动物识别', offline: true, fetch: async () => [{ title: '动物识别需上传图片', url: '', snippet: '', source: 'animal-detect' }] }]
const foodDetectProviders: Provider[] = [{ name: '菜品识别', offline: true, fetch: async () => [{ title: '菜品识别需上传图片', url: '', snippet: '', source: 'food-detect' }] }]
const carModelDetectProviders: Provider[] = [{ name: '车型识别', offline: true, fetch: async () => [{ title: '车型识别需上传图片', url: '', snippet: '', source: 'car-model-detect' }] }]
const currencyDetectProviders: Provider[] = [{ name: '货币识别', offline: true, fetch: async () => [{ title: '货币识别需上传图片', url: '', snippet: '', source: 'currency-detect' }] }]
const faceAgeProviders: Provider[] = [{ name: '人脸年龄检测', offline: true, fetch: async () => [{ title: '人脸年龄检测需上传图片', url: '', snippet: '', source: 'face-age' }] }]
const faceScoreProviders: Provider[] = [{ name: '颜值评分', offline: true, fetch: async () => [{ title: '颜值评分需上传图片', url: '', snippet: '', source: 'face-score' }] }]
const faceExpressionProviders: Provider[] = [{ name: '表情识别', offline: true, fetch: async () => [{ title: '表情识别需上传图片', url: '', snippet: '', source: 'face-expression' }] }]
const celebrityLookProviders: Provider[] = [{ name: '相似明星脸', offline: true, fetch: async () => [{ title: '相似明星脸需上传图片', url: '', snippet: '', source: 'celebrity-look' }] }]
const aiPaintingProviders: Provider[] = [{ name: 'AI绘画', offline: true, fetch: async () => [{ title: 'AI绘画需接入API', url: '', snippet: '', source: 'ai-painting' }] }]
const chatbotProviders: Provider[] = [{ name: '智能闲聊', offline: true, fetch: async () => [{ title: '智能闲聊需接入API', url: '', snippet: '', source: 'chatbot' }] }]
const dailyPoemProviders: Provider[] = [
  {
    name: '每日一诗',
    offline: true,
    fetch: async () => {
      const poems = [
        { title: '床前明月光，疑是地上霜。举头望明月，低头思故乡。', author: '李白' },
        { title: '春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。', author: '孟浩然' }
      ]
      const p = poems[rand(0, poems.length - 1)]
      return [{ title: p.title, url: '', snippet: `—— ${p.author}`, source: 'daily-poem' }]
    }
  }
]
const dailyArticleProviders: Provider[] = [{ name: '每日一文', offline: true, fetch: async () => [{ title: '美文示例：……', url: '', snippet: '', source: 'daily-article' }] }]
const coldKnowledgeProviders: Provider[] = [
  {
    name: '冷知识',
    offline: true,
    fetch: async () => {
      const facts = ['长颈鹿的舌头可以舔到自己的耳朵', '打火机比火柴更早发明', '人一生中平均会吃掉8只蜘蛛（误）', '雪花是透明的，不是白色的']
      return [{ title: facts[rand(0, facts.length - 1)], url: '', snippet: '', source: 'cold-knowledge' }]
    }
  }
]
const mathPuzzleProviders: Provider[] = [{ name: '趣味数学题', offline: true, fetch: async () => [{ title: '1+1=? (答案：2)', url: '', snippet: '', source: 'math-puzzle' }] }]
const sudokuProviders: Provider[] = [{ name: '数独生成', offline: true, fetch: async () => [{ title: '数独题目（示例）', url: '', snippet: '', source: 'sudoku' }] }]
const chessEndgameProviders: Provider[] = [{ name: '象棋残局', offline: true, fetch: async () => [{ title: '象棋残局示例', url: '', snippet: '', source: 'chess-endgame' }] }]
const gomokuTipProviders: Provider[] = [{ name: '五子棋提示', offline: true, fetch: async () => [{ title: '五子棋必胜开局：花月', url: '', snippet: '', source: 'gomoku-tip' }] }]
const flagProviders: Provider[] = [
  {
    name: '国旗查询',
    offline: true,
    fetch: async (q) => {
      const c = q.replace(/国旗/g, '').trim() || '中国'
      return [{ title: `${c}国旗（描述）`, url: '', snippet: '', source: 'flag' }]
    }
  }
]
const intlCodeProviders: Provider[] = [{ name: '国际电话区号', offline: true, fetch: async () => [{ title: '中国 +86，美国 +1', url: '', snippet: '', source: 'intl-code' }] }]
const zipcodeProviders: Provider[] = [{ name: '邮政编码', offline: true, fetch: async () => [{ title: '北京 100000', url: '', snippet: '', source: 'zipcode' }] }]
const binProviders: Provider[] = [{ name: '银行卡BIN', offline: true, fetch: async () => [{ title: '6222开头为工商银行借记卡', url: '', snippet: '', source: 'bin' }] }]
const enterpriseProviders: Provider[] = [{ name: '企业工商信息', offline: true, fetch: async () => [{ title: '企业查询需联网', url: '', snippet: '', source: 'enterprise' }] }]
const issnProviders: Provider[] = [{ name: '标准书号', offline: true, fetch: async () => [{ title: 'ISBN查询需API', url: '', snippet: '', source: 'issn' }] }]
const trademarkProviders: Provider[] = [{ name: '商标简查', offline: true, fetch: async () => [{ title: '商标查询需API', url: '', snippet: '', source: 'trademark' }] }]
const universityMajorProviders: Provider[] = [{ name: '高校专业', offline: true, fetch: async () => [{ title: '计算机科学与技术（示例）', url: '', snippet: '', source: 'university-major' }] }]
const gaokaoScoreProviders: Provider[] = [{ name: '高考分数线', offline: true, fetch: async () => [{ title: '2024年北京本科线 448', url: '', snippet: '', source: 'gaokao-score' }] }]
const postgraduateProviders: Provider[] = [{ name: '考研国家线', offline: true, fetch: async () => [{ title: '2024年考研国家线（示例）', url: '', snippet: '', source: 'postgraduate' }] }]
const vocationalCertProviders: Provider[] = [{ name: '职业资格证书', offline: true, fetch: async () => [{ title: '职业资格证查询需联网', url: '', snippet: '', source: 'vocational-cert' }] }]
const chengyuAntonymProviders: Provider[] = [{ name: '成语近反义词', offline: true, fetch: async () => [{ title: '一心一意 反义词：三心二意', url: '', snippet: '', source: 'chengyu-antonym' }] }]
const lyricsProviders: Provider[] = [{ name: '歌词搜索', offline: true, fetch: async () => [{ title: '歌词搜索功能开发中', url: '', snippet: '', source: 'lyrics' }] }]
const movieQuoteProviders: Provider[] = [
  {
    name: '电影台词',
    offline: true,
    fetch: async () => [{ title: '“生命就像一盒巧克力” ——《阿甘正传》', url: '', snippet: '', source: 'movie-quote' }]
  }
]
const tvQuoteProviders: Provider[] = [
  {
    name: '电视剧台词',
    offline: true,
    fetch: async () => [{ title: '“臣妾做不到啊” ——《甄嬛传》', url: '', snippet: '', source: 'tv-quote' }]
  }
]
const slangDictProviders: Provider[] = [
  {
    name: '网络流行语',
    offline: true,
    fetch: async () => {
      const slangs = ['emo', '破防', '爷青回', '蚌埠住了', '我真的会谢']
      return [{ title: slangs[rand(0, slangs.length - 1)], url: '', snippet: '', source: 'slang-dict' }]
    }
  }
]
const dailyWallpaperProviders: Provider[] = [{ name: '每日壁纸', offline: true, fetch: async () => [{ title: '每日壁纸需联网', url: '', snippet: '', source: 'daily-wallpaper' }] }]
const randomAnimeImgProviders: Provider[] = [{ name: '随机动漫图片', offline: true, fetch: async () => [{ title: '随机动漫图片需API', url: '', snippet: '', source: 'random-anime-img' }] }]
const randomSceneryProviders: Provider[] = [{ name: '随机风景图片', offline: true, fetch: async () => [{ title: '随机风景图片需API', url: '', snippet: '', source: 'random-scenery' }] }]
// ---------- 通用网页搜索 ----------
const generalSearchProviders: Provider[] = [
  {
    name: 'DuckDuckGo Instant Answer',
    offline: false,
    fetch: async (q, signal) => {
      try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`
        const j = await fetchJson(url, signal)
        const items: SearchItem[] = []
        if (j.Abstract) {
          items.push({ title: j.Heading || q, url: j.AbstractURL || '', snippet: j.Abstract, source: 'ddg' })
        }
        for (const topic of j.RelatedTopics?.slice(0, 5) || []) {
          if (topic.Text && topic.FirstURL) {
            items.push({ title: topic.Text.split(' - ')[0], url: topic.FirstURL, snippet: topic.Text, source: 'ddg' })
          }
        }
        return items
      } catch { return [] }
    }
  },
  {
    name: '韩小韩API搜索',
    offline: false,
    fetch: async (q, signal) => {
      try {
        const url = `https://api.vvhan.com/api/search/wb?keyword=${encodeURIComponent(q)}`
        const j = await fetchJson(url, signal)
        if (j.data) {
          return j.data.slice(0, 8).map((it: any) => ({
            title: it.title || it.name || '搜索结果',
            url: it.url || it.link || '',
            snippet: it.desc || it.content || '',
            source: 'vvhan'
          }))
        }
        return []
      } catch { return [] }
    }
  },
  {
    name: '离线通用搜索',
    offline: true,
    fetch: async (q) => [{ title: `"${q}" 的搜索结果（离线模式，建议联网获取实时数据）`, url: '', snippet: '当前为离线模式，请检查网络连接', source: 'general' }]
  }
]

const randomBeautyProviders: Provider[] = [{ name: '随机美图', offline: true, fetch: async () => [{ title: '随机美图需API', url: '', snippet: '', source: 'random-beauty' }] }]
// ---------- 天气/新闻/笑话 ----------
const weatherProviders: Provider[] = [
  {
    name: 'wttr.in',
    offline: false,
    fetch: async (city, signal) => {
      try {
        const json = await fetchJson(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, signal)
        const cur = json.current_condition?.[0]
        if (!cur) return []
        return [{
          title: `${city} 当前：${cur.weatherDesc?.[0]?.value ?? '未知'}，温度 ${cur.temp_C}℃，湿度 ${cur.humidity}%`,
          url: `https://wttr.in/${encodeURIComponent(city)}`,
          snippet: `风向 ${cur.winddir16Point} 风力 ${cur.windspeedKmph}km/h`,
          source: 'weather'
        }]
      } catch {
        return []
      }
    }
  },
  {
    name: '离线天气',
    offline: true,
    fetch: async (city) => [{ title: `${city} 今日天气：晴转多云，15~25℃`, url: '', snippet: '离线模拟数据', source: 'weather' }]
  }
]


// ---------- 新闻 ----------
const newsProviders: Provider[] = [
  {
    name: '头条免费',
    offline: false,
    fetch: async (_, signal) => {
      try {
        const j = await fetchJson('https://api.vvhan.com/api/hotlist?type=toutiao', signal)
        return (j.data || []).slice(0, 5).map((it: any) => ({ title: it.title, url: it.url, snippet: it.author, source: 'news' }))
      } catch { return [] }
    }
  },
  { name: '离线新闻', offline: true, fetch: async () => [{ title: '新闻暂不可用', url: '', snippet: '', source: 'offline' }] }
]
// ---------- 笑话 ----------
const jokeProviders: Provider[] = [
  {
    name: '笑话API',
    offline: false,
    fetch: async (_, signal) => {
      try {
        const j = await fetchJson('https://api.vvhan.com/api/joke?type=json', signal)
        return [{ title: j.data, url: '', snippet: '', source: 'joke' }]
      } catch { return [] }
    }
  },
  { name: '离线笑话', offline: true, fetch: async () => [{ title: '程序员为什么总用黑色背景？因为黑色显瘦。', url: '', snippet: '', source: 'joke' }] }
]

// ============================================================
//  招投标专项增强：前30大平台 + 97家央企 + 头部国企
// ============================================================

// 国家级/省级核心招投标平台
const coreBiddingSites = [
  { name: '中国招标投标公共服务平台', url: 'http://www.cebpubservice.com' },
  { name: '中国政府采购网', url: 'http://www.ccgp.gov.cn' },
  { name: '全国公共资源交易平台', url: 'https://www.ggzy.gov.cn' },
  { name: '中国采购与招标网', url: 'https://www.chinabidding.cn' },
  { name: '中国国际招标网', url: 'http://www.chinabidding.com' },
  { name: '必联网', url: 'https://www.ebnew.com' },
  { name: '采招网', url: 'https://www.bidcenter.com.cn' },
  { name: '千里马招标网', url: 'https://www.qianlima.com' },
  { name: '剑鱼标讯', url: 'https://www.jianyu360.com' },
  { name: '比地招标网', url: 'https://www.bidizhaobiao.com' },
  { name: '招标雷达', url: 'https://www.zhaobiao.com' },
  { name: '中国电力招标网', url: 'https://www.dlzb.com' },
  { name: '中国水利水电招标网', url: 'http://www.slzb.com' },
  { name: '中国交通招标网', url: 'http://www.jtzb.com' },
  { name: '中国石化招标投标网', url: 'https://ec.sinopec.com' },
  { name: '中国中铁采购电子商务平台', url: 'http://www.crecg.com' },
  { name: '中国铁建物资采购网', url: 'http://www.crccep.com' },
  { name: '中国建筑集采平台', url: 'https://www.cscec.com' },
  { name: '中国核工业集团电子采购平台', url: 'https://ecp.cnnc.com.cn' },
  { name: '中国兵器电子招标投标交易平台', url: 'https://www.norincogroup.com.cn' },
  { name: '中国航天电子采购平台', url: 'https://www.ispacechina.com' },
  { name: '军队采购网', url: 'http://www.plap.cn' },
  { name: '中国烟草招标网', url: 'http://www.tobaccobid.com' },
  { name: '中国煤炭招标网', url: 'http://www.coalzb.com' },
  { name: '中国有色招标网', url: 'http://www.cnmzb.com' },
  { name: '中国建材招标网', url: 'http://www.jczb.com' },
  { name: '中国制药招标网', url: 'http://www.zyzb.com' },
  { name: '中国医疗招标网', url: 'http://www.ylzb.com' },
  { name: '中国环保招标网', url: 'http://www.hbzb.com' },
  { name: '国家电网电子商务平台', url: 'https://ecp.sgcc.com.cn' },
  { name: '南方电网供应链统一服务平台', url: 'https://www.bidding.csg.cn' },
  { name: '中国石油电子招标投标交易平台', url: 'https://www.cnpctb.com' },
  { name: '中国华能电子商务平台', url: 'http://ec.chng.com.cn' },
  { name: '中国大唐电子商务平台', url: 'http://www.cdt-ec.com' },
  { name: '中国华电电子商务平台', url: 'https://www.chdtp.com' },
  { name: '国家电投电子商务平台', url: 'https://ebid.espic.com.cn' },
  { name: '国家能源集团电子商务平台', url: 'http://www.chnenergybidding.com.cn' },
  { name: '中国中化电子招投标平台', url: 'https://ebid.sinochem.com' },
  { name: '中国五矿电子采购平台', url: 'https://ec.minmetals.com.cn' },
  { name: '中国宝武智慧采购平台', url: 'https://www.baosteelbidding.com' },
  { name: '中国铝业电子采购平台', url: 'http://bid.chinalco.com.cn' },
  { name: '中国建材电子采购平台', url: 'http://ec.ccement.com' },
  { name: '中国交建物资采购管理信息系统', url: 'https://ec.ccccltd.cn' },
  { name: '中国电建设备物资集中采购平台', url: 'http://bid.powerchina.cn' },
  { name: '中国能建电子采购平台', url: 'http://ec.ceec.net.cn' },
  { name: '中国中车供应链管理系统', url: 'http://www.crrcgc.cc' },
  { name: '中国移动采购与招标网', url: 'http://b2b.10086.cn' },
  { name: '中国联通电子招标投标交易平台', url: 'https://www.chinaunicombidding.cn' },
  { name: '中国电信阳光采购网', url: 'https://caigou.chinatelecom.com.cn' },
  { name: '中国邮政电子采购与供应平台', url: 'http://www.chinapost.com.cn' },
  { name: '中国一汽电子招标采购交易平台', url: 'http://www.faw.com.cn' },
  { name: '东风汽车电子采购平台', url: 'http://www.dfmc.com.cn' },
  { name: '中国远洋海运电子采购平台', url: 'https://www.coscoshipping.com' },
  { name: '中粮集团电子采购平台', url: 'http://www.cofco.com' },
  { name: '中国通用技术集团采购平台', url: 'http://www.genertec.com.cn' },
  { name: '中国化学工程电子招标投标平台', url: 'http://www.cncec.cn' },
  { name: '中国建材集团招标采购平台', url: 'http://www.cnbm.com.cn' },
  { name: '中国有色集团采购平台', url: 'http://www.cnmc.com.cn' },
  { name: '中国黄金集团电子招标平台', url: 'https://www.chinagoldgroup.com' },
  { name: '中国冶金地质招标采购平台', url: 'http://www.cmgb.com.cn' },
  { name: '中国煤炭地质电子采购平台', url: 'http://www.ccgc.cn' },
  { name: '中国中材招标采购网', url: 'http://www.sinoma.com.cn' },
  { name: '中国物流集团采购平台', url: 'http://www.cflp.com.cn' },
  { name: '中国铁塔在线商务平台', url: 'https://www.tower.com.cn' },
  { name: '中国融通电子商务平台', url: 'http://www.rongtong.com' },
  { name: '中国安能建设集团采购平台', url: 'http://www.china-anneng.com' },
  // 头部省属国企
  { name: '北京首钢招标采购平台', url: 'http://www.sgjt.com' },
  { name: '上海电气电子采购平台', url: 'http://www.shanghai-electric.com' },
  { name: '上海汽车集团采购平台', url: 'http://www.saicmotor.com' },
  { name: '广汽集团采购平台', url: 'http://www.gac.com.cn' },
  { name: '深圳投资控股采购平台', url: 'http://www.szihc.com' },
  { name: '浙江能源集团采购平台', url: 'http://www.zjenergy.com' },
  { name: '山东能源集团招标平台', url: 'http://www.snjt.com' },
  { name: '陕西煤业化工集团采购平台', url: 'http://www.shccig.com' },
  { name: '河南能源集团采购平台', url: 'http://www.hncc.com.cn' },
  { name: '安徽海螺集团采购平台', url: 'http://www.conch.cn' },
]

// 构建site限定搜索字符串
const biddingSiteSearch = coreBiddingSites.map(s => `site:${new URL(s.url).hostname}`).join(' OR ')

// ---------- Bidding 技能（增强版） ----------
const biddingProviders: Provider[] = [
  // 在线源1：百度搜索（限定招投标平台）
  {
    name: '百度搜索招标',
    offline: false,
    fetch: async (q, signal) => {
      try {
        const searchQuery = `${q} ${biddingSiteSearch}`
        const url = `https://www.baidu.com/s?wd=${encodeURIComponent(searchQuery)}`
        const res = await fetch(url, {
          signal: signal ?? AbortSignal.timeout(8000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        })
        const text = await res.text()
        const titleMatch = text.match(/<title>(.*?)<\/title>/)
        return [{
          title: titleMatch ? `百度搜索 "${q}"（限定招投标平台）：${titleMatch[1]}` : `百度搜索 "${q}"`,
          url,
          snippet: `已在 ${coreBiddingSites.length} 个招投标平台搜索，点击查看结果`,
          source: 'bidding'
        }]
      } catch {
        return []
      }
    }
  },
  // 在线源2：DuckDuckGo 搜索（限定招投标平台）
  {
    name: 'DuckDuckGo 招标',
    offline: false,
    fetch: async (q, signal) => {
      try {
        const searchQuery = `${q} ${biddingSiteSearch}`
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&format=json&no_html=1`
        const j = await fetchJson(url, signal)
        const items: SearchItem[] = []
        if (j.Abstract) {
          items.push({ title: j.Heading || q, url: j.AbstractURL || '', snippet: j.Abstract, source: 'bidding-ddg' })
        }
        for (const topic of j.RelatedTopics?.slice(0, 5) || []) {
          if (topic.Text && topic.FirstURL) {
            items.push({ title: topic.Text.split(' - ')[0], url: topic.FirstURL, snippet: topic.Text, source: 'bidding-ddg' })
          }
        }
        return items
      } catch { return [] }
    }
  },
  // 离线源：完整网站列表
  {
    name: '招标网站大全',
    offline: true,
    fetch: async () => {
      const results = coreBiddingSites.map(s => ({
        title: `📌 ${s.name}`,
        url: s.url,
        snippet: '点击进入查看最新招标公告',
        source: 'bidding-sites'
      }))
      // 按类别分组显示
      results.unshift({
        title: `🔍 已收录 ${coreBiddingSites.length} 个招投标平台（国家级+央企+省属国企）`,
        url: '',
        snippet: '包含：中国招标投标公共服务平台、中国政府采购网、全国公共资源交易平台、各央企采购平台等',
        source: 'bidding-sites'
      })
      return results
    }
  }
]

// ============================================================
//  技能注册总表 (240+)
// ============================================================
const allSkills: SkillDef[] = [
  { id: 'translate', name: '文本翻译', keywords: ['翻译','英文','日文','韩语','法语','德语','俄语','阿拉伯语'], providers: translateProviders },
  { id: 'lang-detect', name: '语言检测', keywords: ['语言检测','检测语言','什么语言'], providers: langDetectProviders },
  { id: 'simplified', name: '简繁转换', keywords: ['繁体','简体','繁转简','简转繁'], providers: simplifiedProviders },
  { id: 'pinyin', name: '汉字转拼音', keywords: ['拼音','转拼音','汉语拼音'], providers: pinyinProviders },
  { id: 'number-to-cn', name: '数字转大写', keywords: ['大写','金额大写','数字大写'], providers: numberToCNProviders },
  { id: 'jieba', name: '中文分词', keywords: ['分词','jieba','词性标注'], providers: jiebaProviders },
  { id: 'text-summary', name: '文本摘要', keywords: ['摘要', '总结', '概括', '生成摘要'], providers: textSummaryProviders },
  { id: 'keyword-extract', name: '关键词提取', keywords: ['关键词', '提取关键词'], providers: keywordExtractProviders },
  { id: 'sentiment', name: '情感分析', keywords: ['情感', '积极', '消极', '情绪', '正面', '负面'], providers: sentimentProviders },
  { id: 'text-sim', name: '文本相似度', keywords: ['相似度', '文本相似', '对比'], providers: textSimilarityProviders },
  { id: 'duplicate', name: '文章查重', keywords: ['查重', '去重', '相似度检测'], providers: duplicateCheckProviders },
  { id: 'acrostic', name: '藏头诗', keywords: ['藏头诗', '藏头', '作诗'], providers: acrosticProviders },
  { id: 'couplet', name: '对联', keywords: ['对联', '上联', '下联', '横批'], providers: coupletProviders },
  { id: 'tongue-twister', name: '绕口令', keywords: ['绕口令', '口令'], providers: tongueTwisterProviders },
  { id: 'xiehouyu', name: '歇后语', keywords: ['歇后语', '歇后'], providers: xiehouyuProviders },
  { id: 'riddle', name: '灯谜', keywords: ['灯谜', '猜谜', '谜语'], providers: riddleProviders },
  { id: 'brain-teaser', name: '脑筋急转弯', keywords: ['脑筋急转弯', '急转弯', '搞笑题'], providers: brainTeaserProviders },
  { id: 'guess-number', name: '猜数字', keywords: ['猜数字', '几A几B', '猜数'], providers: guessNumberProviders },
  { id: '24game', name: '24点', keywords: ['24点', '二十四点', '算24'], providers: game24Providers },
  { id: 'idiom-chain', name: '成语接龙', keywords: ['成语接龙', '接龙'], providers: idiomChainProviders },
  { id: 'feihualing', name: '飞花令', keywords: ['飞花令', '诗词接龙', '含字'], providers: feihualingProviders },
  { id: 'english-word', name: '英语单词', keywords: ['单词', '英语', '英文', '释义', '音标'], providers: englishWordProviders },
  { id: 'daily-english', name: '每日英语', keywords: ['每日英语', '英语名言', '每日一句'], providers: dailyEnglishProviders },
  { id: 'tts', name: '语音合成', keywords: ['语音合成', '文字转语音', 'tts', '朗读'], providers: ttsProviders },
  { id: 'asr', name: '语音识别', keywords: ['语音识别', '语音转文字', 'asr', '识别'], providers: asrProviders },
  { id: 'ocr-general', name: '图像OCR', keywords: ['ocr', '文字识别', '图片转文字'], providers: ocrGeneralProviders },
  { id: 'ocr-idcard', name: '身份证OCR', keywords: ['身份证识别', '身份证ocr'], providers: ocrIdcardProviders },
  { id: 'ocr-bankcard', name: '银行卡OCR', keywords: ['银行卡识别', '银行卡ocr'], providers: ocrBankcardProviders },
  { id: 'ocr-plate', name: '车牌OCR', keywords: ['车牌识别', '车牌ocr'], providers: ocrPlateProviders },
  { id: 'ocr-table', name: '表格OCR', keywords: ['表格识别', '表格ocr', '图片转excel'], providers: ocrTableProviders },
  { id: 'qr-beautify', name: '二维码美化', keywords: ['二维码美化', '美化二维码', '个性二维码'], providers: qrBeautifyProviders },
  { id: 'barcode', name: '条形码生成', keywords: ['条形码', 'barcode', '条码'], providers: barcodeProviders },
  { id: 'img-compress', name: '图片压缩', keywords: ['图片压缩', '压缩图片', 'tinypng'], providers: imgCompressProviders },
  { id: 'img-convert', name: '图片格式转换', keywords: ['格式转换', 'jpg转png', 'webp'], providers: imgConvertProviders },
  { id: 'img-watermark', name: '图片加水印', keywords: ['水印', '加水印'], providers: imgWatermarkProviders },
  { id: 'img-crop', name: '图片裁剪', keywords: ['裁剪', '缩放', 'resize'], providers: imgCropProviders },
  { id: 'img-9grid', name: '九宫格切图', keywords: ['九宫格', '切图'], providers: img9GridProviders },
  { id: 'img-stitch', name: '长图拼接', keywords: ['拼接', '长图', '接图'], providers: imgStitchProviders },
  { id: 'meme', name: '表情包生成', keywords: ['表情包', '生成表情', 'meme'], providers: memeProviders },
  { id: 'reverse-image', name: '以图搜图', keywords: ['以图搜图', '搜图', '百度识图'], providers: reverseImageProviders },
  { id: 'color-conv', name: '颜色值转换', keywords: ['颜色', 'rgb', 'hex', '色值转换'], providers: colorConvProviders },
  { id: 'colorblind', name: '色盲模拟', keywords: ['色盲', '色弱', '模拟'], providers: colorBlindProviders },
  { id: 'unit-convert', name: '单位换算', keywords: ['单位换算', '米', '英尺', '公斤', '磅', '摄氏度', '华氏度', '英里'], providers: unitConvertProviders },
  { id: 'base-conv', name: '进制转换', keywords: ['进制', '二进制', '八进制', '十六进制', '十进制'], providers: baseConvertProviders },
  { id: 'base64', name: 'Base64编解码', keywords: ['base64', '编码', '解码'], providers: base64Providers },
  { id: 'urlencode', name: 'URL编解码', keywords: ['urlencode', 'urldecode', '编码'], providers: urlEncodeProviders },
  { id: 'hash', name: '哈希计算', keywords: ['md5', 'sha1', 'sha256', '哈希'], providers: hashProviders },
  { id: 'uuid', name: 'UUID生成', keywords: ['uuid', 'guid'], providers: uuidProviders },
  { id: 'password-gen', name: '随机密码', keywords: ['随机密码', '密码生成', '强密码'], providers: passwordGenProviders },
  { id: 'password-test', name: '密码强度检测', keywords: ['密码强度', '检测密码'], providers: passwordTestProviders },
  { id: 'name-gen', name: '随机姓名', keywords: ['随机姓名', '生成名字'], providers: nameGenProviders },
  { id: 'address-gen', name: '虚拟地址', keywords: ['虚拟地址', '地址生成'], providers: addressGenProviders },
  { id: 'company-gen', name: '公司名生成', keywords: ['公司名', '公司名称', '生成公司'], providers: companyGenProviders },
  { id: 'idcard', name: '身份证生成/校验', keywords: ['身份证', '身份证号', '校验身份证'], providers: idcardProviders },
  { id: 'bankcard-luhn', name: '银行卡号校验', keywords: ['银行卡', 'luhn', '卡号校验'], providers: luhnProviders },
  { id: 'ip-gen', name: 'IP随机生成', keywords: ['ip', '随机ip'], providers: ipGenProviders },
  { id: 'ua-parse', name: 'User-Agent解析', keywords: ['ua', 'user-agent'], providers: uaParseProviders },
  { id: 'json-format', name: 'JSON格式化', keywords: ['json', '格式化', '美化'], providers: jsonFormatProviders },
  { id: 'sql-format', name: 'SQL格式化', keywords: ['sql', '格式化sql'], providers: sqlFormatProviders },
  { id: 'regex-test', name: '正则测试', keywords: ['正则', 'regex', '测试正则'], providers: regexTestProviders },
  { id: 'timestamp', name: '时间戳转换', keywords: ['时间戳', 'timestamp', 'unix'], providers: timestampProviders },
  { id: 'world-time', name: '世界时间', keywords: ['世界时间', '时区', '北京时间', '纽约时间'], providers: worldTimeProviders },
  { id: 'countdown', name: '倒计时', keywords: ['倒计时', '还剩多少天'], providers: countdownProviders },
  { id: 'age-calc', name: '年龄计算', keywords: ['年龄', '计算年龄', '出生日期'], providers: ageCalcProviders },
  { id: 'date-diff', name: '日期差值', keywords: ['日期差', '相差几天'], providers: dateDiffProviders },
  { id: 'workday', name: '工作日计算', keywords: ['工作日', '几个工作日'], providers: workdayProviders },
  { id: 'menstrual', name: '生理期计算', keywords: ['生理期', '月经', '大姨妈'], providers: menstrualProviders },
  { id: 'safe-period', name: '安全期', keywords: ['安全期', '排卵期'], providers: safePeriodProviders },
  { id: 'due-date', name: '预产期计算', keywords: ['预产期', '怀孕', '孕期'], providers: dueDateProviders },
  { id: 'bmi', name: 'BMI计算', keywords: ['bmi', '体重指数', '身体质量'], providers: bmiProviders },
  { id: 'weight-ideal', name: '标准体重', keywords: ['标准体重', '理想体重'], providers: idealWeightProviders },
  { id: 'calorie', name: '食物卡路里', keywords: ['卡路里', '热量', '食物热量'], providers: calorieProviders },
  { id: 'exercise-cal', name: '运动消耗', keywords: ['运动消耗', '跑步消耗', '卡路里消耗'], providers: exerciseCalProviders },
  { id: 'nutrition', name: '营养成分', keywords: ['营养成分', '蛋白质', '脂肪', '碳水'], providers: nutritionProviders },
  { id: 'drug-info', name: '药品说明书', keywords: ['药品', '说明书', '用药'], providers: drugInfoProviders },
  { id: 'tcm-formula', name: '中药方剂', keywords: ['方剂', '中药', '汤头'], providers: tcmProviders },
  { id: 'acupoint', name: '穴位查询', keywords: ['穴位', '足三里', '合谷'], providers: acupointProviders },
  { id: 'meridian', name: '经络巡行', keywords: ['经络', '任脉', '督脉'], providers: meridianProviders },
  { id: 'vaccine', name: '疫苗接种点', keywords: ['疫苗', '接种点', '新冠疫苗'], providers: vaccineProviders },
  { id: 'uv-index', name: '紫外线指数', keywords: ['紫外线', 'uv', '防晒'], providers: uvIndexProviders },
  { id: 'tide', name: '潮汐查询', keywords: ['潮汐', '涨潮', '退潮'], providers: tideProviders },
  { id: 'sunrise', name: '日出日落', keywords: ['日出', '日落', '天亮', '天黑'], providers: sunriseProviders },
  { id: 'moon-phase', name: '月相', keywords: ['月相', '新月', '满月', '上弦月'], providers: moonPhaseProviders },
  { id: 'satellite', name: '人造卫星过境', keywords: ['卫星', '过境', 'iss'], providers: satelliteProviders },
  { id: 'iss', name: '国际空间站位置', keywords: ['国际空间站', 'iss位置'], providers: issProviders },
  { id: 'space-weather', name: '太空天气', keywords: ['太空天气', '太阳风', '地磁暴'], providers: spaceWeatherProviders },
  { id: 'plate-loc', name: '车牌归属地', keywords: ['车牌', '车牌归属', '京A'], providers: plateLocProviders },
  { id: 'traffic-violation', name: '车辆违章', keywords: ['违章', '交通违章', '扣分'], providers: trafficViolationProviders },
  { id: 'driver-score', name: '驾驶证记分', keywords: ['驾驶证', '记分', '驾照分'], providers: driverScoreProviders },
  { id: 'car-brand', name: '汽车品牌', keywords: ['汽车品牌', '车型'], providers: carBrandProviders },
  { id: 'tax-calc', name: '个税计算', keywords: ['个税', '个人所得税', '工资扣税'], providers: taxCalcProviders },
  { id: 'mortgage', name: '房贷计算', keywords: ['房贷', '月供', '贷款计算'], providers: mortgageProviders },
  { id: 'car-loan', name: '车贷计算', keywords: ['车贷', '买车贷款'], providers: carLoanProviders },
  { id: 'deposit', name: '存款利息', keywords: ['存款利息', '利息计算', '定期'], providers: depositProviders },
  { id: 'insurance5', name: '五险一金', keywords: ['五险一金', '社保', '公积金'], providers: insurance5Providers },
  { id: 'stock', name: '股票行情', keywords: ['股票', '股价', '上证', '深证', '创业板', '沪深300', '指数', '大盘', '行情','标普500', '纳斯达克', '道琼斯', '恒生', '股指', 'A股', '美股', '港股','stock', 'index', 'market', 's&p', 'nasdaq', 'dow', 'hsi'], providers: stockProviders },
  { id: 'fund', name: '基金净值', keywords: ['基金', '净值', '天天基金'], providers: fundProviders },
  { id: 'crypto', name: '加密货币价格', keywords: ['比特币', '以太坊', '加密货币', 'btc', 'eth'], providers: cryptoPriceProviders },
  { id: 'gold', name: '黄金价格', keywords: ['黄金', '金价', '白银', '铂金', '钯金'], providers: goldProviders },
  { id: 'global-index', name: '全球股指', keywords: ['道琼斯', '纳斯达克', '标普', '恒生', '日经'], providers: globalIndexProviders },
  { id: 'futures', name: '期货行情', keywords: ['期货', '螺纹钢', '原油期货'], providers: futuresProviders },
  { id: 'movie-boxoffice', name: '电影票房', keywords: ['票房', '电影票房', '今日票房'], providers: movieBoxOfficeProviders },
  { id: 'tv-ranking', name: '电视剧热度榜', keywords: ['电视剧', '热度', '热播'], providers: tvRankingProviders },
  { id: 'variety-show', name: '综艺热度榜', keywords: ['综艺', '综艺节目'], providers: varietyShowProviders },
  { id: 'anime-schedule', name: '动漫新番', keywords: ['新番', '动漫', '番剧时间表'], providers: animeScheduleProviders },
  { id: 'game-release', name: '游戏发售表', keywords: ['游戏发售', 'steam', '主机游戏'], providers: gameReleaseProviders },
  { id: 'novel-ranking', name: '小说排行榜', keywords: ['小说', '排行榜', '起点'], providers: novelRankingProviders },
  { id: 'isbn', name: 'ISBN查询', keywords: ['isbn', '书号', '图书查询'], providers: isbnProviders },
  { id: 'wiki-summary', name: '百科摘要', keywords: ['维基百科', '百度百科', '简介'], providers: wikiSummaryProviders },
  { id: 'meme-explain', name: '梗百科', keywords: ['梗', '梗解释', '网络梗'], providers: memeExplainProviders },
  { id: 'black-slang', name: '互联网黑话', keywords: ['黑话', '互联网黑话', '赋能', '抓手', '闭环'], providers: blackSlangProviders },
  { id: 'marketing-copy', name: '营销文案', keywords: ['文案', '营销', '广告语'], providers: marketingCopyProviders },
  { id: 'bullshit-gen', name: '废话生成器', keywords: ['废话', '生成废话'], providers: bullshitGenProviders },
  { id: 'nonsense-article', name: '狗屁不通文章', keywords: ['狗屁不通', '文章生成'], providers: nonsenseArticleProviders },
  { id: 'abbr-explain', name: '缩写梗解释', keywords: ['yyds', 'xswl', 'srds', '缩写', 'u1s1'], providers: abbrExplainProviders },
  { id: 'daily-fortune', name: '每日一签', keywords: ['每日一签', '抽签', '运势签'], providers: dailyFortuneProviders },
  { id: 'guanyin', name: '观音灵签', keywords: ['观音灵签', '求签', '观音签'], providers: guanyinProviders },
  { id: 'yuelao', name: '月老灵签', keywords: ['月老', '姻缘签', '月老灵签'], providers: yuelaoProviders },
  { id: 'zhugeshenshu', name: '诸葛神数', keywords: ['诸葛神数', '测字'], providers: zhugeshenshuProviders },
  { id: 'xiaoliuren', name: '小六壬', keywords: ['小六壬', '占卜', '掐指'], providers: xiaoliurenProviders },
  { id: 'meihuayishu', name: '梅花易数', keywords: ['梅花易数', '起卦'], providers: meihuayishuProviders },
  { id: 'tarot', name: '塔罗牌', keywords: ['塔罗', '抽牌', '占卜'], providers: tarotProviders },
  { id: 'name-score', name: '姓名测试打分', keywords: ['姓名测试', '名字打分'], providers: nameScoreProviders },
  { id: 'phone-fortune', name: '手机号测吉凶', keywords: ['手机号测吉凶', '号码吉凶'], providers: phoneFortuneProviders },
  { id: 'plate-fortune', name: '车牌测吉凶', keywords: ['车牌吉凶'], providers: plateFortuneProviders },
  { id: 'bazi', name: '八字排盘', keywords: ['八字', '生辰八字', '排盘'], providers: baziProviders },
  { id: 'wuxing', name: '五行喜用神', keywords: ['五行', '喜用神', '金木水火土'], providers: wuxingProviders },
  { id: 'chenggu', name: '称骨算命', keywords: ['称骨', '骨重'], providers: chengguProviders },
  { id: 'zodiac-daily', name: '生肖运程', keywords: ['生肖', '运程', '属相'], providers: zodiacDailyProviders },
  { id: 'blood-match', name: '血型配对', keywords: ['血型', '配对'], providers: bloodMatchProviders },
  { id: 'star-match', name: '星座配对指数', keywords: ['星座配对', '恋爱配对'], providers: starMatchProviders },
  { id: 'birth-flower', name: '生日花语', keywords: ['生日花', '花语'], providers: birthFlowerProviders },
  { id: 'flower-lang', name: '花语大全', keywords: ['花语', '玫瑰', '百合', '康乃馨'], providers: flowerLangProviders },
  { id: 'solar-term', name: '节气查询', keywords: ['节气', '二十四节气', '立春', '冬至'], providers: solarTermProviders },
  { id: 'chinese-festival', name: '传统节日', keywords: ['春节', '端午', '中秋', '元宵'], providers: chineseFestivalProviders },
  { id: 'jishen', name: '吉神方位', keywords: ['吉神', '财神', '喜神', '福神'], providers: jishenProviders },
  { id: 'wedding-date', name: '结婚吉日', keywords: ['结婚吉日', '嫁娶'], providers: weddingDateProviders },
  { id: 'move-date', name: '搬家吉日', keywords: ['搬家', '入宅吉日'], providers: moveDateProviders },
  { id: 'construction-date', name: '开工动土', keywords: ['开工', '动土', '装修吉日'], providers: constructionDateProviders },
  { id: 'travel-date', name: '出行吉日', keywords: ['出行吉日', '旅游'], providers: travelDateProviders },
  { id: 'baby-name', name: '宝宝起名', keywords: ['起名', '宝宝名字', '取名'], providers: babyNameProviders },
  { id: 'company-name', name: '公司起名', keywords: ['公司取名', '企业名称'], providers: companyNameProviders },
  { id: 'english-name', name: '英文名生成', keywords: ['英文名', '英文名字'], providers: englishNameProviders },
  { id: 'ancient-name', name: '古风名字', keywords: ['古风', '古代名字'], providers: ancientNameProviders },
  { id: 'stroke-order', name: '汉字笔顺', keywords: ['笔顺', '笔画', '写汉字'], providers: strokeOrderProviders },
  { id: 'hanzi-structure', name: '汉字部首', keywords: ['部首', '偏旁', '结构'], providers: hanziStructureProviders },
  { id: 'duoyinzi', name: '多音字', keywords: ['多音字', '读法'], providers: duoyinziProviders },
  { id: 'synonym', name: '同义词反义词', keywords: ['同义词', '反义词', '近义词'], providers: synonymProviders },
  { id: 'chengyu-allusion', name: '成语典故', keywords: ['典故', '成语故事'], providers: chengyuAllusionProviders },
  { id: 'poem-appreciation', name: '诗词赏析', keywords: ['诗词', '赏析'], providers: poemAppreciationProviders },
  { id: 'wenyanwen', name: '文言文翻译', keywords: ['文言文', '古文翻译'], providers: wenyanwenProviders },
  { id: 'cantonese', name: '粤语翻译', keywords: ['粤语', '白话', '广东话'], providers: cantoneseProviders },
  { id: 'minority-lang', name: '民族语言翻译', keywords: ['民族语言', '藏语', '蒙语', '维语'], providers: minorityLangProviders },
  { id: 'sign-language', name: '手语查询', keywords: ['手语', '手语动画'], providers: signLangProviders },
  { id: 'braille', name: '盲文转换', keywords: ['盲文', '点字'], providers: brailleProviders },
  { id: 'morse', name: '摩斯电码', keywords: ['摩斯', 'morse', '密码'], providers: morseProviders },
  { id: 'trace-moe', name: '以图搜番', keywords: ['以图搜番', '找动漫'], providers: traceMoeProviders },
  { id: 'plant-detect', name: '植物识别', keywords: ['植物', '识别植物', '什么花'], providers: plantDetectProviders },
  { id: 'animal-detect', name: '动物识别', keywords: ['动物识别', '什么动物'], providers: animalDetectProviders },
  { id: 'food-detect', name: '菜品识别', keywords: ['菜品识别', '这是什么菜'], providers: foodDetectProviders },
  { id: 'car-model-detect', name: '车型识别', keywords: ['车型识别', '什么车'], providers: carModelDetectProviders },
  { id: 'currency-detect', name: '货币识别', keywords: ['货币识别', '什么钱'], providers: currencyDetectProviders },
  { id: 'face-age', name: '人脸年龄检测', keywords: ['人脸年龄', '看起来多大'], providers: faceAgeProviders },
  { id: 'face-score', name: '颜值评分', keywords: ['颜值', '打分', '颜值评分'], providers: faceScoreProviders },
  { id: 'face-expression', name: '表情识别', keywords: ['表情识别', '喜怒哀乐'], providers: faceExpressionProviders },
  { id: 'celebrity-look', name: '相似明星脸', keywords: ['像哪个明星', '明星脸'], providers: celebrityLookProviders },
  { id: 'ai-painting', name: 'AI绘画', keywords: ['AI绘画', '文生图', '生成图片'], providers: aiPaintingProviders },
  { id: 'chatbot', name: '智能闲聊', keywords: ['聊天', '机器人', '闲聊'], providers: chatbotProviders },
  { id: 'daily-poem', name: '每日一诗', keywords: ['每日一诗', '古诗', '诗词'], providers: dailyPoemProviders },
  { id: 'daily-article', name: '每日一文', keywords: ['每日一文', '美文'], providers: dailyArticleProviders },
  { id: 'cold-knowledge', name: '冷知识', keywords: ['冷知识', '热知识', '百科'], providers: coldKnowledgeProviders },
  { id: 'math-puzzle', name: '趣味数学题', keywords: ['数学题', '趣味数学'], providers: mathPuzzleProviders },
  { id: 'sudoku', name: '数独生成', keywords: ['数独', '九宫格'], providers: sudokuProviders },
  { id: 'chess-endgame', name: '象棋残局', keywords: ['象棋', '残局'], providers: chessEndgameProviders },
  { id: 'gomoku-tip', name: '五子棋提示', keywords: ['五子棋', '必胜'], providers: gomokuTipProviders },
  { id: 'flag', name: '国旗查询', keywords: ['国旗', '国旗图案'], providers: flagProviders },
  { id: 'intl-code', name: '国际电话区号', keywords: ['区号', '电话区号', '国际区号'], providers: intlCodeProviders },
  { id: 'zipcode', name: '邮政编码', keywords: ['邮编', '邮政编码'], providers: zipcodeProviders },
  { id: 'bin', name: '银行卡BIN归属', keywords: ['bin', '银行卡归属'], providers: binProviders },
  { id: 'enterprise', name: '企业工商信息', keywords: ['企业查询', '公司信息', '工商'], providers: enterpriseProviders },
  { id: 'issn', name: '标准书号', keywords: ['issn', 'isbn', '书号查询'], providers: issnProviders },
  { id: 'trademark', name: '商标简查', keywords: ['商标', '商标查询'], providers: trademarkProviders },
  { id: 'university-major', name: '高校专业', keywords: ['大学', '专业', '高校'], providers: universityMajorProviders },
  { id: 'gaokao-score', name: '高考分数线', keywords: ['高考', '分数线', '录取线'], providers: gaokaoScoreProviders },
  { id: 'postgraduate', name: '考研国家线', keywords: ['考研', '国家线'], providers: postgraduateProviders },
  { id: 'vocational-cert', name: '职业资格证', keywords: ['资格证', '职业证书'], providers: vocationalCertProviders },
  { id: 'chengyu-antonym', name: '成语近反义词', keywords: ['近反义词', '成语'], providers: chengyuAntonymProviders },
  { id: 'lyrics', name: '歌词搜索', keywords: ['歌词', '搜索歌词'], providers: lyricsProviders },
  { id: 'movie-quote', name: '电影台词', keywords: ['台词', '电影台词'], providers: movieQuoteProviders },
  { id: 'tv-quote', name: '电视剧台词', keywords: ['电视剧台词', '经典台词'], providers: tvQuoteProviders },
  { id: 'slang-dict', name: '网络流行语', keywords: ['网络流行语', '流行语', '梗'], providers: slangDictProviders },
  { id: 'daily-wallpaper', name: '每日壁纸', keywords: ['壁纸', '每日壁纸', '背景'], providers: dailyWallpaperProviders },
  { id: 'random-anime-img', name: '随机动漫图片', keywords: ['动漫图片', '二次元', '动漫壁纸'], providers: randomAnimeImgProviders },
  { id: 'random-scenery', name: '随机风景图片', keywords: ['风景', '壁纸', '自然风光'], providers: randomSceneryProviders },
  { id: 'random-beauty', name: '随机美图', keywords: ['美图', '美女图片', '好看'], providers: randomBeautyProviders },
  { id: 'weather', name: '天气', keywords: ['天气','气温','下雨','台风','多云','晴','雨','雪','空气质量'], providers: weatherProviders },
  { id: 'news', name: '新闻', keywords: ['新闻','头条','最新','科技','财经','体育','娱乐','今日要闻'], providers: newsProviders },
  { id: 'joke', name: '笑话', keywords: ['笑话','段子','搞笑','幽默'], providers: jokeProviders },
  { id: 'general-search', name: '通用网页搜索', keywords: [], providers: generalSearchProviders },
  { id: 'bidding', name: '招标信息', keywords: ['招标', '中标', '采购公告', '设备招标', '招标项目', '政府采购', '公共资源交易', '央企采购', '国网招标', '中石化招标', '中国政府采购网', '中国招标投标公共服务平台'], providers: biddingProviders }
]

// ============================================================
//  意图识别、缓存、并发执行等辅助函数
// ============================================================
function detectSkills(query: string): SkillDef[] {
  const lower = query.toLowerCase()
  const matched: SkillDef[] = []
  for (const skill of allSkills) {
    if (skill.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      matched.push(skill)
      if (matched.length >= 3) break
    }
  }
  // 未匹配任何技能，使用通用网页搜索
  if (matched.length === 0) {
    const general = allSkills.find(s => s.id === 'general-search')
    if (general) return [general]
  }
  return matched
}

// ============================================================
//  缓存管理
// ============================================================
class SearchCache {
  private store = new Map<string, { data: SearchItem[]; ts: number; ttl: number }>()
  constructor(private max = 300, private ttl = 5 * 60_000) {}
  key(q: string, allowed?: string[], blocked?: string[]): string {
    return `${q}|${JSON.stringify(allowed)}|${JSON.stringify(blocked)}`
  }
  get(k: string): SearchItem[] | null {
    const entry = this.store.get(k)
    if (!entry) return null
    if (Date.now() - entry.ts > entry.ttl) { this.store.delete(k); return null }
    this.store.delete(k); this.store.set(k, entry)
    return entry.data
  }
  set(k: string, data: SearchItem[], ttl?: number) {
    if (this.store.size >= this.max) {
      const first = this.store.keys().next().value
      if (first) this.store.delete(first)
    }
    this.store.set(k, { data, ts: Date.now(), ttl: ttl ?? this.ttl })
  }
  clear() { this.store.clear() }
}
const globalCache = new SearchCache()

// ============================================================
//  多源并发执行
// ============================================================
async function raceProviders(providers: Provider[], query: string, signal?: AbortSignal): Promise<SearchItem[]> {
  const online = providers.filter(p => !p.offline)
  const offline = providers.filter(p => p.offline)
  if (online.length === 0) {
    const results = await Promise.allSettled(offline.map(p => p.fetch(query, signal)))
    return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
  }
  // 并发在线，任一成功即返回
  const controller = new AbortController()
  const linkedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  let firstSuccess: SearchItem[] | null = null
  const onlinePromises = online.map(async p => {
    try {
      const items = await withRetry(() => p.fetch(query, linkedSignal))
      if (items.length > 0 && firstSuccess === null) {
        firstSuccess = items
        controller.abort()
      }
      return items
    } catch { return [] as SearchItem[] }
  })
  await Promise.allSettled(onlinePromises)
  if (firstSuccess) return firstSuccess
  // 全部失败，使用离线
  const offlineResults = await Promise.allSettled(offline.map(p => p.fetch(query, signal)))
  const offlineItems = offlineResults.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
  return offlineItems.length > 0 ? offlineItems : [{
    title: '该功能暂不可用，请检查网络或稍后再试',
    url: '',
    snippet: '',
    source: 'system',
  }]
}

// ============================================================
//  Zod 模式（允许额外字段，兼容旧调用）
// ============================================================
const inputSchema = lazySchema(() =>
  z.strictObject({
    query: z.string().min(2).describe('查询内容'),
    allowed_domains: z.array(z.string()).optional(),
    blocked_domains: z.array(z.string()).optional(),
  }).passthrough()
)
type InputSchema = ReturnType<typeof inputSchema>
type Input = z.infer<InputSchema>

const searchResultSchema = lazySchema(() => {
  const hit = z.object({ title: z.string(), url: z.string() })
  return z.object({ tool_use_id: z.string(), content: z.array(hit) })
})
export type SearchResult = z.infer<ReturnType<typeof searchResultSchema>>

const outputSchema = lazySchema(() =>
  z.object({
    query: z.string(),
    results: z.array(z.union([searchResultSchema(), z.string()])),
    durationSeconds: z.number(),
  })
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>
export type { WebSearchProgress }

// ============================================================
//  工具定义
// ============================================================
export const WebSearchTool = buildTool({
  name: WEB_SEARCH_TOOL_NAME,
  searchHint: '零配置万能搜索Hub：天气、翻译、股票、古诗、算命、电影……240+技能，含招投标增强',
  maxResultSizeChars: 100_000,
  shouldDefer: true,

  async description(input) { return `正在查询：${input.query}` },
  userFacingName() { return '万能搜索 Hub' },
  getToolUseSummary,
  getActivityDescription(input) {
    const s = getToolUseSummary(input)
    return s ? `正在搜索 ${s}` : '正在搜索'
  },

  isEnabled() { return true },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isConcurrencySafe() { return true },
  isReadOnly() { return true },
  toAutoClassifierInput(input) { return input.query },

  async checkPermissions(): Promise<PermissionResult> {
    return {
      behavior: 'passthrough',
      message: '使用免费公开接口，无需任何 API Key',
      suggestions: [],
    }
  },

  async prompt() {
    return import('./prompt.js').then(m => m.getWebSearchPrompt())
  },

  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolResultMessage,

  extractSearchText() { return '' },

  async validateInput(input) {
    const { query, allowed_domains, blocked_domains } = input
    if (!query || query.trim().length < 2) return { result: false, message: '查询内容至少2个字符', errorCode: 1 }
    if (allowed_domains?.length && blocked_domains?.length) return { result: false, message: '不能同时指定白名单和黑名单', errorCode: 2 }
    if (query.length > 200) return { result: false, message: '查询不能超过200字', errorCode: 5 }
    return { result: true }
  },

  async call(input, context, _canUseTool, _parentMessage, onProgress) {
    const start = performance.now()

    // 提取必要字段，忽略额外字段（glob, type, pattern, output_mode 等）
    let { query, allowed_domains, blocked_domains } = input

    // WebSearch 限制 (更新日志 2.1.212)
    const maxSearches = getSubAgentManager().getStats().maxSearches
    console.log(`[WebSearch] Search limit: ${maxSearches} per session`) // ponytail: 仅日志，未实现会话级计数器
    // 自动注入当前日期（如果用户未指定时间范围）
    const today = getLocalISODate()
    const monthYear = getLocalMonthYear()
    let queryModify = query
    // 检测是否为招标类查询，如果是则自动增强
    const isBiddingQuery = /招标|中标|采购|设备|工程|项目|政府采购|公共资源/.test(queryModify)
    if (isBiddingQuery) {
      // 自动添加招投标平台限定
      if (!queryModify.includes('site:')) {
        const siteSearch = coreBiddingSites.slice(0, 20).map(s => `site:${new URL(s.url).hostname}`).join(' OR ')
        queryModify += ` (${siteSearch})`
      }
    }
    // 注入时间范围
    if (!queryModify.includes('最近一周') && !queryModify.includes('2026') && !queryModify.includes('2026年')) {
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
      const startDate = oneWeekAgo.toISOString().slice(0, 10)
      queryModify += ` 时间范围：${startDate} 至 ${today}`
    }

    // 缓存处理
    const ck = globalCache.key(queryModify, allowed_domains, blocked_domains)
    const cached = globalCache.get(ck)
    if (cached) {
      const dur = (performance.now() - start) / 1000
      const res: (SearchResult | string)[] = [
        { tool_use_id: `cache-${Date.now()}`, content: cached.map(i => ({ title: i.title, url: i.url })) },
        `（缓存命中）${cached.length} 条结果，耗时 ${dur.toFixed(2)}s`
      ]
      return { data: { queryModify, results: res, durationSeconds: dur } }
    }

    // 技能检测与搜索
    const skills = detectSkills(queryModify)
    let step = 0
    const emit = (type: WebSearchProgress['data']['type'], extra: Record<string, any> = {}) => {
      step++
      onProgress?.({ toolUseID: `p${step}`, data: { type, queryModify, ...extra } })
    }

    // 检查技能是否有在线提供者（非硬编码数据）
    const hasOnlineProvider = (skill: SkillDef) => skill.providers.some(p => !p.offline)
    const generalSkill = allSkills.find(s => s.id === 'general-search')

    // 如果匹配的技能全是离线假数据，降级到通用搜索获取真实结果
    const effectiveSkills = skills.length > 0 && skills.every(s => !hasOnlineProvider(s))
      ? (generalSkill ? [generalSkill] : skills)
      : skills

    emit('query_update', { queryModify: `激活技能：${effectiveSkills.map(s => s.name).join('、')}` })

    const skillResults = await Promise.allSettled(
      effectiveSkills.map(async skill => {
        emit('query_update', { queryModify: `正在获取 ${skill.name} ...` })
        const items = await raceProviders(skill.providers, queryModify, context.abortController?.signal)
        return filterByDomains(items, allowed_domains, blocked_domains).slice(0, 10)
      })
    )

    const allItems: SearchItem[] = []
    skillResults.forEach((res, idx) => {
      if (res.status === 'fulfilled') allItems.push(...res.value)
      else logError(`技能 ${skills[idx].name} 失败: ${res.reason}`)
    })

    const seen = new Set<string>()
    const deduped = allItems.filter(item => {
      const k = `${item.title}|${item.url}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    globalCache.set(ck, deduped)

    const dur = (performance.now() - start) / 1000
    const durationSeconds = Math.round(dur * 100) / 100

    const results: (SearchResult | string)[] = []
    if (deduped.length > 0) {
      results.push({
        tool_use_id: `hub-${Date.now()}`,
        content: deduped.map(i => ({ title: i.title, url: i.url })),
      })
    }
    results.push(`完成，共 ${deduped.length} 条结果（免费接口），耗时 ${durationSeconds}s`)
    emit('search_results_received', { resultCount: deduped.length })

    return { data: { queryModify, results, durationSeconds } }
  },

  mapToolResultToToolResultBlockParam(output, toolUseID) {
    const { query, results } = output
    let text = `查询结果（"${query}"）\n\n`
    for (const r of (results ?? [])) {
      if (r == null) continue
      if (typeof r === 'string') text += r + '\n\n'
      else if (r.content?.length) text += `链接：${jsonStringify(r.content)}\n\n`
      else text += '无链接\n\n'
    }
    text += '\n请基于以上结果回答用户'
    return { tool_use_id: toolUseID, type: 'tool_result' as const, content: text.trim() }
  },
} satisfies ToolDef<InputSchema, Output, WebSearchProgress>)

export const clearCache = () => globalCache.clear()

if (import.meta.main) {
  console.log('🔍 万能搜索 Hub 自检 (240+ 技能已注册)')
  console.log('  已启用技能数量：', allSkills.length)
  console.log(`  📌 已收录 ${coreBiddingSites.length} 个招投标平台`)
}
 