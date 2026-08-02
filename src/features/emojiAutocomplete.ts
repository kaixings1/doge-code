/**
 * Emoji 短代码自动补全 — 输入 :heart: 自动插入 ❤️
 *
 * 来源: Claude Code 2.1.217
 * 在提示输入框中输入 :shortcode: 自动转换为对应 emoji
 * 设置: emojiCompletionEnabled (boolean)
 */

export interface EmojiConfig {
  enabled: boolean
  /** 是否仅在输入 : 时显示建议 */
  showSuggestions: boolean
  /** 最大建议数量 */
  maxSuggestions: number
}

const DEFAULT_CONFIG: EmojiConfig = {
  enabled: true,
  showSuggestions: true,
  maxSuggestions: 10,
}

/**
 * 常用 emoji 短代码映射表
 */
export const EMOJI_MAP: Record<string, string> = {
  // 表情
  ':heart:': '❤️',
  ':smile:': '😊',
  ':laugh:': '😂',
  ':wink:': '😉',
  ':cry:': '😢',
  ':angry:': '😠',
  ':fire:': '🔥',
  ':star:': '⭐',
  ':thumbsup:': '👍',
  ':thumbsdown:': '👎',
  ':ok:': '👌',
  ':wave:': '👋',
  ':clap:': '👏',
  ':pray:': '🙏',
  ':eyes:': '👀',
  ':thinking:': '🤔',
  ':sunglasses:': '😎',
  ':rofl:': '🤣',
  ':joy:': '😂',
  ':sob:': '😭',
  ':smirk:': '😏',
  ':neutral:': '😐',
  ':blush:': '😊',
  ':grinning:': '😀',
  ':heart_eyes:': '😍',
  ':kissing:': '😗',
  ':sleeping:': '😴',
  ':confused:': '😕',
  ':worried:': '😟',
  ':rage:': '😡',
  ':astonished:': '😲',
  ':cold_sweat:': '😰',
  ':scream:': '😱',
  ':pensive:': '😔',
  ':smile_cat:': '😸',
  ':heart_cat:': '😻',
  ':robot:': '🤖',
  ':ghost:': '👻',
  ':skull:': '💀',
  ':poop:': '💩',
  ':alien:': '👽',
  ':angel:': '😇',
  ':imp:': '👿',
  ':japanese_goblin:': '👺',
  ':japanese_ogre:': '👹',
  ':clown:': '🤡',
  ':baby:': '👶',
  ':boy:': '👦',
  ':girl:': '👧',
  ':man:': '👨',
  ':woman:': '👩',
  ':old_man:': '👴',
  ':old_woman:': '👵',
  // 手势
  ':+1:': '👍',
  ':-1:': '👎',
  ':raised_hand:': '✋',
  ':v:': '✌️',
  ':metal:': '🤘',
  ':fist:': '✊',
  ':muscle:': '💪',
  ':point_up:': '☝️',
  ':point_down:': '👇',
  ':point_left:': '👈',
  ':point_right:': '👉',
  ':open_hands:': '👐',
  // 自然
  ':sun:': '☀️',
  ':moon:': '🌙',
  ':cloud:': '☁️',
  ':rainbow:': '🌈',
  ':snowflake:': '❄️',
  ':zap:': '⚡',
  ':ocean:': '🌊',
  ':mountain:': '⛰️',
  ':tree:': '🌳',
  ':flower:': '🌸',
  ':rose:': '🌹',
  ':tulip:': '🌷',
  ':cactus:': '🌵',
  ':palm_tree:': '🌴',
  ':herb:': '🌿',
  ':four_leaf_clover:': '🍀',
  ':maple_leaf:': '🍁',
  ':fallen_leaf:': '🍂',
  // 食物
  ':apple:': '🍎',
  ':banana:': '🍌',
  ':grapes:': '🍇',
  ':watermelon:': '🍉',
  ':strawberry:': '🍓',
  ':cherry:': '🍒',
  ':peach:': '🍑',
  ':lemon:': '🍋',
  ':pineapple:': '🍍',
  ':avocado:': '🥑',
  ':tomato:': '🍅',
  ':corn:': '🌽',
  ':bread:': '🍞',
  ':cheese:': '🧀',
  ':meat:': '🥩',
  ':pizza:': '🍕',
  ':hamburger:': '🍔',
  ':fries:': '🍟',
  ':hotdog:': '🌭',
  ':taco:': '🌮',
  ':sushi:': '🍣',
  ':cake:': '🎂',
  ':coffee:': '☕',
  ':tea:': '🍵',
  ':beer:': '🍺',
  ':wine:': '🍷',
  // 物品
  ':computer:': '💻',
  ':phone:': '📱',
  ':email:': '📧',
  ':camera:': '📷',
  ':video:': '📹',
  ':tv:': '📺',
  ':radio:': '📻',
  ':book:': '📚',
  ':pencil:': '📝',
  ':memo:': '📝',
  ':bulb:': '💡',
  ':lock:': '🔒',
  ':key:': '🔑',
  ':hammer:': '🔨',
  ':wrench:': '🔧',
  ':gear:': '⚙️',
  ':mag:': '🔍',
  ':bell:': '🔔',
  ':link:': '🔗',
  ':paperclip:': '📎',
  ':scissors:': '✂️',
  ':pencil2:': '✏️',
  ':paintbrush:': '🖌️',
  ':crayon:': '🖍️',
  ':file_folder:': '📁',
  ':file_cabinet:': '🗄️',
  ':calendar:': '📅',
  ':chart:': '📊',
  ':bar_chart:': '📊',
  ':chart_with_upwards_trend:': '📈',
  ':chart_with_downwards_trend:': '📉',
  // 符号
  ':check:': '✅',
  ':x:': '❌',
  ':warning:': '⚠️',
  ':question:': '❓',
  ':exclamation:': '❗',
  ':heavy_check_mark:': '✅',
  ':heavy_plus_sign:': '➕',
  ':heavy_minus_sign:': '➖',
  ':heavy_multiplication_x:': '✖️',
  ':heavy_division_sign:': '➗',
  ':arrow_up:': '⬆️',
  ':arrow_down:': '⬇️',
  ':arrow_left:': '⅀',
  ':arrow_right:': '➡️',
  ':arrow_up_down:': '↕️',
  ':left_right_arrow:': '↔️',
  ':arrows_counterclockwise:': '🔄',
  ':hourglass:': '⌛',
  ':watch:': '⌚',
  ':alarm_clock:': '⏰',
  ':stopwatch:': '⏱️',
  ':timer:': '⏲️',
  // 旗帜
  ':flag_cn:': '🇨🇳',
  ':flag_us:': '🇺🇸',
  ':flag_gb:': '🇬🇧',
  ':flag_jp:': '🇯🇵',
  ':flag_kr:': '🇰🇷',
  ':flag_de:': '🇩🇪',
  ':flag_fr:': '🇫🇷',
  ':flag_ru:': '🇷🇺',
  ':flag_au:': '🇦🇺',
  ':flag_ca:': '🇨🇦',
  ':flag_br:': '🇧🇷',
  ':flag_in:': '🇮🇳',
  ':flag_it:': '🇮🇹',
  ':flag_es:': '🇪🇸',
  // 代码相关
  ':bug:': '🐛',
  ':sparkles:': '✨',
  ':zap:': '⚡',
  ':boom:': '💥',
  ':tada:': '🎉',
  ':100:': '💯',
  ':rocket:': '🚀',
  ':ship:': '🚢',
  ':car:': '🚗',
  ':taxi:': '🚕',
  ':bus:': '🚌',
  ':train:': '🚂',
  ':airplane:': '✈️',
  ':helicopter:': '🚁',
  ':bike:': '🚲',
  // 天气
  ':sunny:': '☀️',
  ':cloud:': '☁️',
  ':rain:': '🌧️',
  ':snow:': '🌨️',
  ':thunder:': '⛈️',
  ':fog:': '🌫️',
  ':wind:': '💨',
  ':rainbow:': '🌈',
  ':star2:': '🌟',
  ':dizzy:': '💫',
  ':comet:': '☄️',
}

export class EmojiAutocompleter {
  private config: EmojiConfig

  constructor(config: Partial<EmojiConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 获取匹配的 emoji 建议
   */
  getSuggestions(query: string): Array<{ shortcode: string; emoji: string }> {
    if (!this.config.enabled || !query.startsWith(':')) return []

    const lowerQuery = query.toLowerCase()
    const results: Array<{ shortcode: string; emoji: string }> = []

    for (const [shortcode, emoji] of Object.entries(EMOJI_MAP)) {
      if (shortcode.toLowerCase().startsWith(lowerQuery)) {
        results.push({ shortcode, emoji })
      }
      if (results.length >= this.config.maxSuggestions) break
    }

    return results
  }

  /**
   * 将文本中的 :shortcode: 替换为 emoji
   */
  replaceShortcodes(text: string): string {
    if (!this.config.enabled) return text
    let result = text
    for (const [shortcode, emoji] of Object.entries(EMOJI_MAP)) {
      result = result.split(shortcode).join(emoji)
    }
    return result
  }

  /**
   * 检查输入是否正在输入 emoji 短代码
   */
  isTypingShortcode(input: string): boolean {
    if (!this.config.enabled) return false
    // 检查是否正在输入 :xxx: 格式
    const lastColon = input.lastIndexOf(':')
    if (lastColon === -1) return false
    const afterColon = input.slice(lastColon + 1)
    // 如果冒号后面有字母但没有结束冒号，说明正在输入
    return afterColon.length > 0 && !afterColon.includes(':')
  }

  /**
   * 配置更新
   */
  setConfig(config: Partial<EmojiConfig>): void {
    this.config = { ...this.config, ...config }
  }

  getConfig(): EmojiConfig {
    return { ...this.config }
  }
}

// 全局单例
let globalAutocompleter: EmojiAutocompleter | null = null

export function getEmojiAutocompleter(): EmojiAutocompleter {
  if (!globalAutocompleter) {
    globalAutocompleter = new EmojiAutocompleter()
  }
  return globalAutocompleter
}
