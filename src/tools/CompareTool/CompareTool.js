import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { diffLines } from '../../vendor/lodash.js';
const inputSchema = lazySchema(() => z.object({
    left: z.string().describe('左侧内容或文件路径'),
    right: z.string().describe('右侧内容或文件路径'),
}));
const outputSchema = lazySchema(() => z.object({
    diff: z.string().optional().describe('差异输出'),
    changes: z.array(z.string()).describe('发现的变更'),
    identical: z.boolean().optional().describe('内容是否相同'),
}));
async function readFileContent(path) {
    const { readFile } = await import('fs/promises');
    return readFile(path, { encoding: 'utf8' });
}
async function resolveContent(input) {
    // 如果输入是文件路径（存在文件），读取文件内容；否则视为原始内容
    try {
        const { stat } = await import('fs/promises');
        await stat(input);
        return await readFileContent(input);
    }
    catch {
        return input;
    }
}
export const CompareTool = buildTool({
    name: 'compare',
    description: async () => '比较文件或内容，返回差异和变更列表',
    callOn: 'manual',
    async prompt() {
        return '使用 compare 工具比较文件或内容。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'compare';
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
        const left = input?.left ?? '?';
        const right = input?.right ?? '?';
        return `Compare: ${left.substring(0, 30)} ↔ ${right.substring(0, 30)}`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        const changes = content.changes;
        const identical = content.identical;
        const msg = identical
            ? '内容相同，无差异'
            : changes && changes.length > 0
                ? `发现 ${changes.length} 处变更`
                : '无差异';
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: msg,
        };
    },
    async call({ left, right }) {
        try {
            const [leftContent, rightContent] = await Promise.all([
                resolveContent(left),
                resolveContent(right),
            ]);
            const changes = [];
            const leftLines = leftContent.split('\n');
            const rightLines = rightContent.split('\n');
            const maxLines = Math.max(leftLines.length, rightLines.length);
            for (let i = 0; i < maxLines; i++) {
                const leftLine = leftLines[i] ?? '';
                const rightLine = rightLines[i] ?? '';
                if (leftLine !== rightLine) {
                    if (leftLine)
                        changes.push(`- ${leftLine}`);
                    if (rightLine)
                        changes.push(`+ ${rightLine}`);
                }
            }
            const diff = diffLines(leftContent, rightContent);
            const identical = changes.length === 0;
            return {
                data: {
                    diff: diff || '',
                    changes,
                    identical,
                },
            };
        }
        catch (err) {
            return {
                data: {
                    diff: '',
                    changes: [`比较失败: ${err instanceof Error ? err.message : String(err)}`],
                    identical: false,
                },
            };
        }
    },
});
