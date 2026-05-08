export const MODEL_ALIASES = [
  'sonnet',
  'opus',
  'haiku',
  'best',
  'sonnet[1m]',
  'opus[1m]',
  'opusplan',
] as const
export type ModelAlias = (typeof MODEL_ALIASES)[number]

export function isModelAlias(modelInput: string): modelInput is ModelAlias {
  return MODEL_ALIASES.includes(modelInput as ModelAlias)
}

/**
 * 模型族系的裸别名，在 availableModels 允许列表中作为通配符使用。
 * 当 "opus" 位于允许列表中时，任何 opus 模型都被允许（opus 4.5、4.6 等）。
 * 当允许列表中是具体的模型 ID 时，仅该确切版本被允许。
 */
export const MODEL_FAMILY_ALIASES = ['sonnet', 'opus', 'haiku'] as const

export function isModelFamilyAlias(model: string): boolean {
  return (MODEL_FAMILY_ALIASES as readonly string[]).includes(model)
}