/**
 * EditorSettingsPanel — 编辑器设置面板组件
 *
 * 提供编辑器设置 UI：
 * - 字体大小滑块（11-18px）
 * - Tab 大小选择（2/4 空格）
 * - 自动保存开关
 * - 自动格式化开关
 * - 格式化工具选择（Prettier/ESLint/Biome/dprint）
 * - MiniMap 开关
 * - 代码折叠开关
 * - 括号高亮开关
 */

import React, { useCallback } from 'react'
import type { ThemeColors } from '../theme.js'
import type { EditorConfig, FormatterTool } from '../hooks/useEditorConfig.js'

export interface EditorSettingsPanelProps {
  theme: ThemeColors
  config: EditorConfig
  onUpdateConfig: (partial: Partial<EditorConfig>) => void
  onResetConfig: () => void
}

export function EditorSettingsPanel({ theme, config, onUpdateConfig, onResetConfig }: EditorSettingsPanelProps): React.JSX.Element {
  const c = theme

  const handleToggle = useCallback((key: keyof EditorConfig) => {
    const current = config[key]
    if (typeof current === 'boolean') {
      onUpdateConfig({ [key]: !current })
    }
  }, [config, onUpdateConfig])

  return (
    <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* 标题 */}
      <div style={{ fontSize: '11px', color: c.textMuted, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>编辑器设置</span>
        <button
          onClick={onResetConfig}
          style={{
            padding: '2px 8px', border: `1px solid ${c.border}`, borderRadius: '3px',
            background: 'transparent', color: c.textFaint, cursor: 'pointer', fontSize: '9px',
          }}
          title="恢复默认设置"
        >重置</button>
      </div>

      {/* 字体大小 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '10px', color: c.textFaint }}>字体大小</span>
          <span style={{ fontSize: '10px', color: c.accent, fontWeight: 600 }}>{config.fontSize}px</span>
        </div>
        <input
          type="range"
          min="11"
          max="18"
          value={config.fontSize}
          onChange={(e) => onUpdateConfig({ fontSize: Number(e.target.value) })}
          style={{ width: '100%', accentColor: c.accent }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: c.textFaint, marginTop: '2px' }}>
          <span>11px</span>
          <span>18px</span>
        </div>
      </div>

      {/* Tab 大小 */}
      <div>
        <div style={{ fontSize: '10px', color: c.textFaint, marginBottom: '4px' }}>Tab 大小</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {([2, 4] as const).map((size) => (
            <button
              key={size}
              onClick={() => onUpdateConfig({ tabSize: size })}
              style={{
                flex: 1, padding: '4px', border: '1px solid',
                borderColor: config.tabSize === size ? c.accent : c.border,
                borderRadius: '3px',
                background: config.tabSize === size ? c.accentDim : 'transparent',
                color: config.tabSize === size ? c.accent : c.textMuted,
                cursor: 'pointer', fontSize: '10px', fontWeight: 600,
              }}
            >
              {size} 空格
            </button>
          ))}
        </div>
      </div>

      {/* 插入空格 vs Tab */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '10px', color: c.textFaint }}>使用空格代替 Tab</span>
        <button
          onClick={() => onUpdateConfig({ insertSpaces: !config.insertSpaces })}
          style={{
            padding: '3px 12px', border: '1px solid',
            borderColor: config.insertSpaces ? c.accent : c.border,
            borderRadius: '3px',
            background: config.insertSpaces ? c.accentDim : 'transparent',
            color: config.insertSpaces ? c.accent : c.textMuted,
            cursor: 'pointer', fontSize: '10px', fontWeight: 600,
          }}
        >{config.insertSpaces ? '✓ 空格' : 'Tab'}</button>
      </div>

      {/* 分隔线 */}
      <div style={{ borderTop: `1px solid ${c.borderSubtle}` }} />

      {/* 自动保存 */}
      <SettingToggle
        label="自动保存"
        value={config.autoSave}
        onToggle={() => handleToggle('autoSave')}
        theme={c}
      />

      {/* 自动格式化 */}
      <SettingToggle
        label="保存时自动格式化"
        value={config.autoFormat}
        onToggle={() => handleToggle('autoFormat')}
        theme={c}
      />

      {/* 格式化工具选择 */}
      <div>
        <div style={{ fontSize: '10px', color: c.textFaint, marginBottom: '4px' }}>格式化工具</div>
        <select
          value={config.formatterTool}
          onChange={(e) => onUpdateConfig({ formatterTool: e.target.value as FormatterTool })}
          style={{
            width: '100%', padding: '4px 6px',
            backgroundColor: c.inputBg, border: `1px solid ${c.border}`,
            borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none',
          }}
        >
          <option value="prettier">Prettier</option>
          <option value="eslint">ESLint</option>
          <option value="biome">Biome</option>
          <option value="dprint">dprint</option>
        </select>
      </div>

      {/* 分隔线 */}
      <div style={{ borderTop: `1px solid ${c.borderSubtle}` }} />

      {/* MiniMap */}
      <SettingToggle
        label="迷你地图 (MiniMap)"
        value={config.minimap}
        onToggle={() => handleToggle('minimap')}
        theme={c}
      />

      {/* 代码折叠 */}
      <SettingToggle
        label="代码折叠"
        value={config.codeFolding}
        onToggle={() => handleToggle('codeFolding')}
        theme={c}
      />

      {/* 括号高亮 */}
      <SettingToggle
        label="括号高亮"
        value={config.bracketHighlight}
        onToggle={() => handleToggle('bracketHighlight')}
        theme={c}
      />

      {/* 行号 */}
      <SettingToggle
        label="行号显示"
        value={config.lineNumbers}
        onToggle={() => handleToggle('lineNumbers')}
        theme={c}
      />

      {/* 自动换行 */}
      <SettingToggle
        label="自动换行"
        value={config.wordWrap !== 'off'}
        onToggle={() => onUpdateConfig({ wordWrap: config.wordWrap === 'off' ? 'on' : 'off' })}
        theme={c}
      />

      {/* 滚动最后一行后 */}
      <SettingToggle
        label="滚动超出最后一行"
        value={config.scrollBeyondLastLine}
        onToggle={() => handleToggle('scrollBeyondLastLine')}
        theme={c}
      />

      {/* 显示空白字符 */}
      <SettingToggle
        label="显示空白字符"
        value={config.renderWhitespace}
        onToggle={() => handleToggle('renderWhitespace')}
        theme={c}
      />
    </div>
  )
}

// ─── 子组件 ───

interface SettingToggleProps {
  label: string
  value: boolean
  onToggle: () => void
  theme: ThemeColors
}

function SettingToggle({ label, value, onToggle, theme }: SettingToggleProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '10px', color: theme.textFaint }}>{label}</span>
      <button
        onClick={onToggle}
        style={{
          padding: '3px 12px', border: '1px solid',
          borderColor: value ? theme.accent : theme.border,
          borderRadius: '3px',
          background: value ? theme.accentDim : 'transparent',
          color: value ? theme.accent : theme.textMuted,
          cursor: 'pointer', fontSize: '10px', fontWeight: 600,
        }}
      >{value ? '✓ 开启' : '关闭'}</button>
    </div>
  )
}
