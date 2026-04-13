import type { LocalCommandCall } from '../../types/command.js'
import { saveGlobalConfig } from '../../utils/config.js'
import { readCustomApiStorage, writeCustomApiStorage } from '../../utils/customApiStorage.js'

export const call: LocalCommandCall = async (args, _context) => {
  const nextModel = args.trim()
  if (!nextModel) {
    return {
      type: 'text',
      value: '用法: /add-model <模型名称>',
    }
  }

  saveGlobalConfig(current => ({
    ...current,
    customApiEndpoint: {
      ...current.customApiEndpoint,
      model: nextModel,
      savedModels: [...new Set([...(current.customApiEndpoint?.savedModels ?? []), nextModel])],
    },
  }))
  const secureStored = readCustomApiStorage()
  writeCustomApiStorage({
    ...secureStored,
    model: nextModel,
    savedModels: [...new Set([...(secureStored.savedModels ?? []), nextModel])]
  })

  process.env.ANTHROPIC_MODEL = nextModel

  return {
    type: 'text',
    value: `已添加自定义模型: ${nextModel}`,
  }
}
