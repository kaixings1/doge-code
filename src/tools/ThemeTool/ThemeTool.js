import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
const inputSchema = lazySchema(() => z.object({
    action: z.enum(['create', 'switch', 'list', 'delete', 'show']).describe('主题操作'),
    name: z.string().optional().describe('主题名称'),
    accent: z.string().optional().describe('强调色（十六进制，如 #ff6b35）'),
    background: z.string().optional().describe('背景色'),
    foreground: z.string().optional().describe('前景色（文本色）'),
}));
const outputSchema = lazySchema(() => z.object({
    success: z.boolean().describe('操作是否成功'),
    themes: z.array(z.string()).optional().describe('可用主题列表'),
    currentTheme: z.string().optional().describe('当前主题名称'),
    message: z.string().describe('结果消息'),
    theme: z.record(z.string()).optional().describe('主题详情'),
}));
const THEME_DIR = join(process.env.TEMP || '.', 'doge-themes');
const CURRENT_THEME_FILE = join(THEME_DIR, 'current-theme.json');
const BUILTIN_THEMES = {
    default: { name: 'default', accent: '#3b82f6', background: '#1e1e1e', foreground: '#e5e5e5', createdAt: '' },
    light: { name: 'light', accent: '#2563eb', background: '#ffffff', foreground: '#1a1a1a', createdAt: '' },
    dracula: { name: 'dracula', accent: '#bd93f9', background: '#282a36', foreground: '#f8f8f2', createdAt: '' },
    nord: { name: 'nord', accent: '#88c0d0', background: '#2e3440', foreground: '#eceff4', createdAt: '' },
    monokai: { name: 'monokai', accent: '#f92672', background: '#272822', foreground: '#f8f8f2', createdAt: '' },
};
async function ensureThemeDir() {
    try {
        await mkdir(THEME_DIR, { recursive: true });
    }
    catch {
        // directory may already exist
    }
}
async function getCurrentThemeName() {
    try {
        await ensureThemeDir();
        const content = await readFile(CURRENT_THEME_FILE, { encoding: 'utf8' });
        const data = JSON.parse(content);
        return data.name || 'default';
    }
    catch {
        return 'default';
    }
}
async function setCurrentTheme(name) {
    await ensureThemeDir();
    await writeFile(CURRENT_THEME_FILE, JSON.stringify({ name, updatedAt: new Date().toISOString() }), { encoding: 'utf8' });
}
async function loadCustomTheme(name) {
    try {
        const content = await readFile(join(THEME_DIR, `${name}.theme.json`), { encoding: 'utf8' });
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
async function saveCustomTheme(theme) {
    await ensureThemeDir();
    await writeFile(join(THEME_DIR, `${theme.name}.theme.json`), JSON.stringify(theme, null, 2), { encoding: 'utf8' });
}
async function listAllThemes() {
    const builtin = Object.keys(BUILTIN_THEMES);
    try {
        await ensureThemeDir();
        const { readdir } = await import('fs/promises');
        const files = await readdir(THEME_DIR);
        const custom = files.filter(f => f.endsWith('.theme.json')).map(f => f.replace('.theme.json', ''));
        return [...new Set([...builtin, ...custom])];
    }
    catch {
        return builtin;
    }
}
export const ThemeTool = buildTool({
    name: 'theme',
    description: async () => '创建、切换、列出和删除主题（支持内置和自定义主题）',
    callOn: 'manual',
    async prompt() {
        return '使用 theme 工具管理终端主题。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'theme';
    },
    isEnabled() {
        return true;
    },
    toAutoClassifierInput() {
        return '';
    },
    async checkPermissions(input) {
        return { behavior: 'allow', updatedInput: input };
    },
    renderToolUseMessage(input) {
        const action = input?.action ?? '?';
        const name = input?.name;
        return `Theme: ${action}${name ? ` (${name})` : ''}`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: content.message || 'Theme operation completed',
        };
    },
    async call({ action, name, accent, background, foreground }) {
        switch (action) {
            case 'list': {
                const themes = await listAllThemes();
                return {
                    data: {
                        success: true,
                        themes,
                        message: `找到 ${themes.length} 个主题: ${themes.join(', ')}`,
                    },
                };
            }
            case 'show': {
                const currentName = await getCurrentThemeName();
                const theme = BUILTIN_THEMES[currentName] || (await loadCustomTheme(currentName));
                const themeData = theme || { name: currentName, accent: '', background: '', foreground: '' };
                return {
                    data: {
                        success: true,
                        currentTheme: currentName,
                        theme: themeData,
                        message: `当前主题: ${currentName}`,
                    },
                };
            }
            case 'create': {
                if (!name) {
                    return { data: { success: false, message: 'create 需要 name 参数' } };
                }
                const customTheme = {
                    name,
                    accent: accent || '#3b82f6',
                    background: background || '#1e1e1e',
                    foreground: foreground || '#e5e5e5',
                    createdAt: new Date().toISOString(),
                };
                await saveCustomTheme(customTheme);
                return {
                    data: {
                        success: true,
                        theme: customTheme,
                        message: `主题 "${name}" 已创建`,
                    },
                };
            }
            case 'switch': {
                if (!name) {
                    return { data: { success: false, message: 'switch 需要 name 参数' } };
                }
                const allThemes = await listAllThemes();
                if (!allThemes.includes(name)) {
                    return { data: { success: false, message: `主题 "${name}" 不存在，可用主题: ${allThemes.join(', ')}` } };
                }
                await setCurrentTheme(name);
                const switchedTheme = BUILTIN_THEMES[name] || (await loadCustomTheme(name));
                return {
                    data: {
                        success: true,
                        currentTheme: name,
                        theme: switchedTheme || undefined,
                        message: `已切换到主题 "${name}"`,
                    },
                };
            }
            case 'delete': {
                if (!name) {
                    return { data: { success: false, message: 'delete 需要 name 参数' } };
                }
                if (BUILTIN_THEMES[name]) {
                    return { data: { success: false, message: `内置主题 "${name}" 不能删除` } };
                }
                const custom = await loadCustomTheme(name);
                if (!custom) {
                    return { data: { success: false, message: `主题 "${name}" 不存在` } };
                }
                const { unlink } = await import('fs/promises');
                await unlink(join(THEME_DIR, `${name}.theme.json`));
                return { data: { success: true, message: `主题 "${name}" 已删除` } };
            }
        }
    },
});
