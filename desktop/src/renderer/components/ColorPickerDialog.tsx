/**
 * ColorPickerDialog — 颜色选择器弹窗
 *
 * 在 Monaco 编辑器悬停颜色值时显示：
 * - 色相预览块
 * - hex / rgb / hsl 输入框
 * - 实时预览色块
 */

import React, { useMemo, useState } from 'react'
import type { ThemeColors } from '../theme.js'
import type { SelectedColor } from '../hooks/useColorPicker.js'

export function ColorPickerDialog({
  color,
  theme,
  onChange,
  onClose,
}: {
  color: SelectedColor
  theme: ThemeColors
  onChange?: (color: SelectedColor) => void
  onClose?: () => void
}): JSX.Element {
  const c = theme
  const [inputValue, setInputValue] = useState(color.displayValue)

  const previewStyle = useMemo(() => {
    const bg = color.value
    return {
      background: bg,
      boxShadow: `0 0 0 1px ${c.border}, 0 4px 12px rgba(0,0,0,0.35)`,
    } as React.CSSProperties
  }, [color.value, c.border])

  const handleInputChange = (value: string) => {
    setInputValue(value)
    if (!onChange) return
    const trimmed = value.trim()
    const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)
    const isRgb = /^rgba?\s*\(/i.test(trimmed)
    const isHsl = /^hsla?\s*\(/i.test(trimmed)

    let type: SelectedColor['type'] = 'hex'
    if (isRgb) type = 'rgb'
    else if (isHsl) type = 'hsl'
    else if (isHex) type = 'hex'

    onChange({
      value: trimmed,
      displayValue: trimmed,
      type,
      startOffset: color.startOffset,
      endOffset: color.endOffset,
    })
  }

  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 9999,
        background: c.bgPanel,
        border: `1px solid ${c.border}`,
        borderRadius: '8px',
        padding: '10px',
        width: '240px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        color: c.text,
        fontSize: '11px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '11px' }}>🎨 颜色选择器</span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: `1px solid ${c.border}`,
            color: c.textFaint,
            cursor: 'pointer',
            fontSize: '10px',
            borderRadius: '3px',
            padding: '1px 6px',
          }}
        >
          ✕
        </button>
      </div>

      {/* 预览色块 + 色相条 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '6px',
            ...previewStyle,
          }}
        />
        <div
          style={{
            flex: 1,
            height: '12px',
            borderRadius: '6px',
            background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
            border: `1px solid ${c.border}`,
          }}
        />
      </div>

      {/* hex 输入框 */}
      <div style={{ marginBottom: '6px' }}>
        <div style={{ color: c.textFaint, fontSize: '9px', marginBottom: '2px', textTransform: 'uppercase' }}>HEX / RGB / HSL</div>
        <input
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          spellCheck={false}
          style={{
            width: '100%',
            padding: '4px 6px',
            background: c.inputBg,
            border: `1px solid ${c.border}`,
            borderRadius: '3px',
            color: c.text,
            fontSize: '11px',
            fontFamily: 'monospace',
            outline: 'none',
          }}
        />
      </div>

      {/* 原始值 */}
      <div style={{ color: c.textFaint, fontSize: '9px', wordBreak: 'break-all' }}>
        {color.value}
      </div>
    </div>
  )
}
