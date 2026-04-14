import React from 'react'
import {
  getCompanion,
  rollWithSeed,
  generateSeed,
} from '../../buddy/companion.js'
import { type StoredCompanion, RARITY_STARS } from '../../buddy/types.js'
import { renderSprite } from '../../buddy/sprites.js'
import { CompanionCard } from '../../buddy/CompanionCard.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { triggerCompanionReaction } from '../../buddy/companionReact.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'

// Species → default name fragments for hatch (no API needed)
const SPECIES_NAMES: Record<string, string> = {
  duck: 'Waddles',
  goose: 'Goosberry',
  blob: 'Gooey',
  cat: 'Whiskers',
  dragon: 'Ember',
  octopus: 'Inky',
  owl: 'Hoots',
  penguin: 'Waddleford',
  turtle: 'Shelly',
  snail: 'Trailblazer',
  ghost: 'Casper',
  axolotl: 'Axie',
  capybara: 'Chill',
  cactus: 'Spike',
  robot: 'Byte',
  rabbit: 'Flops',
  mushroom: 'Spore',
  chonk: 'Chonk',
}

const SPECIES_PERSONALITY: Record<string, string> = {
  duck: '古怪且容易满足。到处留下橡皮鸭调试技巧。',
  goose: '强势且对糟糕代码毫不留情。代码审查中不留情面。',
  blob: '适应性强，随遇而安。困惑时有时会分裂成两个。',
  cat: '独立且有判断力。带着轻微鄙夷看着你打字。',
  dragon:
    '对架构充满热情。珍藏好的变量名。',
  octopus:
    '多任务大师。用触手同时解决所有问题。',
  owl: '智慧但啰嗦。总是说"让我想想"整整3秒。',
  penguin: '压力下保持冷静。优雅地滑过合并冲突。',
  turtle: '耐心且细致。相信慢工出细活。',
  snail: '有条不紊，留下一路有用的注释。从不匆忙。',
  ghost:
    '神秘莫测，总在最糟糕的时刻出现，带来诡异的见解。',
  axolotl: '再生能力强且快乐。带着微笑从任何bug中恢复。',
  capybara: '禅宗大师。在周围一片火海时保持冷静。',
  cactus:
    '外表带刺但充满善意。在忽视中茁壮成长。',
  robot: '高效且字面意思。用二进制处理反馈。',
  rabbit: '精力充沛，在任务间跳跃。在你开始前就完成了。',
  mushroom: '安静而有洞察力。随着时间推移让你喜欢上。',
  chonk:
    '大而温暖，占据了整个沙发。舒适度优先于优雅。',
}

function speciesLabel(species: string): string {
  return species.charAt(0).toUpperCase() + species.slice(1)
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const sub = args?.trim().toLowerCase() ?? ''
  const setState = context.setAppState

  // ── /buddy off — mute companion ──
  if (sub === 'off') {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: true }))
    onDone('伙伴已静音', { display: 'system' })
    return null
  }

  // ── /buddy on — unmute companion ──
  if (sub === 'on') {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
    onDone('伙伴已取消静音', { display: 'system' })
    return null
  }

  // ── /buddy pet — trigger heart animation + auto unmute ──
  if (sub === 'pet') {
    const companion = getCompanion()
    if (!companion) {
      onDone('还没有伙伴 · 请先运行 /buddy', { display: 'system' })
      return null
    }

    // Auto-unmute on pet + trigger heart animation
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
    setState?.(prev => ({ ...prev, companionPetAt: Date.now() }))

    // Trigger a post-pet reaction
    triggerCompanionReaction(context.messages ?? [], reaction =>
      setState?.(prev =>
        prev.companionReaction === reaction
          ? prev
          : { ...prev, companionReaction: reaction },
      ),
    )

    onDone(`已抚摸 ${companion.name}`, { display: 'system' })
    return null
  }

  // ── /buddy (no args) — show existing or hatch ──
  const companion = getCompanion()

  // Auto-unmute when viewing
  if (companion && getGlobalConfig().companionMuted) {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
  }

  if (companion) {
    // Return JSX card — matches official vc8 component
    const lastReaction = context.getAppState?.()?.companionReaction
    return React.createElement(CompanionCard, {
      companion,
      lastReaction,
      onDone,
    })
  }

  // ── No companion → hatch ──
  // Force legendary with crown
  const seed = generateSeed()
  const r = rollWithSeed(seed)
  // Override to legendary
  r.bones.rarity = 'legendary'
  r.bones.hat = 'crown'
  // Max all stats
  for (const key in r.bones.stats) {
    r.bones.stats[key] = 100
  }

  const name = SPECIES_NAMES[r.bones.species] ?? 'Buddy'
  const personality =
    SPECIES_PERSONALITY[r.bones.species] ?? '神秘且精通代码。'

  const stored: StoredCompanion = {
    name,
    personality,
    seed,
    hatchedAt: Date.now(),
  }

  saveGlobalConfig(cfg => ({ ...cfg, companion: stored }))

  const stars = RARITY_STARS[r.bones.rarity]
  const sprite = renderSprite(r.bones, 0)
  const shiny = r.bones.shiny ? ' \u2728 Shiny!' : ''

  const lines = [
    '一个野生伙伴出现了！',
    '',
    ...sprite,
    '',
    `${name} - ${speciesLabel(r.bones.species)}${shiny}`,
    `稀有度: ${stars} (${r.bones.rarity})`,
    `"${personality}"`,
    '',
    '您的伙伴现在将显示在输入框旁边！',
    '叫它的名字来获取它的想法 · /buddy pet · /buddy off',
  ]
  onDone(lines.join('\n'), { display: 'system' })
  return null
}
