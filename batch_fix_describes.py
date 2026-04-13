import re
import os

# 常见英文描述的中文映射
REPLACEMENTS = {
    # TaskCreateTool
    "A brief title for the task": "任务的简短标题",
    "What needs to be done": "需要做什么",
    "Arbitrary metadata to attach to the task": "附加到任务的任意元数据",
    
    # FileReadTool
    "The absolute path to the file to read": "要读取文件的绝对路径",
    "The path to the file that was read": "已读取文件的路径",
    "The content of the file": "文件内容",
    "Number of lines in the returned content": "返回内容的行数",
    "The starting line number": "起始行号",
    "Total number of lines in the file": "文件总行数",
    "Base64-encoded image data": "Base64 编码的图像数据",
    "Original file size in bytes": "原始文件大小（字节）",
    "Original image width in pixels": "原始图像宽度（像素）",
    "Original image height in pixels": "原始图像高度（像素）",
    "Displayed image width in pixels (after resizing)": "显示图像宽度（调整后）",
    "Displayed image height in pixels (after resizing)": "显示图像高度（调整后）",
    "Image dimension info for coordinate mapping": "图像尺寸信息用于坐标映射",
    "The path to the notebook file": "笔记本文件路径",
    "Array of notebook cells": "笔记本单元格数组",
    "The path to the PDF file": "PDF 文件路径",
    "Base64-encoded PDF data": "Base64 编码的 PDF 数据",
    "Number of pages extracted": "提取的页数",
    "Directory containing extracted page images": "包含提取页面图像的目录",
    "The path to the file": "文件路径",
    
    # FileWriteTool  
    "The content to write to the file": "要写入文件的内容",
    "The path to the file that was written": "已写入文件的路径",
    "The content that was written to the file": "已写入文件的内容",
    
    # FileEditTool types.ts
    "要修改的文件的绝对路径": "要修改的文件的绝对路径",
    "要替换的文本": "要替换的文本",
    "用于替换的新文本（必须与 old_string 不同）": "用于替换的新文本（必须与 old_string 不同）",
    "替换文件中所有出现的 old_string（默认 false）": "替换文件中所有出现的 old_string（默认 false）",
    "被编辑的文件的路径": "被编辑的文件的路径",
    "被替换的原始文本": "被替换的原始文本",
    "用于替换的新文本": "用于替换的新文本",
    "编辑前的原始文件内容": "编辑前的原始文件内容",
    "显示更改的差异补丁": "显示更改的差异补丁",
    "用户是否修改了建议的更改": "用户是否修改了建议的更改",
    "是否替换了所有出现的位置": "是否替换了所有出现的位置",
    
    # GlobTool
    "The glob pattern to match files against": "用于匹配文件的通配符模式",
    "Time taken to execute the search in milliseconds": "执行搜索的耗时（毫秒）",
    "Total number of files found": "找到的文件总数",
    "Array of file paths that match the pattern": "匹配模式的文件路径数组",
    "Whether results were truncated (limited to 100 files)": "结果是否被截断（限制为 100 个文件）",
    
    # GrepTool
    "Alias for context.": "context 的别名。",
    
    # LSPTool
    "The absolute or relative path to the file": "文件的绝对或相对路径",
    "The line number (1-based, as shown in editors)": "行号（1 基，如编辑器中显示）",
    "The character offset (1-based, as shown in editors)": "字符偏移量（1 基，如编辑器中显示）",
    "The LSP operation to perform": "要执行的 LSP 操作",
    "The LSP operation that was performed": "已执行的 LSP 操作",
    "The formatted result of the LSP operation": "LSP 操作的格式化结果",
    "The file path the operation was performed on": "执行操作的文件路径",
    "Number of results (definitions, references, symbols)": "结果数量（定义、引用、符号）",
    "Number of files containing results": "包含结果的文件数",
    
    # WebFetchTool
    "The URL that was fetched": "已获取的 URL",
    "Processed result from applying the prompt to the content": "将提示应用于内容的处理结果",
    "Time taken to fetch and process the content": "获取和处理内容的耗时",
    
    # WebSearchTool
    "ID of the tool use": "工具使用的 ID",
    "Array of search hits": "搜索结果数组",
    "The search query that was executed": "已执行的搜索查询",
    "Search results and/or text commentary from the model": "搜索结果和/或模型的文本评论",
    "Time taken to complete the search operation": "完成搜索操作的耗时",
    
    # BriefTool
    "The message for the user. Supports markdown formatting.": "给用户的消息。支持 markdown 格式。",
    "The message": "消息",
    "Resolved attachment metadata": "已解析的附件元数据",
    
    # TaskGetTool
    "The ID of the task to retrieve": "要获取的任务 ID",
    
    # TaskStopTool
    "The command or description of the stopped task": "已停止任务的命令或描述",
    
    # TaskUpdateTool
    "Task IDs that this task blocks": "此任务阻塞的任务 ID",
    "Task IDs that block this task": "阻塞此任务的任务 ID",
    
    # TaskListTool
    "Task identifier (use with TaskGet, TaskUpdate)": "任务标识符（与 TaskGet、TaskUpdate 一起使用）",
    
    # ReadMcpResourceTool
    "The MCP server name": "MCP 服务器名称",
    "The resource URI to read": "要读取的资源 URI",
    "Resource URI": "资源 URI",
    "MIME type of the content": "内容的 MIME 类型",
    "Text content of the resource": "资源的文本内容",
    "Path where binary blob content was saved": "二进制内容保存的路径",
    
    # ListMcpResourcesTool
    "Optional server name to filter resources by": "可选的服务器名称用于过滤资源",
    "Resource URI": "资源 URI",
    "Resource name": "资源名称",
    "MIME type of the resource": "资源的 MIME 类型",
    "Resource description": "资源描述",
    "Server that provides this resource": "提供此资源的服务器",
    
    # ConfigTool
    "The new value. Omit to get current value.": "新值。省略则获取当前值。",
    
    # SkillTool
    "Tools allowed by this skill": "此技能允许使用的工具",
    "Model override if specified": "模型覆盖（如果指定）",
    "Execution status": "执行状态",
    "The ID of the sub-agent that executed the skill": "执行技能的子代理 ID",
    "The result from the forked skill execution": "分支技能执行的结果",
    
    # RemoteTriggerTool
    "Required for get, update, and run": "get、update 和 run 操作必需",
    "JSON body for create and update": "create 和 update 操作的 JSON 请求体",
    
    # ScheduleCronTool
    "The prompt to enqueue at each fire time.": "每次触发时入队的提示。",
    
    # CronDeleteTool
    "Job ID returned by CronCreate.": "CronCreate 返回的任务 ID。",
    
    # EnterPlanModeTool
    "Confirmation that plan mode was entered": "确认已进入计划模式",
    
    # ExitPlanModeTool
    "The tool this prompt applies to": "此提示适用的工具",
    "The plan content (injected by normalizeToolInput from disk)": "计划内容（由 normalizeToolInput 从磁盘注入）",
    "The plan file path (injected by normalizeToolInput)": "计划文件路径（由 normalizeToolInput 注入）",
    "The plan that was presented to the user": "呈现给用户的计划",
    "The file path where the plan was saved": "计划保存的文件路径",
    "Whether the Agent tool is available in the current context": "当前上下文中 Agent 工具是否可用",
    "Unique identifier for the plan approval request": "计划审批请求的唯一标识符",
    
    # NotebookEditTool
    "The original notebook content before modification": "修改前的原始笔记本内容",
    "The updated notebook content after modification": "修改后的更新笔记本内容",
    
    # BriefTool
    "The message for the user. Supports markdown formatting.": "给用户的消息。支持 markdown 格式。",
}

def fix_file(file_path):
    """修复单个文件中的英文 describe"""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        original = content
        count = 0
        
        for eng, chi in REPLACEMENTS.items():
            # 匹配 .describe('英文') 或 .describe("英文")
            pattern1 = r"\.describe\('" + re.escape(eng) + r"'\)"
            pattern2 = r'\.describe\("' + re.escape(eng) + r'"\)'
            
            replacement1 = f".describe('{chi}')"
            replacement2 = f'.describe("{chi}")'
            
            if re.search(pattern1, content) or re.search(pattern2, content):
                content = re.sub(pattern1, replacement1, content)
                content = re.sub(pattern2, replacement2, content)
                count += 1
        
        if count > 0:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return count
        return 0
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return 0

# 查找所有 tools 目录下的 .ts 文件
tools_dir = 'src/tools'
fixed_count = 0
file_count = 0

for root, dirs, files in os.walk(tools_dir):
    for file in files:
        if file.endswith('.ts'):
            file_path = os.path.join(root, file)
            count = fix_file(file_path)
            if count > 0:
                file_count += 1
                fixed_count += count
                print(f"Fixed {count} describes in {file_path}")

print(f"\nTotal: Fixed {fixed_count} describes in {file_count} files")
