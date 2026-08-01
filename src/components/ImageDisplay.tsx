/**
 * ImageDisplay.tsx — 终端 inline 图片显示组件
 *
 * 支持协议：
 *   - iTerm2: OSC 9;2 / OSC 1337 (ESC ] 1337 ; File=inline=1: <base64> BEL)
 *   - Kitty: Graphics Protocol (ESC _G ... ESC \)
 *   - tmux: DCS passthrough wrapper
 */

import { useEffect } from 'react'
import { renderImage, supportsInlineImages } from '../ink/termio/osc.js'

// ============================================================================
// Types
// ============================================================================

export interface ImageDisplayProps {
  /** Base64 编码的图片数据（不含 data: 前缀） */
  base64: string
  /** MIME 类型，如 image/png, image/jpeg */
  mediaType?: string
  /** 是否显示图片 */
  visible?: boolean
  /** 隐藏图片时的替代文字 */
  altText?: string
  /** 是否支持 inline 图片 */
  forceSupport?: boolean
}

// ============================================================================
// ImageDisplay 组件
// ============================================================================

export function ImageDisplay({
  base64,
  mediaType = 'image/png',
  visible = true,
  altText = '[图片已隐藏]',
  forceSupport = false,
}: ImageDisplayProps): JSX.Element {
  const canRender = forceSupport || supportsInlineImages()

  if (!visible || !canRender || !base64) {
    return <>{altText ? `[图片: ${altText}]` : ''}</>
  }

  // 输出 inline image escape sequence
  const imageSequence = renderImage(base64)

  // 使用特殊标记包裹，让终端渲染层处理
  // 直接输出转义序列到终端
  return <ImageRenderer sequence={imageSequence} mediaType={mediaType} />
}

// ============================================================================
// ImageRenderer — 直接输出转义序列到 stdout
// ============================================================================

function ImageRenderer({
  sequence,
  mediaType,
}: {
  sequence: string
  mediaType: string
}): JSX.Element {
  // 在挂载时直接写入 stdout，返回一个零宽度的占位元素
  return <ImageWriter sequence={sequence} />
}

function ImageWriter({ sequence }: { sequence: string }): JSX.Element {
  // 挂载时写一次转义序列到 process.stdout。
  // 注意：这里不依赖 ink 的 useStdout —— ink/reconciler 含 top-level await，
  // 会被 bun --compile 可执行文件打包判为非法 require 上下文，导致构建失败。
  useEffect(() => {
    const stdout = process.stdout
    if (stdout?.write) {
      try {
        stdout.write(sequence)
      } catch {
        // 静默失败
      }
    }
  }, [sequence])

  return null
}

// ============================================================================
// 便捷函数：将截图转换为 inline image
// ============================================================================

/**
 * 将 base64 数据包装为 terminal inline image
 * 返回一个可以直接显示在 Ink 中的 React 元素
 */
export function createInlineImage(base64: string, mediaType = 'image/png'): JSX.Element {
  return <ImageDisplay base64={base64} mediaType={mediaType} visible={true} />
}

/**
 * 检查当前终端是否支持 inline 图片
 */
export function canDisplayImages(): boolean {
  return supportsInlineImages()
}
