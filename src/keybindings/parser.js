/**
 * 将 "ctrl+shift+k" 这样的按键字符串解析为 ParsedKeystroke。
 * 支持各种修饰键别名（ctrl/control、alt/opt/option/meta、
 * cmd/command/super/win）。
 */
export function parseKeystroke(input) {
    const parts = input.split('+');
    const keystroke = {
        key: '',
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        super: false,
    };
    for (const part of parts) {
        const lower = part.toLowerCase();
        switch (lower) {
            case 'ctrl':
            case 'control':
                keystroke.ctrl = true;
                break;
            case 'alt':
            case 'opt':
            case 'option':
                keystroke.alt = true;
                break;
            case 'shift':
                keystroke.shift = true;
                break;
            case 'meta':
                keystroke.meta = true;
                break;
            case 'cmd':
            case 'command':
            case 'super':
            case 'win':
                keystroke.super = true;
                break;
            case 'esc':
                keystroke.key = 'escape';
                break;
            case 'return':
                keystroke.key = 'enter';
                break;
            case 'space':
                keystroke.key = ' ';
                break;
            case '↑':
                keystroke.key = 'up';
                break;
            case '↓':
                keystroke.key = 'down';
                break;
            case '←':
                keystroke.key = 'left';
                break;
            case '→':
                keystroke.key = 'right';
                break;
            default:
                keystroke.key = lower;
                break;
        }
    }
    return keystroke;
}
/**
 * 将 "ctrl+k ctrl+s" 这样的和弦字符串解析为 ParsedKeystroke 数组。
 */
export function parseChord(input) {
    // 孤立的空格字符是空格键绑定，而非分隔符
    if (input === ' ')
        return [parseKeystroke('space')];
    return input.trim().split(/\s+/).map(parseKeystroke);
}
/**
 * 将 ParsedKeystroke 转换为其规范字符串表示形式用于显示。
 */
export function keystrokeToString(ks) {
    const parts = [];
    if (ks.ctrl)
        parts.push('ctrl');
    if (ks.alt)
        parts.push('alt');
    if (ks.shift)
        parts.push('shift');
    if (ks.meta)
        parts.push('meta');
    if (ks.super)
        parts.push('cmd');
    // 使用可读名称进行显示
    const displayKey = keyToDisplayName(ks.key);
    parts.push(displayKey);
    return parts.join('+');
}
/**
 * 将内部按键名称映射为人类可读的显示名称。
 */
function keyToDisplayName(key) {
    switch (key) {
        case 'escape':
            return 'Esc';
        case ' ':
            return 'Space';
        case 'tab':
            return 'tab';
        case 'enter':
            return 'Enter';
        case 'backspace':
            return 'Backspace';
        case 'delete':
            return 'Delete';
        case 'up':
            return '↑';
        case 'down':
            return '↓';
        case 'left':
            return '←';
        case 'right':
            return '→';
        case 'pageup':
            return 'PageUp';
        case 'pagedown':
            return 'PageDown';
        case 'home':
            return 'Home';
        case 'end':
            return 'End';
        default:
            return key;
    }
}
/**
 * 将 Chord 转换为其规范字符串表示形式用于显示。
 */
export function chordToString(chord) {
    return chord.map(keystrokeToString).join(' ');
}
/**
 * 将 ParsedKeystroke 转换为适合平台的显示字符串。
 * 在 macOS 上为 alt 使用 "opt"，其他平台使用 "alt"。
 */
export function keystrokeToDisplayString(ks, platform = 'linux') {
    const parts = [];
    if (ks.ctrl)
        parts.push('ctrl');
    // Alt/meta 在终端中等价，显示适合平台的名称
    if (ks.alt || ks.meta) {
        // 仅 macOS 使用 "opt"，所有其他平台使用 "alt"
        parts.push(platform === 'macos' ? 'opt' : 'alt');
    }
    if (ks.shift)
        parts.push('shift');
    if (ks.super) {
        parts.push(platform === 'macos' ? 'cmd' : 'super');
    }
    // 使用可读名称进行显示
    const displayKey = keyToDisplayName(ks.key);
    parts.push(displayKey);
    return parts.join('+');
}
/**
 * 将 Chord 转换为适合平台的显示字符串。
 */
export function chordToDisplayString(chord, platform = 'linux') {
    return chord.map(ks => keystrokeToDisplayString(ks, platform)).join(' ');
}
/**
 * 将按键绑定块（来自 JSON 配置）解析为扁平的 ParsedBinding 列表。
 */
export function parseBindings(blocks) {
    const bindings = [];
    for (const block of blocks) {
        for (const [key, action] of Object.entries(block.bindings)) {
            bindings.push({
                chord: parseChord(key),
                action,
                context: block.context,
            });
        }
    }
    return bindings;
}
//# sourceMappingURL=parser.js.map