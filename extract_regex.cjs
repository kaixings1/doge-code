const fs = require('fs');

function read_file(path) {
    return fs.readFileSync(path, 'utf-8');
}

function extract_string_value(content, key, start_pos) {
    // Find the key
    const key_pattern = new RegExp(key + "\\s*:\\s*'", 'g');
    key_pattern.lastIndex = start_pos;
    const key_match = key_pattern.exec(content);
    if (!key_match) return null;

    // Find the closing quote
    const value_start = key_pattern.lastIndex;
    let value_end = value_start;
    let in_escape = false;
    for (let i = value_start; i < content.length; i++) {
        if (in_escape) {
            in_escape = false;
            continue;
        }
        if (content[i] === '\\') {
            in_escape = true;
            continue;
        }
        if (content[i] === "'") {
            value_end = i;
            break;
        }
    }

    return {
        value: content.substring(value_start, value_end),
        end_pos: value_end + 1
    };
}

function extract_array_value(content, key, start_pos) {
    // Find the key
    const key_pattern = new RegExp(key + "\\s*:\\s*\\[", 'g');
    key_pattern.lastIndex = start_pos;
    const key_match = key_pattern.exec(content);
    if (!key_match) return null;

    // Find the closing bracket
    const arr_start = key_pattern.lastIndex;
    let depth = 1;
    let arr_end = arr_start;
    for (let i = arr_start; i < content.length; i++) {
        if (content[i] === '[') depth++;
        else if (content[i] === ']') {
            depth--;
            if (depth === 0) {
                arr_end = i;
                break;
            }
        }
    }

    // Extract string items from array
    const arr_content = content.substring(arr_start, arr_end + 1);
    const items = [];
    const item_pattern = /'([^']*)'/g;
    let item_match;
    while ((item_match = item_pattern.exec(arr_content)) !== null) {
        items.push(item_match[1]);
    }

    return {
        value: items,
        end_pos: arr_end + 1
    };
}

function extract_examples(content) {
    const strategies = {};

    // Find each strategy section
    const strategy_pattern = /[\'"]?([\w-]+)[\'"]?\s*:\s*\[/g;
    let strat_match;

    while ((strat_match = strategy_pattern.exec(content)) !== null) {
        const strategy_name = strat_match[1];
        const arr_start = strategy_pattern.lastIndex;

        // Find the closing bracket
        let depth = 1;
        let arr_end = arr_start;
        for (let i = arr_start; i < content.length; i++) {
            if (content[i] === '[') depth++;
            else if (content[i] === ']') {
                depth--;
                if (depth === 0) {
                    arr_end = i;
                    break;
                }
            }
        }

        const arr_content = content.substring(arr_start, arr_end);

        // Extract examples
        const examples = [];
        const obj_pattern = /\{[^{}]*\}/g;
        let obj_match;

        while ((obj_match = obj_pattern.exec(arr_content)) !== null) {
            const obj_str = obj_match[0];
            const example = {};

            // Extract fields
            const title = extract_string_value(obj_str, 'title', 0);
            if (title) example.title = title.value;

            const description = extract_string_value(obj_str, 'description', 0);
            if (description) example.description = description.value;

            const complexity = extract_string_value(obj_str, 'complexity', 0);
            if (complexity) example.complexity = complexity.value;

            const command = extract_string_value(obj_str, 'command', 0);
            if (command) example.command = command.value;

            const strategy = extract_string_value(obj_str, 'strategy', 0);
            if (strategy) example.strategy = strategy.value;

            const result = extract_string_value(obj_str, 'result', 0);
            if (result) example.result = result.value;

            const parameters = extract_array_value(obj_str, 'parameters', 0);
            if (parameters) example.parameters = parameters.value;

            const outcome = extract_string_value(obj_str, 'outcome', 0);
            if (outcome) example.outcome = outcome.value;

            if (example.title) {
                examples.push(example);
            }
        }

        if (examples.length > 0) {
            strategies[strategy_name] = examples;
        }
    }

    return strategies;
}

function extract_manuals(content) {
    const strategies = {};

    // Find each strategy section
    const strategy_pattern = /['"]?([\w-]+)['"]?\s*:\s*\{/g;
    let strat_match;

    while ((strat_match = strategy_pattern.exec(content)) !== null) {
        const strategy_name = strat_match[1];
        const obj_start = strategy_pattern.lastIndex;

        // Find the closing brace
        let depth = 1;
        let obj_end = obj_start;
        for (let i = obj_start; i < content.length; i++) {
            if (content[i] === '{') depth++;
            else if (content[i] === '}') {
                depth--;
                if (depth === 0) {
                    obj_end = i;
                    break;
                }
            }
        }

        const obj_content = content.substring(obj_start, obj_end);
        const manual = {};

        // Extract simple fields
        const display_name = extract_string_value(obj_content, 'displayName', 0);
        if (display_name) manual.displayName = display_name.value;

        const tagline = extract_string_value(obj_content, 'tagline', 0);
        if (tagline) manual.tagline = tagline.value;

        const overview = extract_string_value(obj_content, 'overview', 0);
        if (overview) manual.overview = overview.value;

        // Extract use cases array
        const use_cases = extract_array_value(obj_content, 'useCases', 0);
        if (use_cases) manual.useCases = use_cases.value;

        // Extract not suitable for array
        const not_suitable = extract_array_value(obj_content, 'notSuitableFor', 0);
        if (not_suitable) manual.notSuitableFor = not_suitable.value;

        // Extract best practices array
        const best_practices = extract_array_value(obj_content, 'bestPractices', 0);
        if (best_practices) manual.bestPractices = best_practices.value;

        // Extract common pitfalls array
        const common_pitfalls = extract_array_value(obj_content, 'commonPitfalls', 0);
        if (common_pitfalls) manual.commonPitfalls = common_pitfalls.value;

        if (manual.displayName || manual.tagline) {
            strategies[strategy_name] = manual;
        }
    }

    return strategies;
}

function format_examples(data) {
    let output = '';
    output += '════════════════════════════════════════════════════════════════\n';
    output += '  Doge Code Loop 策略引擎 - 完整示例与使用指南\n';
    output += '  生成日期: ' + new Date().toLocaleString('zh-CN') + '\n';
    output += '════════════════════════════════════════════════════════════════\n\n';

    output += '════════════════════════════════════════════════════════════════\n';
    output += '  第一部分: 简洁示例列表 (Strategy Examples)\n';
    output += '════════════════════════════════════════════════════════════════\n\n';

    for (const [strategy, examples] of Object.entries(data)) {
        output += '────────────────────────────────────────────────────────────────\n';
        output += '  策略: ' + strategy.toUpperCase() + ' (' + examples.length + ' 个示例)\n';
        output += '────────────────────────────────────────────────────────────────\n\n';

        for (let i = 0; i < examples.length; i++) {
            const ex = examples[i];
            output += '  [' + (i + 1) + '] ' + (ex.title || '') + '\n';
            output += '      复杂度: ' + (ex.complexity || '') + '\n';
            output += '      描述: ' + (ex.description || '') + '\n';
            output += '      命令: ' + (ex.command || '') + '\n';
            output += '      策略: ' + (ex.strategy || '') + '\n';
            output += '      结果: ' + (ex.result || '') + '\n';
            if (ex.parameters && ex.parameters.length > 0) {
                output += '      参数:\n';
                for (const p of ex.parameters) {
                    output += '        - ' + p + '\n';
                }
            }
            output += '      产出: ' + (ex.outcome || ex.output || '') + '\n';
            output += '\n';
        }
    }

    return output;
}

function format_manuals(data) {
    let output = '';
    output += '════════════════════════════════════════════════════════════════\n';
    output += '  第二部分: 详细使用手册 (Strategy Manuals)\n';
    output += '════════════════════════════════════════════════════════════════\n\n';

    for (const [strategy, manual] of Object.entries(data)) {
        output += '────────────────────────────────────────────────────────────────\n';
        output += '  策略: ' + strategy.toUpperCase() + ' - ' + (manual.displayName || '') + '\n';
        output += '  简介: ' + (manual.tagline || '') + '\n';
        output += '────────────────────────────────────────────────────────────────\n\n';

        if (manual.overview) {
            output += '  ▶ 概述\n';
            output += '    ' + manual.overview.replace(/\n/g, '\n    ') + '\n\n';
        }

        if (manual.useCases && manual.useCases.length > 0) {
            output += '  ▶ 适用场景\n';
            for (const uc of manual.useCases) {
                output += '    ✓ ' + uc + '\n';
            }
            output += '\n';
        }

        if (manual.notSuitableFor && manual.notSuitableFor.length > 0) {
            output += '  ▶ 不适用场景\n';
            for (const nsf of manual.notSuitableFor) {
                output += '    ✗ ' + nsf + '\n';
            }
            output += '\n';
        }

        if (manual.bestPractices && manual.bestPractices.length > 0) {
            output += '  ▶ 最佳实践\n';
            for (const bp of manual.bestPractices) {
                output += '    ✓ ' + bp + '\n';
            }
            output += '\n';
        }

        if (manual.commonPitfalls && manual.commonPitfalls.length > 0) {
            output += '  ▶ 常见陷阱\n';
            for (const cp of manual.commonPitfalls) {
                output += '    ' + cp + '\n';
            }
            output += '\n';
        }

        output += '\n';
    }

    return output;
}

// Main
console.log("正在读取文件...");
const examples_content = read_file('D:/doge-code/src/commands/loop/strategy-examples.ts');
const manuals_content = read_file('D:/doge-code/src/commands/loop/strategy-manuals.ts');

console.log("正在解析 examples...");
const examples_data = extract_examples(examples_content);

console.log("正在解析 manuals...");
const manuals_data = extract_manuals(manuals_content);

let output = '';
if (examples_data && Object.keys(examples_data).length > 0) {
    console.log("找到 " + Object.keys(examples_data).length + " 个策略的 examples");
    for (const [k, v] of Object.entries(examples_data)) {
        console.log("  - " + k + ": " + v.length + " 个示例");
    }
    output += format_examples(examples_data);
} else {
    output += '无法解析 examples 数据\n';
}

output += '\n\n';

if (manuals_data && Object.keys(manuals_data).length > 0) {
    console.log("找到 " + Object.keys(manuals_data).length + " 个策略的 manuals");
    for (const [k, v] of Object.entries(manuals_data)) {
        console.log("  - " + k + ": " + Object.keys(v).length + " 个字段");
    }
    output += format_manuals(manuals_data);
} else {
    output += '无法解析 manuals 数据\n';
}

output += '════════════════════════════════════════════════════════════════\n';
output += '  文档结束\n';
output += '════════════════════════════════════════════════════════════════\n';

fs.writeFileSync('D:/doge-code/loop-strategy-完整示例与使用指南.txt', output, 'utf8');
console.log('\n文件已生成: D:/doge-code/loop-strategy-完整示例与使用指南.txt');
console.log('总行数: ' + output.split('\n').length);
