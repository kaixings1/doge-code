import { readFile, stat } from 'fs/promises';
import { getOriginalCwd } from '../../bootstrap/state.js';
import { logEvent } from '../../services/analytics/index.js';
import { getCwd } from '../../utils/cwd.js';
import { pathInAllowedWorkingPath } from '../../utils/permissions/filesystem.js';
import { setCwd } from '../../utils/Shell.js';
import { shouldMaintainProjectWorkingDir } from '../../utils/envUtils.js';
import { maybeResizeAndDownsampleImageBuffer } from '../../utils/imageResizer.js';
import { getMaxOutputLength } from '../../utils/shell/outputLimits.js';
import { countCharInString, plural } from '../../utils/stringUtils.js';
/**
 * 去除仅包含空白/换行的首尾行。
 * 与 trim() 不同，此函数保留内容行内的空白，仅移除开头和结尾完全空白的行。
 */
export function stripEmptyLines(content) {
    const lines = content.split('\n');
    // 查找第一个非空行
    let startIndex = 0;
    while (startIndex < lines.length && lines[startIndex]?.trim() === '') {
        startIndex++;
    }
    // 查找最后一个非空行
    let endIndex = lines.length - 1;
    while (endIndex >= 0 && lines[endIndex]?.trim() === '') {
        endIndex--;
    }
    // 如果所有行都为空，返回空字符串
    if (startIndex > endIndex) {
        return '';
    }
    // 返回包含非空行的切片
    return lines.slice(startIndex, endIndex + 1).join('\n');
}
/**
 * 检查内容是否为 base64 编码的图像数据 URL
 */
export function isImageOutput(content) {
    return /^data:image\/[a-z0-9.+_-]+;base64,/i.test(content);
}
const DATA_URI_RE = /^data:([^;]+);base64,(.+)$/;
/**
 * Parse a data-URI string into its media type and base64 payload.
 * Input is trimmed before matching.
 */
export function parseDataUri(s) {
    const match = s.trim().match(DATA_URI_RE);
    if (!match || !match[1] || !match[2])
        return null;
    return { mediaType: match[1], data: match[2] };
}
/**
 * Build an image tool_result block from shell stdout containing a data URI.
 * Returns null if parse fails so callers can fall through to text handling.
 */
export function buildImageToolResult(stdout, toolUseID) {
    const parsed = parseDataUri(stdout);
    if (!parsed)
        return null;
    return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: [
            {
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: parsed.mediaType,
                    data: parsed.data,
                },
            },
        ],
    };
}
// 将文件读取限制在 20 MB 以内 — 任何大于此值的图像数据 URI
// 都远超 API 接受的范围（5 MB base64），如果读入内存会导致内存溢出。
const MAX_IMAGE_FILE_SIZE = 20 * 1024 * 1024;
/**
 * Resize image output from a shell tool. stdout is capped at
 * getMaxOutputLength() when read back from the shell output file — if the
 * full output spilled to disk, re-read it from there, since truncated base64
 * would decode to a corrupt image that either throws here or gets rejected by
 * the API. Caps dimensions too: compressImageBuffer only checks byte size, so
 * a small-but-high-DPI PNG (e.g. matplotlib at dpi=300) sails through at full
 * resolution and poisons many-image requests (CC-304).
 *
 * Returns the re-encoded data URI on success, or null if the source didn't
 * parse as a data URI (caller decides whether to flip isImage).
 */
export async function resizeShellImageOutput(stdout, outputFilePath, outputFileSize) {
    let source = stdout;
    if (outputFilePath) {
        const size = outputFileSize ?? (await stat(outputFilePath)).size;
        if (size > MAX_IMAGE_FILE_SIZE)
            return null;
        source = await readFile(outputFilePath, 'utf8');
    }
    const parsed = parseDataUri(source);
    if (!parsed)
        return null;
    const buf = Buffer.from(parsed.data, 'base64');
    const ext = parsed.mediaType.split('/')[1] || 'png';
    const resized = await maybeResizeAndDownsampleImageBuffer(buf, buf.length, ext);
    return `data:image/${resized.mediaType};base64,${resized.buffer.toString('base64')}`;
}
export function formatOutput(content) {
    const isImage = isImageOutput(content);
    if (isImage) {
        return {
            totalLines: 1,
            truncatedContent: content,
            isImage,
        };
    }
    const maxOutputLength = getMaxOutputLength();
    if (content.length <= maxOutputLength) {
        return {
            totalLines: countCharInString(content, '\n') + 1,
            truncatedContent: content,
            isImage,
        };
    }
    const truncatedPart = content.slice(0, maxOutputLength);
    const remainingLines = countCharInString(content, '\n', maxOutputLength) + 1;
    const truncated = `${truncatedPart}\n\n... [${remainingLines} lines truncated] ...`;
    return {
        totalLines: countCharInString(content, '\n') + 1,
        truncatedContent: truncated,
        isImage,
    };
}
export const stdErrAppendShellResetMessage = (stderr) => `${stderr.trim()}\nShell cwd was reset to ${getOriginalCwd()}`;
export function resetCwdIfOutsideProject(toolPermissionContext) {
    const cwd = getCwd();
    const originalCwd = getOriginalCwd();
    const shouldMaintain = shouldMaintainProjectWorkingDir();
    if (shouldMaintain ||
        // 快速路径：originalCwd 无条件位于 allWorkingDirectories 中
        // (filesystem.ts)，因此当 cwd 未移动时，pathInAllowedWorkingPath 显然为真
        // — 对于无 cd 的常见情况，跳过其系统调用。
        (cwd !== originalCwd &&
            !pathInAllowedWorkingPath(cwd, toolPermissionContext))) {
        // Reset to original directory if maintaining project dir OR outside allowed working directory
        setCwd(originalCwd);
        if (!shouldMaintain) {
            logEvent('tengu_bash_tool_reset_to_original_dir', {});
            return true;
        }
    }
    return false;
}
/**
 * Creates a human-readable summary of structured content blocks.
 * Used to display MCP results with images and text in the UI.
 */
export function createContentSummary(content) {
    const parts = [];
    let textCount = 0;
    let imageCount = 0;
    for (const block of content) {
        if (block.type === 'image') {
            imageCount++;
        }
        else if (block.type === 'text' && 'text' in block) {
            textCount++;
            // Include first 200 chars of text blocks for context
            const preview = block.text.slice(0, 200);
            parts.push(preview + (block.text.length > 200 ? '...' : ''));
        }
    }
    const summary = [];
    if (imageCount > 0) {
        summary.push(`[${imageCount} ${plural(imageCount, 'image')}]`);
    }
    if (textCount > 0) {
        summary.push(`[${textCount} text ${plural(textCount, 'block')}]`);
    }
    return `MCP Result: ${summary.join(', ')}${parts.length > 0 ? '\n\n' + parts.join('\n\n') : ''}`;
}
//# sourceMappingURL=utils.js.map