// Backfill sessions - retrieve and restore historical session data
import type { Command, LocalCommandCall } from '../../types/command.js';
import fs from 'fs';
import path from 'path';

const SESSION_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.doge', 'sessions');

interface SessionInfo {
  id: string;
  name: string;
  timestamp: string;
  messageCount: number;
  size: number;
  isEmpty: boolean;
}

const call: LocalCommandCall = async (args: string) => {
  const action = (args || '').trim().toLowerCase();

  if (action === 'help' || action === '') {
    return {
      type: 'text' as const,
      value: [
        '💾 会话回填工具',
        '',
        '用法:',
        ' /backfill-sessions list - 列出所有会话',
        ' /backfill-sessions stats - 显示统计信息',
        ' /backfill-sessions search <keyword> - 搜索会话',
        ' /backfill-sessions find-empty - 查找空会话',
        ' /backfill-sessions cleanup - 清理无效会话',
        ' /backfill-sessions restore <id> - 恢复指定会话',
        ' /backfill-sessions backup - 备份当前会话',
        '',
        '示例:',
        ' /backfill-sessions list',
        ' /backfill-sessions search "error"',
        ' /backfill-sessions restore 123456'
      ].join('\n')
    };
  }

  try {
    if (action === 'list') {
      return await listSessions();
    }

    if (action === 'stats') {
      return await showStats();
    }

    if (action.startsWith('search ')) {
      const keyword = action.replace(/^search\s+/, '').trim();
      return await searchSessions(keyword);
    }

    if (action === 'find-empty') {
      return await findEmptySessions();
    }

    if (action === 'cleanup') {
      return await cleanupSessions();
    }

    if (action.startsWith('restore ')) {
      const sessionId = action.replace(/^restore\s+/, '').trim();
      return await restoreSession(sessionId);
    }

    if (action === 'backup') {
      return await backupCurrentSession();
    }

    return {
      type: 'text' as const,
      value: `未知命令: ${action}\n使用 /backfill-sessions help 查看帮助。`
    };
  } catch (error) {
    return {
      type: 'text' as const,
      value: `执行命令时出错: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

async function listSessions(): Promise<ReturnType<typeof call>> {
  try {
    if (!fs.existsSync(SESSION_DIR)) {
      return {
        type: 'text' as const,
        value: '会话目录不存在。'
      };
    }

    const files = fs.readdirSync(SESSION_DIR)
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => fs.statSync(path.join(SESSION_DIR, b)).mtime.getTime() -
                     fs.statSync(path.join(SESSION_DIR, a)).mtime.getTime());

    if (files.length === 0) {
      return {
        type: 'text' as const,
        value: '没有找到会话文件。'
      };
    }

    const sessions: SessionInfo[] = [];
    for (const file of files.slice(0, 20)) {
      const filePath = path.join(SESSION_DIR, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        const stats = fs.statSync(filePath);

        sessions.push({
          id: file.replace('.json', ''),
          name: data.name || '未命名会话',
          timestamp: stats.mtime.toISOString(),
          messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
          size: stats.size,
          isEmpty: !Array.isArray(data.messages) || data.messages.length === 0
        });
      } catch (e) {
        // 跳过无法解析的文件
      }
    }

    const lines = ['📋 会话列表', ''];
    for (const session of sessions) {
      const status = session.isEmpty ? '⚪' : '🟢';
      const sizeKB = (session.size / 1024).toFixed(1);
      const date = new Date(session.timestamp).toLocaleDateString('zh-CN');
      lines.push(`${status} ${session.id} - ${session.name}`);
      lines.push(`   消息: ${session.messageCount} | 大小: ${sizeKB}KB | 时间: ${date}`);
    }

    if (files.length > 20) {
      lines.push(`\n...还有 ${files.length - 20} 个会话未显示`);
    }

    return {
      type: 'text' as const,
      value: lines.join('\n')
    };
  } catch (error) {
    return {
      type: 'text' as const,
      value: `列出会话时出错: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function showStats(): Promise<ReturnType<typeof call>> {
  try {
    if (!fs.existsSync(SESSION_DIR)) {
      return {
        type: 'text' as const,
        value: '会话目录不存在。'
      };
    }

    const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));
    let totalSize = 0;
    let totalMessages = 0;
    let emptyCount = 0;
    const sessionsByDate: Record<string, number> = {};

    for (const file of files) {
      const filePath = path.join(SESSION_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        totalSize += stats.size;

        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        const messageCount = Array.isArray(data.messages) ? data.messages.length : 0;
        totalMessages += messageCount;

        if (messageCount === 0) {
          emptyCount++;
        }

        const date = stats.mtime.toISOString().split('T')[0];
        sessionsByDate[date] = (sessionsByDate[date] || 0) + 1;
      } catch (e) {
        // 跳过无法解析的文件
      }
    }

    const recentDates = Object.keys(sessionsByDate)
      .sort()
      .reverse()
      .slice(0, 5);

    const lines = [
      '📊 会话统计',
      '',
      `会话总数: ${files.length}`,
      `空会话数: ${emptyCount}`,
      `总消息数: ${totalMessages}`,
      `总大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`,
      `平均大小: ${files.length > 0 ? (totalSize / files.length / 1024).toFixed(1) : 0} KB`,
      '',
      '📅 最近创建:'
    ];

    for (const date of recentDates) {
      lines.push(`  ${date}: ${sessionsByDate[date]} 个会话`);
    }

    if (emptyCount > 0) {
      lines.push('\n💡 建议:');
      lines.push(`  使用 /backfill-sessions find-empty 查看空会话`);
      lines.push(`  使用 /backfill-sessions cleanup 清理无效会话`);
    }

    return {
      type: 'text' as const,
      value: lines.join('\n')
    };
  } catch (error) {
    return {
      type: 'text' as const,
      value: `获取统计信息时出错: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function searchSessions(keyword: string): Promise<ReturnType<typeof call>> {
  try {
    if (!keyword) {
      return {
        type: 'text' as const,
        value: '请输入搜索关键词。'
      };
    }

    if (!fs.existsSync(SESSION_DIR)) {
      return {
        type: 'text' as const,
        value: '会话目录不存在。'
      };
    }

    const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));
    const results: Array<{id: string, name: string, match: string}> = [];

    for (const file of files.slice(0, 50)) {
      const filePath = path.join(SESSION_DIR, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);

        // 搜索会话名称
        if (data.name && data.name.toLowerCase().includes(keyword.toLowerCase())) {
          results.push({
            id: file.replace('.json', ''),
            name: data.name,
            match: `名称匹配: ${data.name}`
          });
          continue;
        }

        // 搜索消息内容
        if (Array.isArray(data.messages)) {
          for (const msg of data.messages) {
            if (msg.content && typeof msg.content === 'string' &&
                msg.content.toLowerCase().includes(keyword.toLowerCase())) {
              const preview = msg.content.substring(0, 60).replace(/\n/g, ' ');
              results.push({
                id: file.replace('.json', ''),
                name: data.name || '未命名会话',
                match: `内容匹配: ${preview}...`
              });
              break;
            }
          }
        }
      } catch (e) {
        // 跳过无法解析的文件
      }
    }

    if (results.length === 0) {
      return {
        type: 'text' as const,
        value: `未找到包含 "${keyword}" 的会话。`
      };
    }

    const lines = [` 搜索结果 (${results.length} 个匹配)`, ''];
    for (const result of results.slice(0, 10)) {
      lines.push(`📁 ${result.id} - ${result.name}`);
      lines.push(`   ${result.match}`);
    }

    if (results.length > 10) {
      lines.push(`\n...还有 ${results.length - 10} 个结果未显示`);
    }

    lines.push('\n💡 使用 /backfill-sessions restore <id> 恢复会话');

    return {
      type: 'text' as const,
      value: lines.join('\n')
    };
  } catch (error) {
    return {
      type: 'text' as const,
      value: `搜索会话时出错: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function findEmptySessions(): Promise<ReturnType<typeof call>> {
  try {
    if (!fs.existsSync(SESSION_DIR)) {
      return {
        type: 'text' as const,
        value: '会话目录不存在。'
      };
    }

    const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));
    const emptySessions: Array<{id: string, name: string, size: number, mtime: Date}> = [];

    for (const file of files) {
      const filePath = path.join(SESSION_DIR, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        const stats = fs.statSync(filePath);

        const messageCount = Array.isArray(data.messages) ? data.messages.length : 0;
        if (messageCount === 0) {
          emptySessions.push({
            id: file.replace('.json', ''),
            name: data.name || '未命名会话',
            size: stats.size,
            mtime: stats.mtime
          });
        }
      } catch (e) {
        // 跳过无法解析的文件
      }
    }

    if (emptySessions.length === 0) {
      return {
        type: 'text' as const,
        value: '未找到空会话。'
      };
    }

    const lines = ['⚪ 空会话列表', ''];
    for (const session of emptySessions.slice(0, 15)) {
      const date = session.mtime.toLocaleDateString('zh-CN');
      lines.push(`${session.id} - ${session.name}`);
      lines.push(`   大小: ${session.size} 字节 | 修改时间: ${date}`);
    }

    if (emptySessions.length > 15) {
      lines.push(`\n...还有 ${emptySessions.length - 15} 个空会话`);
    }

    lines.push('\n💡 使用 /backfill-sessions cleanup 清理这些空会话');

    return {
      type: 'text' as const,
      value: lines.join('\n')
    };
  } catch (error) {
    return {
      type: 'text' as const,
      value: `查找空会话时出错: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function cleanupSessions(): Promise<ReturnType<typeof call>> {
  try {
    if (!fs.existsSync(SESSION_DIR)) {
      return {
        type: 'text' as const,
        value: '会话目录不存在。'
      };
    }

    const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));
    let deletedCount = 0;
    let errorCount = 0;

    for (const file of files) {
      const filePath = path.join(SESSION_DIR, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        const messageCount = Array.isArray(data.messages) ? data.messages.length : 0;

        // 删除空会话和损坏的会话
        if (messageCount === 0 || !data.messages) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (e) {
        // 删除无法解析的文件
        try {
          fs.unlinkSync(filePath);
          deletedCount++;
        } catch (unlinkError) {
          errorCount++;
        }
      }
    }

    const lines = ['🧹 会话清理完成', ''];
    lines.push(`删除会话数: ${deletedCount}`);
    if (errorCount > 0) {
      lines.push(`删除失败数: ${errorCount}`);
    }

    if (deletedCount === 0) {
      lines.push('\n💡 没有找到需要清理的会话。');
    } else {
      lines.push('\n 清理完成，释放了存储空间。');
    }

    return {
      type: 'text' as const,
      value: lines.join('\n')
    };
  } catch (error) {
    return {
      type: 'text' as const,
      value: `清理会话时出错: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function restoreSession(sessionId: string): Promise<ReturnType<typeof call>> {
  try {
    if (!sessionId) {
      return {
        type: 'text' as const,
        value: '请输入要恢复的会话ID。'
      };
    }

    const sessionFile = sessionId.endsWith('.json') ? sessionId : `${sessionId}.json`;
    const filePath = path.join(SESSION_DIR, sessionFile);

    if (!fs.existsSync(filePath)) {
      // 尝试匹配部分ID
      const files = fs.existsSync(SESSION_DIR) ?
        fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json') && f.includes(sessionId)) : [];

      if (files.length === 0) {
        return {
          type: 'text' as const,
          value: `未找到会话 "${sessionId}"。`
        };
      }

      if (files.length > 1) {
        const lines = [`找到多个匹配的会话:`, ''];
        for (const file of files.slice(0, 5)) {
          const id = file.replace('.json', '');
          lines.push(`  ${id}`);
        }
        if (files.length > 5) {
          lines.push(`  ...还有 ${files.length - 5} 个`);
        }
        lines.push('\n💡 请使用完整的会话ID。');
        return {
          type: 'text' as const,
          value: lines.join('\n')
        };
      }

      return {
        type: 'text' as const,
        value: `找到会话: ${files[0].replace('.json', '')}\n使用完整ID进行恢复。`
      };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    const stats = fs.statSync(filePath);

    const messageCount = Array.isArray(data.messages) ? data.messages.length : 0;
    const date = stats.mtime.toLocaleString('zh-CN');

    return {
      type: 'text' as const,
      value: [
        ' 会话信息',
        '',
        `会话ID: ${sessionId}`,
        `会话名称: ${data.name || '未命名'}`,
        `消息数量: ${messageCount}`,
        `文件大小: ${stats.size} 字节`,
        `修改时间: ${date}`,
        '',
        '💡 恢复功能需要集成到主应用中。',
        '目前仅提供会话信息查看。'
      ].join('\n')
    };
  } catch (error) {
    return {
      type: 'text' as const,
      value: `恢复会话时出错: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function backupCurrentSession(): Promise<ReturnType<typeof call>> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `backup-${timestamp}`;

    return {
      type: 'text' as const,
      value: [
        '💾 备份功能',
        '',
        `备份ID: ${backupId}`,
        '当前会话备份功能需要集成到主应用中。',
        '',
        '💡 建议:',
        '1. 在主应用中实现会话导出功能',
        '2. 添加自动备份机制',
        '3. 支持增量备份'
      ].join('\n')
    };
  } catch (error) {
    return {
      type: 'text' as const,
      value: `备份会话时出错: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

const backfillSessions = {
  type: 'local',
  name: 'backfill-sessions',
  description: '扫描并恢复历史会话数据到当前工作区',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command;

export default backfillSessions;
