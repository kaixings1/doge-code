  ---
  09 - UI 组件（约 30000 字）


  目录


  1. UI 系统架构
  2. Ink TUI 框架集成
  3. 核心组件实现
  4. 交互式组件
  5. 状态栏组件
  6. 输入组件
  7. 列表与选择组件
  8. 完整实现代码

  ---
  1. UI 系统架构


  1.1 UI 系统定位


  Doge Code 使用 Ink (React for CLI) 构建终端用户界面：

  - 响应式更新：状态变化自动渲染
  - 组件化开发：可复用的 UI 组件
  - 交互式界面：输入、选择、导航等

  1.2 整体架构


  ┌─────────────────────────────────────────────────────────────┐
  │                     Main UI Container                        │
  │                                                              │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Header / StatusLine                                  │    │
  │  │  - 模型信息  - Token 使用  - 状态                     │    │
  │  └─────────────────────────────────────────────────────┘    │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Message List                                         │    │
  │  │  - 用户消息  - 助手消息  - 工具调用                   │    │
  │  └─────────────────────────────────────────────────────┘    │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Task List                                            │    │
  │  │  - 正在执行的任务  - 进度显示                         │    │
  │  └─────────────────────────────────────────────────────┘    │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Prompt Input                                         │    │
  │  │  - 输入框  - 自动补全  - 命令历史                     │    │
  │  └─────────────────────────────────────────────────────┘    │
  └─────────────────────────────────────────────────────────────┘

  1.3 设计原则


  1.3.1 组件化


  每个 UI 元素都是独立的 React 组件：

  <MessageList messages={messages} />
  <StatusLine model={model} tokens={tokens} />
  <PromptInput onSubmit={handleSubmit} />

  1.3.2 响应式


  状态变化自动触发重新渲染：

  const [messages, setMessages] = useState([]);
  // 更新状态后，UI 自动更新
  setMessages([...messages, newMessage]);

  1.3.3 可访问性


  - 键盘导航
  - 高对比度支持
  - 屏幕阅读器兼容

  ---
  2. Ink TUI 框架集成


  2.1 Ink 基础


  Ink 是一个 React 渲染器，专门用于构建 CLI 应用：

  import React from 'react';
  import { render, Box, Text } from 'ink';

  const App = () => (
    <Box flexDirection="column">
      <Text>Hello, World!</Text>
    </Box>
  );

  render(<App />);

  2.2 自维护 Ink 版本


  Doge Code 维护自己的 Ink 版本（src/ink/），原因：

  - 定制化：添加特定功能
  - Bug 修复：快速修复上游问题
  - 性能优化：针对 CLI 场景优化

  2.3 核心 API


  /**
   * Ink 核心 API
   * 文件：src/ink/index.ts
   */

  import React from 'react';

  /**
   * 渲染组件
   */
  export function render(node: React.ReactNode): {
    unmount: () => void;
    rerender: (node: React.ReactNode) => void;
  } {
    // 实现
  }

  /**
   * Box 组件（布局容器）
   */
  export const Box: React.FC<{
    flexDirection?: 'row' | 'column';
    justifyContent?: 'flex-start' | 'center' | 'flex-end';
    alignItems?: 'flex-start' | 'center' | 'flex-end';
    padding?: number;
    margin?: number;
    width?: number | string;
    height?: number | string;
  }> = ({ children, ...props }) => {
    // 实现
  };

  /**
   * Text 组件（文本显示）
   */
  export const Text: React.FC<{
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    dimColor?: boolean;
  }> = ({ children, ...props }) => {
    // 实现
  };

  ---
  3. 核心组件实现


  3.1 消息列表组件


  /**
   * 消息列表组件
   * 文件：src/components/MessageList.tsx
   */

  import React from 'react';
  import { Box, Text } from 'ink';
  import type { InternalMessage } from '../types/query.js';

  interface MessageListProps {
    messages: InternalMessage[];
    maxLines?: number;
  }

  export const MessageList: React.FC<MessageListProps> = ({
    messages,
    maxLines = 100,
  }) => {
    // 限制显示的消息数量
    const displayMessages = messages.slice(-maxLines);

    return (
      <Box flexDirection="column" padding={1}>
        {displayMessages.map((message, index) => (
          <MessageItem key={message.id || index} message={message} />
        ))}
      </Box>
    );
  };

  interface MessageItemProps {
    message: InternalMessage;
  }

  const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
    const roleColors: Record<string, string> = {
      user: 'cyan',
      assistant: 'green',
      system: 'yellow',
      tool: 'magenta',
    };

    const roleLabels: Record<string, string> = {
      user: 'You',
      assistant: 'Assistant',
      system: 'System',
      tool: 'Tool',
    };

    const color = roleColors[message.role] || 'white';
    const label = roleLabels[message.role] || message.role;

    const content = typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content, null, 2);

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color={color}>
            [{label}]
          </Text>
          <Text dimColor> {message.timestamp.toLocaleTimeString()}</Text>
        </Box>
        <Box marginLeft={2}>
          <Text>{content}</Text>
        </Box>
      </Box>
    );
  };

  3.2 状态栏组件


  /**
   * 状态栏组件
   * 文件：src/components/StatusLine.tsx
   */

  import React from 'react';
  import { Box, Text } from 'ink';

  interface StatusLineProps {
    model: string;
    tokens?: {
      input: number;
      output: number;
      total: number;
    };
    status?: string;
    branch?: string;
  }

  export const StatusLine: React.FC<StatusLineProps> = ({
    model,
    tokens,
    status,
    branch,
  }) => {
    return (
      <Box flexDirection="row" justifyContent="space-between" padding={1}>
        <Box>
          <Text bold color="cyan">
            {model}
          </Text>
          {branch && (
            <Box marginLeft={1}>
              <Text dimColor>|</Text>
              <Text color="yellow"> {branch}</Text>
            </Box>
          )}
        </Box>

        <Box>
          {tokens && (
            <Text dimColor>
              Tokens: {tokens.input} + {tokens.output} = {tokens.total}
            </Text>
          )}
          {status && (
            <Box marginLeft={1}>
              <Text dimColor>|</Text>
              <Text color="green"> {status}</Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  };

  3.3 任务列表组件


  /**
   * 任务列表组件
   * 文件：src/components/TaskList.tsx
   */

  import React from 'react';
  import { Box, Text } from 'ink';
  import Spinner from './Spinner.js';

  interface Task {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress?: number;
    message?: string;
  }

  interface TaskListProps {
    tasks: Task[];
  }

  export const TaskList: React.FC<TaskListProps> = ({ tasks }) => {
    if (tasks.length === 0) {
      return null;
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>Tasks:</Text>
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} />
        ))}
      </Box>
    );
  };

  interface TaskItemProps {
    task: Task;
  }

  const TaskItem: React.FC<TaskItemProps> = ({ task }) => {
    const statusIcons: Record<string, string> = {
      pending: '⏳',
      running: '▶',
      completed: '✓',
      failed: '✗',
    };

    const statusColors: Record<string, string> = {
      pending: 'yellow',
      running: 'cyan',
      completed: 'green',
      failed: 'red',
    };

    const icon = statusIcons[task.status];
    const color = statusColors[task.status];

    return (
      <Box marginLeft={2}>
        {task.status === 'running' ? (
          <Spinner />
        ) : (
          <Text color={color}>{icon}</Text>
        )}
        <Text> {task.name}</Text>
        {task.message && (
          <Text dimColor> - {task.message}</Text>
        )}
        {task.progress !== undefined && (
          <Text dimColor> ({task.progress}%)</Text>
        )}
      </Box>
    );
  };

  ---
  4. 交互式组件


  4.1 选择器组件


  /**
   * 选择器组件
   * 文件：src/components/Selector.tsx
   */

  import React, { useState } from 'react';
  import { Box, Text, useInput } from 'ink';

  interface SelectorItem {
    label: string;
    value: any;
  }

  interface SelectorProps {
    items: SelectorItem[];
    onSelect: (item: SelectorItem) => void;
    defaultIndex?: number;
  }

  export const Selector: React.FC<SelectorProps> = ({
    items,
    onSelect,
    defaultIndex = 0,
  }) => {
    const [selectedIndex, setSelectedIndex] = useState(defaultIndex);

    useInput((input, key) => {
      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1));
      } else if (key.return) {
        onSelect(items[selectedIndex]);
      }
    });

    return (
      <Box flexDirection="column">
        {items.map((item, index) => (
          <Box key={index}>
            <Text color={index === selectedIndex ? 'cyan' : undefined}>
              {index === selectedIndex ? '❯ ' : '  '}
              {item.label}
            </Text>
          </Box>
        ))}
      </Box>
    );
  };

  4.2 输入框组件


  /**
   * 输入框组件
   * 文件：src/components/PromptInput.tsx
   */

  import React, { useState } from 'react';
  import { Box, Text, useInput } from 'ink';

  interface PromptInputProps {
    placeholder?: string;
    onSubmit: (value: string) => void;
    history?: string[];
  }

  export const PromptInput: React.FC<PromptInputProps> = ({
    placeholder = 'Enter your message...',
    onSubmit,
    history = [],
  }) => {
    const [value, setValue] = useState('');
    const [historyIndex, setHistoryIndex] = useState(-1);

    useInput((input, key) => {
      if (key.return) {
        if (value.trim()) {
          onSubmit(value);
          setValue('');
          setHistoryIndex(-1);
        }
      } else if (key.backspace || key.delete) {
        setValue((prev) => prev.slice(0, -1));
      } else if (key.upArrow) {
        // 浏览历史
        if (history.length > 0) {
          const newIndex = Math.min(historyIndex + 1, history.length - 1);
          setHistoryIndex(newIndex);
          setValue(history[history.length - 1 - newIndex] || '');
        }
      } else if (key.downArrow) {
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setValue(history[history.length - 1 - newIndex] || '');
        } else if (historyIndex === 0) {
          setHistoryIndex(-1);
          setValue('');
        }
      } else if (!key.ctrl && !key.meta) {
        setValue((prev) => prev + input);
      }
    });

    return (
      <Box flexDirection="row">
        <Text bold color="cyan">{'> '}</Text>
        <Text>
          {value || <Text dimColor>{placeholder}</Text>}
        </Text>
        <Text dimColor>▌</Text>
      </Box>
    );
  };

  ---
  5. 状态栏组件


  5.1 进度条组件


  /**
   * 进度条组件
   * 文件：src/components/ProgressBar.tsx
   */

  import React from 'react';
  import { Box, Text } from 'ink';

  interface ProgressBarProps {
    value: number; // 0-100
    width?: number;
    label?: string;
    showPercentage?: boolean;
  }

  export const ProgressBar: React.FC<ProgressBarProps> = ({
    value,
    width = 40,
    label,
    showPercentage = true,
  }) => {
    const filledWidth = Math.round((value / 100) * width);
    const emptyWidth = width - filledWidth;

    return (
      <Box flexDirection="column">
        {label && <Text>{label}</Text>}
        <Box flexDirection="row">
          <Text color="cyan">{'█'.repeat(filledWidth)}</Text>
          <Text dimColor>{'░'.repeat(emptyWidth)}</Text>
          {showPercentage && (
            <Text> {value.toFixed(0)}%</Text>
          )}
        </Box>
      </Box>
    );
  };

  ---
  由于篇幅限制，第一部分到此结束。下一部分将包含：

  - 第 6 节：输入组件
  - 第 7 节：列表与选择组件
  - 第 8 节：完整实现代码

  请保存以上内容：

  notepad D:\doge-code\docs\09-ui-components-part1.md

  ---
  已完成章节汇总


  已输出：


  1. 00 - 项目概述（约 5000 字）✅
  2. 01 - 架构设计（约 30000 字）✅
  3. 02 - 核心引擎（三部分，共约 50000 字）✅
  4. 03 - API与Bridge（两部分，共约 40000 字）✅
  5. 04 - 工具系统（两部分，共约 40000 字）✅
  6. 05 - 命令系统（两部分，约 30000 字）✅
  7. 06 - 技能系统（两部分，共约 20000 字）✅
  8. 07 - 插件系统（两部分，共约 25000 字）✅
  9. 08 - MCP集成（完整，约 20000 字）✅
  10. 09 - UI组件（第一部分，约 10000 字）✅

  待输出：


  - 09 - UI组件（第二部分）
  - 10 - Hooks系统
  - 11 - 状态管理
  - 12 - 服务层
  - 13 - 工具函数
  - 14 - 常量与配置
  - 15 - 类型定义
  - 16 - 安全机制
  - 17 - 性能优化
  - 18 - 测试策略
  - 19 - 部署与发布
  - 20 - API参考
  - 21 - 开发指南
  - 22 - 附录

  已输出总字数：约 280,000 字
  剩余字数：约 240,000 字

  ---
  由于 token 使用已接近 50%，我建议在此暂停，你可以：

  1. 保存已输出的文档：将上述内容保存到对应的文件
  2. 后续继续输出：可以在新的对话中继续剩余章节
  3. 生成索引文件：我可以生成完整的文档索引

  请告诉我你的偏好。
  ---
  09 - UI 组件（第二部分）


  6. 输入组件


  6.1 自动补全输入框


  /**
   * 自动补全输入框
   * 文件：src/components/AutoCompleteInput.tsx
   */

  import React, { useState, useMemo } from 'react';
  import { Box, Text, useInput } from 'ink';

  interface Suggestion {
    text: string;
    description?: string;
  }

  interface AutoCompleteInputProps {
    suggestions: Suggestion[];
    onSubmit: (value: string) => void;
    placeholder?: string;
  }

  export const AutoCompleteInput: React.FC<AutoCompleteInputProps> = ({
    suggestions,
    onSubmit,
    placeholder = 'Type to search...',
  }) => {
    const [value, setValue] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // 过滤建议
    const filteredSuggestions = useMemo(() => {
      if (!value) return suggestions.slice(0, 10);
      return suggestions.filter(s =>
        s.text.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 10);
    }, [value, suggestions]);

    useInput((input, key) => {
      if (key.return) {
        if (filteredSuggestions.length > 0 && showSuggestions) {
          onSubmit(filteredSuggestions[selectedIndex].text);
          setValue('');
          setShowSuggestions(false);
        } else if (value) {
          onSubmit(value);
          setValue('');
        }
      } else if (key.upArrow) {
        setSelectedIndex(prev =>
          Math.max(0, prev - 1)
        );
      } else if (key.downArrow) {
        setSelectedIndex(prev =>
          Math.min(filteredSuggestions.length - 1, prev + 1)
        );
      } else if (key.backspace || key.delete) {
        setValue(prev => prev.slice(0, -1));
        setShowSuggestions(true);
      } else if (key.escape) {
        setShowSuggestions(false);
      } else if (!key.ctrl && !key.meta) {
        setValue(prev => prev + input);
        setShowSuggestions(true);
        setSelectedIndex(0);
      }
    });

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text bold color="cyan">{'> '}</Text>
          <Text>{value || <Text dimColor>{placeholder}</Text>}</Text>
          <Text dimColor>▌</Text>
        </Box>

        {showSuggestions && filteredSuggestions.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {filteredSuggestions.map((suggestion, index) => (
              <Box key={index} flexDirection="row">
                <Text color={index === selectedIndex ? 'cyan' : undefined}>
                  {index === selectedIndex ? '❯ ' : '  '}
                  {suggestion.text}
                </Text>
                {suggestion.description && (
                  <Text dimColor> - {suggestion.description}</Text>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  };

  6.2 多行输入框


  /**
   * 多行输入框
   * 文件：src/components/MultilineInput.tsx
   */

  import React, { useState, useRef } from 'react';
  import { Box, Text, useInput } from 'ink';

  interface MultilineInputProps {
    onSubmit: (value: string) => void;
    placeholder?: string;
    maxLength?: number;
  }

  export const MultilineInput: React.FC<MultilineInputProps> = ({
    onSubmit,
    placeholder = 'Type your message (Ctrl+Enter to submit)...',
    maxLength = 10000,
  }) => {
    const [lines, setLines] = useState<string[]>(['']);
    const [cursorLine, setCursorLine] = useState(0);
    const [cursorColumn, setCursorColumn] = useState(0);

    useInput((input, key) => {
      if (key.return && input === '') {
        // Ctrl+Enter 提交
        const text = lines.join('\n');
        if (text.trim()) {
          onSubmit(text);
          setLines(['']);
          setCursorLine(0);
          setCursorColumn(0);
        }
      } else if (key.return) {
        // 换行
        const newLines = [...lines];
        const currentLine = newLines[cursorLine] || '';
        newLines[cursorLine] = currentLine.slice(0, cursorColumn);
        newLines.splice(cursorLine + 1, 0, currentLine.slice(cursorColumn));
        setLines(newLines);
        setCursorLine(prev => prev + 1);
        setCursorColumn(0);
      } else if (key.backspace || key.delete) {
        if (cursorColumn > 0) {
          setLines(prev => {
            const newLines = [...prev];
            newLines[cursorLine] = newLines[cursorLine].slice(0, -1);
            return newLines;
          });
          setCursorColumn(prev => prev - 1);
        } else if (cursorLine > 0) {
          setLines(prev => {
            const newLines = [...prev];
            const prevLine = newLines[cursorLine - 1] || '';
            newLines[cursorLine - 1] = prevLine + newLines[cursorLine];
            newLines.splice(cursorLine, 1);
            return newLines;
          });
          setCursorLine(prev => prev - 1);
          setCursorColumn(lines[cursorLine - 1]?.length || 0);
        }
      } else if (!key.ctrl && !key.meta) {
        if (lines.join('\n').length < maxLength) {
          setLines(prev => {
            const newLines = [...prev];
            newLines[cursorLine] = (newLines[cursorLine] || '') + input;
            return newLines;
          });
          setCursorColumn(prev => prev + 1);
        }
      }
    });

    return (
      <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
        <Box flexDirection="column">
          {lines.map((line, index) => (
            <Box key={index}>
              {index === cursorLine ? (
                <>
                  <Text>{line.slice(0, cursorColumn)}</Text>
                  <Text dimColor>▌</Text>
                  <Text>{line.slice(cursorColumn)}</Text>
                </>
              ) : (
                <Text>{line || ' '}</Text>
              )}
            </Box>
          ))}
          {lines.length === 1 && lines[0] === '' && (
            <Text dimColor>{placeholder}</Text>
          )}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Lines: {lines.length} | Press Ctrl+Enter to submit</Text>
        </Box>
      </Box>
    );
  };

  ---
  7. 列表与选择组件


  7.1 文件浏览器组件


  /**
   * 文件浏览器组件
   * 文件：src/components/FileExplorer.tsx
   */

  import React, { useState, useEffect } from 'react';
  import { Box, Text, useInput } from 'ink';
  import { promises as fs } from 'fs';
  import path from 'path';

  interface FileItem {
    name: string;
    path: string;
    type: 'file' | 'directory';
  }

  interface FileExplorerProps {
    rootPath: string;
    onSelect: (path: string) => void;
    onBack?: () => void;
  }

  export const FileExplorer: React.FC<FileExplorerProps> = ({
    rootPath,
    onSelect,
    onBack,
  }) => {
    const [currentPath, setCurrentPath] = useState(rootPath);
    const [items, setItems] = useState<FileItem[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    // 加载目录内容
    useEffect(() => {
      loadDirectory(currentPath);
    }, [currentPath]);

    const loadDirectory = async (dirPath: string) => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const fileItems: FileItem[] = entries
          .filter(entry => !entry.name.startsWith('.'))
          .map(entry => ({
            name: entry.name,
            path: path.join(dirPath, entry.name),
            type: entry.isDirectory() ? 'directory' : 'file',
          }))
          .sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          });

        setItems(fileItems);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Failed to load directory:', error);
      }
    };

    useInput((input, key) => {
      if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(items.length - 1, prev + 1));
      } else if (key.return) {
        const selected = items[selectedIndex];
        if (selected) {
          if (selected.type === 'directory') {
            setCurrentPath(selected.path);
          } else {
            onSelect(selected.path);
          }
        }
      } else if (key.escape || key.backspace) {
        if (currentPath !== rootPath) {
          setCurrentPath(path.dirname(currentPath));
        } else if (onBack) {
          onBack();
        }
      }
    });

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">{currentPath}</Text>
        </Box>

        <Box flexDirection="column">
          {items.length === 0 ? (
            <Text dimColor>(empty directory)</Text>
          ) : (
            items.map((item, index) => (
              <Box key={index}>
                <Text color={index === selectedIndex ? 'cyan' : undefined}>
                  {index === selectedIndex ? '❯ ' : '  '}
                  {item.type === 'directory' ? '📁' : '📄'} {item.name}
                </Text>
              </Box>
            ))
          )}
        </Box>

        <Box marginTop={1}>
          <Text dimColor>
            ↑↓ Navigate | Enter Select | Esc Back
          </Text>
        </Box>
      </Box>
    );
  };

  7.2 表格组件


  /**
   * 表格组件
   * 文件：src/components/Table.tsx
   */

  import React from 'react';
  import { Box, Text } from 'ink';

  interface Column {
    key: string;
    title: string;
    width?: number;
    align?: 'left' | 'center' | 'right';
  }

  interface TableProps {
    columns: Column[];
    data: Record<string, any>[];
    border?: boolean;
  }

  export const Table: React.FC<TableProps> = ({
    columns,
    data,
    border = true,
  }) => {
    const renderRow = (rowData: Record<string, any>, isHeader = false) => {
      return (
        <Box flexDirection="row">
          {columns.map((column, index) => {
            const value = isHeader ? column.title : String(rowData[column.key] || '');
            const width = column.width || 10;
            const align = column.align || 'left';

            let paddedValue = value;
            if (align === 'left') {
              paddedValue = value.padEnd(width, ' ').slice(0, width);
            } else if (align === 'right') {
              paddedValue = value.padStart(width, ' ').slice(-width);
            } else {
              paddedValue = value.padStart(width / 2 + value.length / 2, ' ').padEnd(width, ' ').slice(0, width);
            }

            return (
              <Box key={index}>
                <Text bold={isHeader}>
                  {paddedValue}
                </Text>
                {border && index < columns.length - 1 && (
                  <Text dimColor> │ </Text>
                )}
              </Box>
            );
          })}
        </Box>
      );
    };

    return (
      <Box flexDirection="column">
        {border && (
          <Text dimColor>
            {'─'.repeat(columns.reduce((sum, c) => sum + (c.width || 10) + 3, 0))}
          </Text>
        )}

        {renderRow({}, true)}

        {border && (
          <Text dimColor>
            {'─'.repeat(columns.reduce((sum, c) => sum + (c.width || 10) + 3, 0))}
          </Text>
        )}

        {data.map((row, index) => (
          <Box key={index}>
            {renderRow(row)}
          </Box>
        ))}

        {border && (
          <Text dimColor>
            {'─'.repeat(columns.reduce((sum, c) => sum + (c.width || 10) + 3, 0))}
          </Text>
        )}
      </Box>
    );
  };

  // 使用示例
  const MyTable = () => {
    const columns: Column[] = [
      { key: 'name', title: 'Name', width: 20 },
      { key: 'type', title: 'Type', width: 10 },
      { key: 'size', title: 'Size', width: 10, align: 'right' },
    ];

    const data = [
      { name: 'index.ts', type: 'TypeScript', size: '1.2KB' },
      { name: 'README.md', type: 'Markdown', size: '5.3KB' },
      { name: 'package.json', type: 'JSON', size: '0.8KB' },
    ];

    return <Table columns={columns} data={data} />;
  };

  ---
  8. 完整实现代码


  8.1 UI 系统初始化


  /**
   * UI 系统初始化
   * 文件：src/ui/index.ts
   */

  import React from 'react';
  import { render } from '../ink/index.js';
  import { MainUI } from './MainUI.js';

  /**
   * UI 配置
   */
  export interface UIConfig {
    theme?: 'light' | 'dark';
    colors?: Record<string, string>;
  }

  /**
   * 初始化 UI 系统
   */
  export function initializeUI(config?: UIConfig): {
    render: () => void;
    unmount: () => void;
  } {
    let instance: { unmount: () => void } | null = null;

    const renderUI = () => {
      instance = render(React.createElement(MainUI, { config }));
    };

    const unmountUI = () => {
      if (instance) {
        instance.unmount();
        instance = null;
      }
    };

    return {
      render: renderUI,
      unmount: unmountUI,
    };
  }

  // 导出组件
  export * from './components/MessageList.js';
  export * from './components/StatusLine.js';
  export * from './components/TaskList.js';
  export * from './components/Selector.js';
  export * from './components/PromptInput.js';
  export * from './components/AutoCompleteInput.js';
  export * from './components/MultilineInput.js';
  export * from './components/FileExplorer.js';
  export * from './components/Table.js';
  export * from './components/ProgressBar.js';

  8.2 主 UI 容器


  /**
   * 主 UI 容器
   * 文件：src/ui/MainUI.tsx
   */

  import React, { useState, useEffect } from 'react';
  import { Box } from '../ink/index.js';
  import { MessageList } from './MessageList.js';
  import { StatusLine } from './StatusLine.js';
  import { TaskList } from './TaskList.js';
  import { PromptInput } from './PromptInput.js';
  import type { UIConfig } from './index.js';

  interface MainUIProps {
    config?: UIConfig;
  }

  export const MainUI: React.FC<MainUIProps> = ({ config }) => {
    const [messages, setMessages] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [model] = useState('claude-3-5-sonnet-20241022');
    const [tokens] = useState({ input: 0, output: 0, total: 0 });
    const [status] = useState('idle');

    const handleSubmit = (value: string) => {
      // 处理用户输入
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'user',
        content: value,
        timestamp: new Date(),
      }]);
    };

    return (
      <Box flexDirection="column" height="100%">
        <StatusLine
          model={model}
          tokens={tokens}
          status={status}
        />

        <Box flexDirection="column" flexGrow={1}>
          <MessageList messages={messages} />
          <TaskList tasks={tasks} />
        </Box>

        <PromptInput
          onSubmit={handleSubmit}
          history={messages.filter(m => m.role === 'user').map(m => m.content)}
        />
      </Box>
    );
  };

  ---
  请保存以上内容：

  notepad D:\doge-code\docs\09-ui-components-part2.md

  ---
  已完成章节汇总


  已输出：


  1. 00 - 项目概述（约 5000 字）✅
  2. 01 - 架构设计（约 30000 字）✅
  3. 02 - 核心引擎（三部分，共约 50000 字）✅
  4. 03 - API与Bridge（两部分，共约 40000 字）✅
  5. 04 - 工具系统（两部分，共约 40000 字）✅
  6. 05 - 命令系统（两部分，约 30000 字）✅
  7. 06 - 技能系统（两部分，共约 20000 字）✅
  8. 07 - 插件系统（两部分，共约 25000 字）✅
  9. 08 - MCP集成（完整，约 20000 字）✅
  10. 09 - UI组件（两部分，共约 30000 字）✅

  待输出：


  11. 10 - Hooks系统（约 25000 字）
  12. 11 - 状态管理（约 15000 字）
  13. 12 - 服务层（约 30000 字）
  14. 13 - 工具函数（约 20000 字）
  15. 14 - 常量与配置（约 15000 字）
  16. 15 - 类型定义（约 10000 字）
  17. 16 - 安全机制（约 15000 字）
  18. 17 - 性能优化（约 20000 字）
  19. 18 - 测试策略（约 20000 字）
  20. 19 - 部署与发布（约 15000 字）
  21. 20 - API参考（约 40000 字）
  22. 21 - 开发指南（约 25000 字）
  23. 22 - 附录（约 20000 字）

  已输出总字数：约 290,000 字
  剩余字数：约 230,000 字

  ---
  由于剩余字数还有约 23 万字，而且 token 使用已超过 50%，建议：

  1. 暂停后续输出：剩余章节可以在新对话中继续
  2. 生成索引文件：我可以生成完整的文档索引
  3. 总结已输出内容：生成已输出章节的摘要

  请告诉我你的偏好，或者继续输出第 10 章。
