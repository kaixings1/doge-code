import { getGlobalConfig } from '../../utils/config.js';
export async function call(onDone, context, args) {
    const config = getGlobalConfig();
    const currentVerbose = config.verbose ?? false;
    // 支持参数: /focus on, /focus off, /focus toggle
    const trimmed = args?.trim().toLowerCase() || 'toggle';
    let newVerbose;
    if (trimmed === 'on' || trimmed === 'true' || trimmed === '1') {
        newVerbose = true;
    }
    else if (trimmed === 'off' || trimmed === 'false' || trimmed === '0') {
        newVerbose = false;
    }
    else {
        // toggle
        newVerbose = !currentVerbose;
    }
    // 同步更新 AppState（实时生效）
    context.setAppState(prev => ({ ...prev, verbose: newVerbose }));
    const message = newVerbose
        ? '焦点模式已关闭 — 显示完整记录（工具调用和思考过程）'
        : '焦点模式已开启 — 仅显示最终回复，中间工具调用已折叠';
    onDone(message);
    return null;
}
