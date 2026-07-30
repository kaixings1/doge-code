/**
 * 主题定义和样式生成
 */

import React, { type CSSProperties } from 'react'

export type ThemeName = 'dark' | 'light'

export interface ThemeColors {
  bg: string; bgAlt: string; bgPanel: string; surface: string; border: string; borderSubtle: string;
  text: string; textMuted: string; textFaint: string;
  inputBg: string; userBubble: string; assistantBubble: string;
  accent: string; accentDim: string; errorBg: string; errorBorder: string; errorText: string;
  toolBg: string; toolBorder: string; statusBorder: string;
  codeBg: string; selectionBg: string; hoverBg: string;
}

export const THEMES: Record<ThemeName, ThemeColors> = {
  dark: {
    bg: '#000000', bgAlt: '#0A0A0A', bgPanel: '#0F0F0F', surface: '#1A1A1A', border: '#262626', borderSubtle: '#1A1A1A',
    text: '#F5F5F5', textMuted: '#888888', textFaint: '#555555',
    inputBg: '#0F0F0F', userBubble: '#1A3A5C', assistantBubble: '#0F0F0F',
    accent: '#4ECB71', accentDim: 'rgba(78,203,113,0.15)', errorBg: '#3A1A1A', errorBorder: '#5C2A2A', errorText: '#FF6B6B',
    toolBg: '#1A1A2E', toolBorder: '#2A2A4A', statusBorder: '#1A1A1A',
    codeBg: '#0A0A0A', selectionBg: '#264F78', hoverBg: '#2A2A2A',
  },
  light: {
    bg: '#FFFFFF', bgAlt: '#F5F5F5', bgPanel: '#FAFAFA', surface: '#FFFFFF', border: '#E0E0E0', borderSubtle: '#EEEEEE',
    text: '#1A1A1A', textMuted: '#666666', textFaint: '#999999',
    inputBg: '#FFFFFF', userBubble: '#0066CC', assistantBubble: '#F0F0F0',
    accent: '#0066CC', accentDim: 'rgba(0,102,204,0.1)', errorBg: '#FFF0F0', errorBorder: '#FFCCCC', errorText: '#CC0000',
    toolBg: '#F5F8FF', toolBorder: '#D0E0FF', statusBorder: '#E0E0E0',
    codeBg: '#F5F5F5', selectionBg: '#ADD6FF', hoverBg: '#E8E8E8',
  },
}

export interface ThemeCtx {
  name: ThemeName
  colors: ThemeColors
  styles: Record<string, CSSProperties>
}

export const ThemeContext = React.createContext<ThemeCtx>({ name: 'dark', colors: THEMES.dark, styles: getStyles('dark') })

export function getStyles(theme: ThemeName, fontSize?: number): Record<string, CSSProperties> {
  const c = THEMES[theme]
  const baseFs = fontSize || 13
  return {
    container: { display: 'flex', height: '100vh', backgroundColor: c.bg, color: c.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: `${baseFs}px` },
    sidebar: { width: 260, minWidth: 260, backgroundColor: c.bgAlt, borderRight: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column' },
    sidebarHeader: { padding: '16px', borderBottom: `1px solid ${c.border}`, fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' },
    modelBadge: { padding: '4px 10px', fontSize: '11px', backgroundColor: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '4px', color: c.textMuted },
    chatView: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: c.bg, minWidth: 0 },
    chatMessages: { flex: 1, overflowY: 'auto', padding: '24px' },
    chatInput: { padding: '16px 24px', borderTop: `1px solid ${c.border}` },
    inputBox: { width: '100%', backgroundColor: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '8px', padding: '10px 14px', color: c.text, fontSize: '13px', outline: 'none' },
    messageBubble: { marginBottom: '16px', maxWidth: '85%', padding: '10px 14px', borderRadius: '8px', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
    userBubble: { backgroundColor: c.userBubble, marginLeft: 'auto', color: '#FFFFFF' },
    assistantBubble: { backgroundColor: c.assistantBubble },
    roleLabel: { fontSize: '11px', color: c.textMuted, marginBottom: '4px' },
    welcomeBlock: { textAlign: 'center' as const, padding: '60px 20px', color: c.textMuted },
    welcomeTitle: { fontSize: '24px', fontWeight: 600, marginBottom: '8px', color: c.text },
    welcomeSubtitle: { fontSize: '13px', color: c.textFaint },
    statusBar: { padding: '6px 16px', fontSize: '11px', color: c.textFaint, borderTop: `1px solid ${c.statusBorder}`, display: 'flex', justifyContent: 'space-between' },
    thinkingIndicator: { color: c.textMuted, fontSize: '12px', fontStyle: 'italic' },
    errorBubble: { backgroundColor: c.errorBg, border: `1px solid ${c.errorBorder}`, color: c.errorText, padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' },
    toolResultBubble: { backgroundColor: c.toolBg, border: `1px solid ${c.toolBorder}`, padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' },
    clearButton: { background: 'none', border: `1px solid ${c.border}`, color: c.textMuted, padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' },
    rightPanel: { width: 280, minWidth: 280, backgroundColor: c.bgAlt, borderLeft: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    panelHeader: { padding: '12px 16px', borderBottom: `1px solid ${c.border}`, fontSize: '12px', fontWeight: 600, color: c.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
    fileItem: { padding: '4px 12px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', userSelect: 'none' as const },
    fileItemDir: { color: c.text },
    fileItemFile: { color: c.textMuted },
    gitFile: { padding: '4px 12px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${c.statusBorder}` },
    gitStatus: { fontSize: '10px', padding: '1px 4px', borderRadius: '2px' },
    gitModified: { color: c.errorText },
    gitAdded: { color: c.accent },
    gitDeleted: { color: c.errorText },
    gitRenamed: { color: '#FFB347' },
    loadingOverlay: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: c.bg, color: c.textMuted },
  }
}

export function getEffectiveTheme(setting: ThemeName | 'auto'): ThemeName {
  if (setting === 'auto') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  return setting
}

export const STATUS_COLORS: Record<string, string> = {
  ' M': '#FF6B6B', 'M ': '#FF6B6B', 'MM': '#FF6B6B',
  'A ': '#4ECB71', 'A  ': '#4ECB71',
  'D ': '#FF6B6B', 'D  ': '#FF6B6B',
  'R ': '#FFB347', 'R  ': '#FFB347',
  '??': '#FFB347',
  'M': '#FF6B6B',
}
