import { feature } from 'bun:bundle';
import { extname, isAbsolute, resolve } from 'path';
import { fileHistoryEnabled, fileHistoryTrackEdit, } from '../../utils/fileHistory.js';
import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { isENOENT } from '../../utils/errors.js';
import { getFileModificationTime, writeTextContent } from '../../utils/file.js';
import { readFileSyncWithMetadata } from '../../utils/fileRead.js';
import { safeParseJSON } from '../../utils/json.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { parseCellId } from '../../utils/notebook.js';
import { checkWritePermissionForTool } from '../../utils/permissions/filesystem.js';
import { jsonParse, jsonStringify } from '../../utils/slowOperations.js';
import { NOTEBOOK_EDIT_TOOL_NAME } from './constants.js';
import { DESCRIPTION, PROMPT } from './prompt.js';
import { getToolUseSummary, renderToolResultMessage, renderToolUseErrorMessage, renderToolUseMessage, renderToolUseRejectedMessage, } from './UI.js';
export const inputSchema = lazySchema(() => z.strictObject({
    notebook_path: z
        .string()
        .describe('要编辑的 Jupyter 笔记本文件的绝对路径（必须为绝对路径，不能是相对路径）'),
    cell_id: z
        .string()
        .optional()
        .describe('要编辑的单元格 ID。插入新单元格时，新单元格将插入在该 ID 的单元格之后；如果未指定，则插入到文件开头。'),
    new_source: z.string().describe('单元格的新内容'),
    cell_type: z
        .enum(['code', 'markdown'])
        .optional()
        .describe('单元格类型（code 或 markdown）。如果未指定，则沿用当前单元格类型。使用 edit_mode=insert 时此项必填。'),
    edit_mode: z
        .enum(['replace', 'insert', 'delete'])
        .optional()
        .describe('要执行的编辑类型（replace、insert、delete）。默认为 replace。'),
}));
export const outputSchema = lazySchema(() => z.object({
    new_source: z.string().describe('写入单元格的新源代码'),
    cell_id: z.string().optional().describe('被编辑的单元格 ID'),
    cell_type: z.enum(['code', 'markdown']).describe('单元格类型'),
    language: z.string().describe('笔记本的编程语言'),
    edit_mode: z.string().describe('所使用的编辑模式'),
    error: z.string().optional().describe('操作失败时的错误消息'),
    // Fields for attribution tracking
    notebook_path: z.string().describe('笔记本文件路径'),
    original_file: z.string().describe('修改前的原始笔记本内容'),
    updated_file: z.string().describe('修改后的更新笔记本内容'),
}));
export const NotebookEditTool = buildTool({
    name: NOTEBOOK_EDIT_TOOL_NAME,
    searchHint: '编辑 Jupyter 笔记本单元格 (.ipynb)',
    maxResultSizeChars: 100_000,
    shouldDefer: true,
    async description() {
        return DESCRIPTION;
    },
    async prompt() {
        return PROMPT;
    },
    userFacingName() {
        return '编辑笔记本';
    },
    getToolUseSummary,
    getActivityDescription(input) {
        const summary = getToolUseSummary(input);
        return summary ? `正在编辑笔记本 ${summary}` : '正在编辑笔记本';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    toAutoClassifierInput(input) {
        if (feature('TRANSCRIPT_CLASSIFIER')) {
            const mode = input.edit_mode ?? 'replace';
            return `${input.notebook_path} ${mode}: ${input.new_source}`;
        }
        return '';
    },
    getPath(input) {
        return input.notebook_path;
    },
    async checkPermissions(input, context) {
        const appState = context.getAppState();
        return checkWritePermissionForTool(NotebookEditTool, input, appState.toolPermissionContext);
    },
    mapToolResultToToolResultBlockParam({ cell_id, edit_mode, new_source, error }, toolUseID) {
        if (error) {
            return {
                tool_use_id: toolUseID,
                type: 'tool_result',
                content: error,
                is_error: true,
            };
        }
        switch (edit_mode) {
            case 'replace':
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content: `Updated cell ${cell_id} with ${new_source}`,
                };
            case 'insert':
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content: `Inserted cell ${cell_id} with ${new_source}`,
                };
            case 'delete':
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content: `Deleted cell ${cell_id}`,
                };
            default:
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content: '未知的编辑模式',
                };
        }
    },
    renderToolUseMessage,
    renderToolUseRejectedMessage,
    renderToolUseErrorMessage,
    renderToolResultMessage,
    async validateInput({ notebook_path, cell_type, cell_id, edit_mode = 'replace' }, toolUseContext) {
        const fullPath = isAbsolute(notebook_path)
            ? notebook_path
            : resolve(getCwd(), notebook_path);
        // SECURITY: Skip filesystem operations for UNC paths to prevent NTLM credential leaks.
        if (fullPath.startsWith('\\\\') || fullPath.startsWith('//')) {
            return { result: true };
        }
        if (extname(fullPath) !== '.ipynb') {
            return {
                result: false,
                message: '文件必须是 Jupyter notebook（.ipynb 文件）。编辑其他文件类型时，请使用 FileEdit 工具。',
                errorCode: 2,
            };
        }
        if (edit_mode !== 'replace' &&
            edit_mode !== 'insert' &&
            edit_mode !== 'delete') {
            return {
                result: false,
                message: '编辑模式必须是 replace、insert 或 delete。',
                errorCode: 4,
            };
        }
        if (edit_mode === 'insert' && !cell_type) {
            return {
                result: false,
                message: '使用 edit_mode=insert 时必须指定单元格类型。',
                errorCode: 5,
            };
        }
        // Require Read-before-Edit (matches FileEditTool/FileWriteTool). Without
        // this, the model could edit a notebook it never saw, or edit against a
        // stale view after an external change — silent data loss.
        const readTimestamp = toolUseContext.readFileState.get(fullPath);
        if (!readTimestamp) {
            return {
                result: false,
                message: '文件尚未读取。请在写入前先读取文件。',
                errorCode: 9,
            };
        }
        if (getFileModificationTime(fullPath) > readTimestamp.timestamp) {
            return {
                result: false,
                message: '文件自上次读取以来已被修改（可能是用户或 linter 修改）。请在写入前重新读取文件。',
                errorCode: 10,
            };
        }
        let content;
        try {
            content = readFileSyncWithMetadata(fullPath).content;
        }
        catch (e) {
            if (isENOENT(e)) {
                return {
                    result: false,
                    message: 'Notebook 文件不存在。',
                    errorCode: 1,
                };
            }
            throw e;
        }
        const notebook = safeParseJSON(content);
        if (!notebook) {
            return {
                result: false,
                message: 'Notebook 不是有效的 JSON。',
                errorCode: 6,
            };
        }
        if (!cell_id) {
            if (edit_mode !== 'insert') {
                return {
                    result: false,
                    message: '不插入新单元格时必须指定 Cell ID。',
                    errorCode: 7,
                };
            }
        }
        else {
            // First try to find the cell by its actual ID
            const cellIndex = notebook.cells.findIndex(cell => cell.id === cell_id);
            if (cellIndex === -1) {
                // If not found, try to parse as a numeric index (cell-N format)
                const parsedCellIndex = parseCellId(cell_id);
                if (parsedCellIndex !== undefined) {
                    if (!notebook.cells[parsedCellIndex]) {
                        return {
                            result: false,
                            message: `Cell with index ${parsedCellIndex} does not exist in notebook.`,
                            errorCode: 7,
                        };
                    }
                }
                else {
                    return {
                        result: false,
                        message: `在笔记本中未找到 ID 为 "${cell_id}" 的单元格。`,
                        errorCode: 8,
                    };
                }
            }
        }
        return { result: true };
    },
    async call({ notebook_path, new_source, cell_id, cell_type, edit_mode: originalEditMode, }, { readFileState, updateFileHistoryState }, _, parentMessage) {
        const fullPath = isAbsolute(notebook_path)
            ? notebook_path
            : resolve(getCwd(), notebook_path);
        if (fileHistoryEnabled()) {
            await fileHistoryTrackEdit(updateFileHistoryState, fullPath, parentMessage.uuid);
        }
        try {
            // readFileSyncWithMetadata gives content + encoding + line endings in
            // one safeResolvePath + readFileSync pass, replacing the previous
            // detectFileEncoding + readFile + detectLineEndings chain (each of
            // which redid safeResolvePath and/or a 4KB readSync).
            const { content, encoding, lineEndings } = readFileSyncWithMetadata(fullPath);
            // Must use non-memoized jsonParse here: safeParseJSON caches by content
            // string and returns a shared object reference, but we mutate the
            // notebook in place below (cells.splice, targetCell.source = ...).
            // Using the memoized version poisons the cache for validateInput() and
            // any subsequent call() with the same file content.
            let notebook;
            try {
                notebook = jsonParse(content);
            }
            catch {
                return {
                    data: {
                        new_source,
                        cell_type: cell_type ?? 'code',
                        language: 'python',
                        edit_mode: 'replace',
                        error: 'Notebook 不是有效的 JSON。',
                        cell_id,
                        notebook_path: fullPath,
                        original_file: '',
                        updated_file: '',
                    },
                };
            }
            let cellIndex;
            if (!cell_id) {
                cellIndex = 0; // Default to inserting at the beginning if no cell_id is provided
            }
            else {
                // First try to find the cell by its actual ID
                cellIndex = notebook.cells.findIndex(cell => cell.id === cell_id);
                // If not found, try to parse as a numeric index (cell-N format)
                if (cellIndex === -1) {
                    const parsedCellIndex = parseCellId(cell_id);
                    if (parsedCellIndex !== undefined) {
                        cellIndex = parsedCellIndex;
                    }
                }
                if (originalEditMode === 'insert') {
                    cellIndex += 1; // Insert after the cell with this ID
                }
            }
            // Convert replace to insert if trying to replace one past the end
            let edit_mode = originalEditMode;
            if (edit_mode === 'replace' && cellIndex === notebook.cells.length) {
                edit_mode = 'insert';
                if (!cell_type) {
                    cell_type = 'code'; // Default to code if no cell_type specified
                }
            }
            const language = notebook.metadata.language_info?.name ?? 'python';
            let new_cell_id = undefined;
            if (notebook.nbformat > 4 ||
                (notebook.nbformat === 4 && notebook.nbformat_minor >= 5)) {
                if (edit_mode === 'insert') {
                    new_cell_id = Math.random().toString(36).substring(2, 15);
                }
                else if (cell_id !== null) {
                    new_cell_id = cell_id;
                }
            }
            if (edit_mode === 'delete') {
                // Delete the specified cell
                notebook.cells.splice(cellIndex, 1);
            }
            else if (edit_mode === 'insert') {
                let new_cell;
                if (cell_type === 'markdown') {
                    new_cell = {
                        cell_type: 'markdown',
                        id: new_cell_id,
                        source: new_source,
                        metadata: {},
                    };
                }
                else {
                    new_cell = {
                        cell_type: 'code',
                        id: new_cell_id,
                        source: new_source,
                        metadata: {},
                        execution_count: null,
                        outputs: [],
                    };
                }
                // Insert the new cell
                notebook.cells.splice(cellIndex, 0, new_cell);
            }
            else {
                // Find the specified cell
                const targetCell = notebook.cells[cellIndex]; // validateInput ensures cell_number is in bounds
                targetCell.source = new_source;
                if (targetCell.cell_type === 'code') {
                    // Reset execution count and clear outputs since cell was modified
                    targetCell.execution_count = null;
                    targetCell.outputs = [];
                }
                if (cell_type && cell_type !== targetCell.cell_type) {
                    targetCell.cell_type = cell_type;
                }
            }
            // Write back to file
            const IPYNB_INDENT = 1;
            const updatedContent = jsonStringify(notebook, null, IPYNB_INDENT);
            writeTextContent(fullPath, updatedContent, encoding, lineEndings);
            // Update readFileState with post-write mtime (matches FileEditTool/
            // FileWriteTool). offset:undefined breaks FileReadTool's dedup match —
            // without this, Read→NotebookEdit→Read in the same millisecond would
            // return the file_unchanged stub against stale in-context content.
            readFileState.set(fullPath, {
                content: updatedContent,
                timestamp: getFileModificationTime(fullPath),
                offset: undefined,
                limit: undefined,
            });
            const data = {
                new_source,
                cell_type: cell_type ?? 'code',
                language,
                edit_mode: edit_mode ?? 'replace',
                cell_id: new_cell_id || undefined,
                error: '',
                notebook_path: fullPath,
                original_file: content,
                updated_file: updatedContent,
            };
            return {
                data,
            };
        }
        catch (error) {
            if (error instanceof Error) {
                const data = {
                    new_source,
                    cell_type: cell_type ?? 'code',
                    language: 'python',
                    edit_mode: 'replace',
                    error: error.message,
                    cell_id,
                    notebook_path: fullPath,
                    original_file: '',
                    updated_file: '',
                };
                return {
                    data,
                };
            }
            const data = {
                new_source,
                cell_type: cell_type ?? 'code',
                language: 'python',
                edit_mode: 'replace',
                error: '编辑笔记本时发生未知错误',
                cell_id,
                notebook_path: fullPath,
                original_file: '',
                updated_file: '',
            };
            return {
                data,
            };
        }
    },
});
//# sourceMappingURL=NotebookEditTool.js.map