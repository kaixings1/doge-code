import { describe, it, expect } from 'vitest'
import {
  isVisionCapableModel,
  resolveVisionModel,
  hasImagesInMessages,
} from '../../utils/model/visionModelRouter.js'

describe('isVisionCapableModel', () => {
  it('Claude 模型支持图片', () => {
    expect(isVisionCapableModel('claude-sonnet-4-6')).toBe(true)
    expect(isVisionCapableModel('claude-opus-4-6')).toBe(true)
    expect(isVisionCapableModel('claude-haiku-4-5')).toBe(true)
  })

  it('GPT/Gemini 模型支持图片', () => {
    expect(isVisionCapableModel('gpt-5.6-sol')).toBe(true)
    expect(isVisionCapableModel('gemini-3.5-flash')).toBe(true)
  })

  it('DeepSeek 模型不支持图片', () => {
    expect(isVisionCapableModel('deepseek-v4-pro')).toBe(false)
    expect(isVisionCapableModel('deepseek-v4-flash')).toBe(false)
  })

  it('Qwen 非视觉版本不支持图片', () => {
    expect(isVisionCapableModel('qwen-turbo')).toBe(false)
    expect(isVisionCapableModel('qwen3.7-max')).toBe(false)
  })

  it('Ollama 本地模型不支持图片', () => {
    expect(isVisionCapableModel('ollama/qwen2')).toBe(false)
  })

  it('未知模型默认视为支持（避免误路由）', () => {
    expect(isVisionCapableModel('my-custom-model-v1')).toBe(true)
  })
})

describe('resolveVisionModel', () => {
  it('当前模型支持图片时返回 null（无需路由）', () => {
    expect(resolveVisionModel('claude-sonnet-4-6')).toBeNull()
    expect(resolveVisionModel('gpt-5.6-sol')).toBeNull()
  })

  it('DeepSeek 不支持图片时路由到同 provider 视觉模型', () => {
    const routed = resolveVisionModel('deepseek-v4-flash')
    expect(routed).not.toBeNull()
    expect(isVisionCapableModel(routed!)).toBe(true)
  })

  it('路由目标是字符串且不同于当前模型', () => {
    const current = 'deepseek-v4-pro'
    const routed = resolveVisionModel(current)
    expect(routed).not.toBeNull()
    expect(routed).not.toBe(current)
  })
})

describe('hasImagesInMessages', () => {
  it('识别包装格式 {type:user, message:{content}} 中的图片块', () => {
    const messages = [
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'hi' },
            { type: 'image', source: { type: 'base64', data: 'abc' } },
          ],
        },
      },
    ]
    expect(hasImagesInMessages(messages)).toBe(true)
  })

  it('识别裸格式 {role, content} 中的图片块', () => {
    const messages = [
      { role: 'user', content: [{ type: 'image', source: { type: 'base64', data: 'xyz' } }] },
    ]
    expect(hasImagesInMessages(messages)).toBe(true)
  })

  it('识别内联 data URL 图片', () => {
    const messages = [
      { role: 'user', content: '看这张图 data:image/png;base64,AAAA' },
    ]
    expect(hasImagesInMessages(messages)).toBe(true)
  })

  it('纯文本消息返回 false', () => {
    const messages = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '收到' },
    ]
    expect(hasImagesInMessages(messages)).toBe(false)
  })

  it('空数组返回 false', () => {
    expect(hasImagesInMessages([])).toBe(false)
  })
})
