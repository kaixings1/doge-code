import { logEvent, } from '../../services/analytics/index.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';
export const call = async () => {
    const config = getGlobalConfig();
    let currentMode = config.editorMode || 'normal';
    // Handle backward compatibility - treat 'emacs' as 'normal'
    if (currentMode === 'emacs') {
        currentMode = 'normal';
    }
    const newMode = currentMode === 'normal' ? 'vim' : 'normal';
    saveGlobalConfig(current => ({
        ...current,
        editorMode: newMode,
    }));
    logEvent('tengu_editor_mode_changed', {
        mode: newMode,
        source: 'command',
    });
    return {
        type: 'text',
        value: `编辑模式已设置为 ${newMode}。${newMode === 'vim'
            ? '使用 Escape 键在插入模式和正常模式之间切换。'
            : '使用标准（readline）键盘绑定。'}`,
    };
};
