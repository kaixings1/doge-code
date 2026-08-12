import type { LocalJSXCommandCall } from '../../types/command.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import os from 'os';

// 性能测量记录接口
interface PerformanceMetric {
  id: string;
  name: string;
  category: string;
  duration: number; // 毫秒
  timestamp: number;
  metadata?: Record<string, any>;
}

// 性能分析结果
interface PerformanceAnalysis {
  summary: {
    totalMeasurements: number;
    totalDuration: number;
    averageDuration: number;
    fastest: number;
    slowest: number;
    measurementsByCategory: Record<string, number>;
  };
  trends: {
    dailyAverage: number;
    weeklyTrend: 'improving' | 'stable' | 'worsening';
    peakHours: string[];
  };
  bottlenecks: Array<{
    name: string;
    category: string;
    duration: number;
    frequency: number;
    impact: 'high' | 'medium' | 'low';
  }>;
  recommendations: string[];
}

// 性能分析器类
class PerformanceProfiler {
  private metrics: PerformanceMetric[] = [];
  private readonly dataFile: string;
  private readonly maxRecords = 1000;

  constructor() {
    const dataDir = join(os.homedir(), '.doge', 'performance');
    this.dataFile = join(dataDir, 'metrics.json');
    this.ensureDataDir();
    this.loadMetrics();
  }

  private ensureDataDir(): void {
    const dataDir = join(os.homedir(), '.doge', 'performance');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }

  private loadMetrics(): void {
    try {
      if (existsSync(this.dataFile)) {
        const content = readFileSync(this.dataFile, 'utf-8');
        this.metrics = JSON.parse(content);
      }
    } catch (error) {
      console.error('加载性能数据失败:', error);
      this.metrics = [];
    }
  }

  private saveMetrics(): void {
    try {
      writeFileSync(this.dataFile, JSON.stringify(this.metrics, null, 2), 'utf-8');
    } catch (error) {
      console.error('保存性能数据失败:', error);
    }
  }

  // 记录性能指标
  recordMetric(name: string, duration: number, category: string = 'uncategorized', metadata?: Record<string, any>): void {
    const metric: PerformanceMetric = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      category,
      duration,
      timestamp: Date.now(),
      metadata
    };

    this.metrics.push(metric);

    // 限制记录数量
    if (this.metrics.length > this.maxRecords) {
      this.metrics = this.metrics.slice(-this.maxRecords);
    }

    this.saveMetrics();
  }

  // 分析性能数据
  analyzePerformance(): PerformanceAnalysis {
    if (this.metrics.length === 0) {
      return {
        summary: {
          totalMeasurements: 0,
          totalDuration: 0,
          averageDuration: 0,
          fastest: 0,
          slowest: 0,
          measurementsByCategory: {}
        },
        trends: {
          dailyAverage: 0,
          weeklyTrend: 'stable',
          peakHours: []
        },
        bottlenecks: [],
        recommendations: ['暂无性能数据，请先记录性能指标']
      };
    }

    // 计算基本统计
    const durations = this.metrics.map(m => m.duration);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const averageDuration = totalDuration / this.metrics.length;
    const fastest = Math.min(...durations);
    const slowest = Math.max(...durations);

    // 按类别统计
    const measurementsByCategory: Record<string, number> = {};
    this.metrics.forEach(metric => {
      measurementsByCategory[metric.category] = (measurementsByCategory[metric.category] || 0) + 1;
    });

    // 分析趋势
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentMetrics = this.metrics.filter(m => m.timestamp > oneDayAgo);
    const dailyAverage = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length
      : averageDuration;

    // 分析峰值时间
    const hourCounts: Record<number, number> = {};
    this.metrics.forEach(metric => {
      const hour = new Date(metric.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const peakHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => `${hour}:00-${parseInt(hour) + 1}:00`);

    // 识别瓶颈
    const bottlenecks: PerformanceAnalysis['bottlenecks'] = [];

    // 按名称分组
    const metricsByName: Record<string, PerformanceMetric[]> = {};
    this.metrics.forEach(metric => {
      if (!metricsByName[metric.name]) {
        metricsByName[metric.name] = [];
      }
      metricsByName[metric.name].push(metric);
    });

    Object.entries(metricsByName).forEach(([name, metrics]) => {
      if (metrics.length >= 3) { // 至少3次测量
        const avgDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
        const category = metrics[0].category;

        let impact: 'high' | 'medium' | 'low' = 'low';
        if (avgDuration > 1000) impact = 'high';
        else if (avgDuration > 100) impact = 'medium';

        bottlenecks.push({
          name,
          category,
          duration: avgDuration,
          frequency: metrics.length,
          impact
        });
      }
    });

    // 按影响排序
    bottlenecks.sort((a, b) => {
      const impactWeight = { high: 3, medium: 2, low: 1 };
      return (impactWeight[b.impact] * b.duration) - (impactWeight[a.impact] * a.duration);
    });

    // 生成建议
    const recommendations = this.generateRecommendations(
      averageDuration,
      slowest,
      bottlenecks,
      measurementsByCategory
    );

    // 判断趋势
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const oldMetrics = this.metrics.filter(m => m.timestamp < oneWeekAgo && m.timestamp > oneWeekAgo - 24 * 60 * 60 * 1000);
    const oldAverage = oldMetrics.length > 0
      ? oldMetrics.reduce((sum, m) => sum + m.duration, 0) / oldMetrics.length
      : averageDuration;

    let weeklyTrend: 'improving' | 'stable' | 'worsening' = 'stable';
    if (dailyAverage < oldAverage * 0.9) weeklyTrend = 'improving';
    else if (dailyAverage > oldAverage * 1.1) weeklyTrend = 'worsening';

    return {
      summary: {
        totalMeasurements: this.metrics.length,
        totalDuration,
        averageDuration,
        fastest,
        slowest,
        measurementsByCategory
      },
      trends: {
        dailyAverage,
        weeklyTrend,
        peakHours
      },
      bottlenecks: bottlenecks.slice(0, 10), // 只显示前10个瓶颈
      recommendations
    };
  }

  // 生成优化建议
  private generateRecommendations(
    averageDuration: number,
    slowest: number,
    bottlenecks: PerformanceAnalysis['bottlenecks'],
    categoryStats: Record<string, number>
  ): string[] {
    const recommendations: string[] = [];

    // 基于平均时长
    if (averageDuration > 1000) {
      recommendations.push('平均响应时间超过1秒，需要整体性能优化');
    } else if (averageDuration > 500) {
      recommendations.push('平均响应时间超过500毫秒，建议优化');
    }

    // 基于最慢调用
    if (slowest > 5000) {
      recommendations.push(`发现超过5秒的慢调用(${slowest}ms)，需要重点优化`);
    } else if (slowest > 2000) {
      recommendations.push(`发现超过2秒的慢调用(${slowest}ms)，建议优化`);
    }

    // 基于瓶颈
    const highImpactBottlenecks = bottlenecks.filter(b => b.impact === 'high');
    if (highImpactBottlenecks.length > 0) {
      recommendations.push(`发现${highImpactBottlenecks.length}个高影响瓶颈，优先处理`);
    }

    // 基于类别分布
    const apiCalls = categoryStats['api'] || 0;
    const dbCalls = categoryStats['database'] || 0;
    const totalCalls = Object.values(categoryStats).reduce((sum, count) => sum + count, 0);

    if (apiCalls > totalCalls * 0.5) {
      recommendations.push('API调用占比过高，考虑缓存或批量处理');
    }

    if (dbCalls > totalCalls * 0.3) {
      recommendations.push('数据库调用较多，考虑查询优化或缓存');
    }

    // 默认建议
    if (recommendations.length === 0) {
      recommendations.push('性能表现良好，继续保持监控');
      recommendations.push('建议定期进行性能测试');
    }

    return recommendations.slice(0, 5); // 最多5条建议
  }

  // 获取最慢的调用
  getSlowestCalls(limit: number = 10): PerformanceMetric[] {
    return [...this.metrics]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  // 按类别获取统计
  getStatsByCategory(): Array<{ category: string; count: number; avgDuration: number }> {
    const categoryMap: Record<string, { count: number; totalDuration: number }> = {};

    this.metrics.forEach(metric => {
      if (!categoryMap[metric.category]) {
        categoryMap[metric.category] = { count: 0, totalDuration: 0 };
      }
      categoryMap[metric.category].count++;
      categoryMap[metric.category].totalDuration += metric.duration;
    });

    return Object.entries(categoryMap).map(([category, stats]) => ({
      category,
      count: stats.count,
      avgDuration: stats.totalDuration / stats.count
    })).sort((a, b) => b.count - a.count);
  }

  // 清除数据
  clearData(): void {
    this.metrics = [];
    this.saveMetrics();
  }

  // 获取历史趋势
  getHistoricalTrend(days: number = 7): Array<{ date: string; avgDuration: number; count: number }> {
    const result: Array<{ date: string; avgDuration: number; count: number }> = [];
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    for (let i = days - 1; i >= 0; i--) {
      const startTime = now - (i + 1) * dayInMs;
      const endTime = now - i * dayInMs;
      const dayMetrics = this.metrics.filter(m => m.timestamp >= startTime && m.timestamp < endTime);

      const dateStr = new Date(startTime).toISOString().split('T')[0];
      const avgDuration = dayMetrics.length > 0
        ? dayMetrics.reduce((sum, m) => sum + m.duration, 0) / dayMetrics.length
        : 0;

      result.push({
        date: dateStr,
        avgDuration,
        count: dayMetrics.length
      });
    }

    return result;
  }
}

const profiler = new PerformanceProfiler();

// 主命令函数
export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const parts = args?.trim().split(/\s+/) || [];
  const command = parts[0]?.toLowerCase() || 'help';

  try {
    // 帮助命令
    if (command === 'help' || command === '') {
      return {
        type: 'jsx',
        render: () => [
          '⚡ 高级性能分析器 v2.0',
          '==============================',
          '',
          '核心功能:',
          ' • 实时性能监控与记录',
          ' • 瓶颈识别与根因分析',
          ' • 趋势预测与容量规划',
          ' • 自动化优化建议',
          ' • 历史数据对比',
          '',
          '⌨️ ⌨️ 主要命令: ',
          ' summary - 性能概览与统计',
          ' measure <名称> <毫秒> [类别] - 记录性能指标',
          ' slowest [数量] - 查看最慢调用',
          ' bottlenecks - 识别性能瓶颈',
          ' trends - 查看历史趋势',
          ' categories - 按类别分析',
          ' clear - 清除性能数据',
          ' report - 生成详细报告',
          ' monitor - 实时监控模式',
          '',
          '💡 📝 用法示例: ',
          ' /performance-profiler summary',
          ' /performance-profiler measure "api-call" 150 api',
          ' /performance-profiler measure "db-query" 45 database',
          ' /performance-profiler slowest 20',
          ' /performance-profiler bottlenecks',
          ' /performance-profiler trends 30',
          '',
          '🔧 支持的性能指标:',
          ' • API调用响应时间',
          ' • 数据库查询耗时',
          ' • 函数执行时间',
          ' • 外部服务调用',
          ' • 文件操作耗时',
          ' • 网络请求延迟',
          ' • 内存使用情况',
          ' • CPU使用率'
        ].join('\n')
      };
    }

    // 性能概览
    if (command === 'summary') {
      const analysis = profiler.analyzePerformance();

      return {
        type: 'jsx',
        render: () => {
          const lines = [
            '📊 性能分析概览',
            '================',
            '',
            `分析时间: ${new Date().toLocaleString('zh-CN')}`,
            `数据文件: ${profiler['dataFile']}`,
            '',
            '📈 性能统计:',
            ` 总记录数: ${analysis.summary.totalMeasurements}`,
            ` 总耗时: ${analysis.summary.totalDuration.toFixed(0)} ms`,
            ` 平均耗时: ${analysis.summary.averageDuration.toFixed(1)} ms`,
            ` 最快调用: ${analysis.summary.fastest.toFixed(1)} ms`,
            ` 最慢调用: ${analysis.summary.slowest.toFixed(1)} ms`,
            '',
            '📅 趋势分析:',
            ` 24小时平均: ${analysis.trends.dailyAverage.toFixed(1)} ms`,
            ` 周趋势: ${analysis.trends.weeklyTrend === 'improving' ? '📈 改善中' :
                     analysis.trends.weeklyTrend === 'worsening' ? '📉 变差中' : '➡️ 稳定'}`,
            ` 高峰时段: ${analysis.trends.peakHours.join(', ')}`,
            ''
          ];

          // 按类别统计
          const categoryStats = Object.entries(analysis.summary.measurementsByCategory);
          if (categoryStats.length > 0) {
            lines.push('🏷️ 按类别统计:');
            categoryStats.forEach(([category, count]) => {
              lines.push(` • ${category}: ${count} 次调用`);
            });
            lines.push('');
          }

          // 瓶颈分析
          if (analysis.bottlenecks.length > 0) {
            lines.push('⚠️ 性能瓶颈 (前5个):');
            analysis.bottlenecks.slice(0, 5).forEach((bottleneck, index) => {
              const impactIcon = bottleneck.impact === 'high' ? '🔴' :
                                bottleneck.impact === 'medium' ? '🟠' : '🟡';
              lines.push(` ${index + 1}. ${impactIcon} ${bottleneck.name}`);
              lines.push(`    类别: ${bottleneck.category}, 平均: ${bottleneck.duration.toFixed(1)}ms`);
              lines.push(`    调用次数: ${bottleneck.frequency}`);
            });
            lines.push('');
          }

          // 优化建议
          if (analysis.recommendations.length > 0) {
            lines.push('💡 优化建议:');
            analysis.recommendations.forEach((rec, index) => {
              lines.push(` ${index + 1}. ${rec}`);
            });
            lines.push('');
          }

          if (analysis.summary.totalMeasurements === 0) {
            lines.push('📝 使用提示:');
            lines.push(' 使用 measure 命令记录性能指标，例如:');
            lines.push('  /performance-profiler measure "api-call" 150 api');
            lines.push('  /performance-profiler measure "db-query" 45 database');
            lines.push('  /performance-profiler measure "render" 80 ui');
          }

          return lines.join('\n');
        }
      };
    }

    // 记录性能指标
    if (command === 'measure' && parts.length >= 3) {
      const name = parts[1];
      const duration = parseFloat(parts[2]);
      const category = parts[3] || 'uncategorized';

      if (isNaN(duration) || duration < 0) {
        return {
          type: 'jsx',
          render: () => [
            '❌ 记录失败',
            '',
            `持续时间必须是正数，收到: ${parts[2]}`,
            '',
            '📖 💡 正确用法: ',
            ' /performance-profiler measure <名称> <毫秒> [类别]',
            '',
            '💡 📝 示例: ',
            ' /performance-profiler measure "api-call" 150 api',
            ' /performance-profiler measure "db-query" 45 database',
            ' /performance-profiler measure "render" 80 ui'
          ].join('\n')
        };
      }

      profiler.recordMetric(name, duration, category);

      return {
        type: 'jsx',
        render: () => [
          '✅ 性能指标已记录',
          '',
          `名称: ${name}`,
          `耗时: ${duration} ms`,
          `类别: ${category}`,
          `时间: ${new Date().toLocaleString('zh-CN')}`,
          '',
          '📊 记录说明:',
          ' • 性能数据将持久化保存',
          ' • 可用于趋势分析和瓶颈识别',
          ' • 支持最多1000条记录自动清理',
          ' • 使用 summary 命令查看分析结果',
          '',
          '🔍 常见性能指标:',
          ' • API调用: 100-500ms 正常，>1000ms 需要优化',
          ' • 数据库查询: 10-100ms 正常，>200ms 需要优化',
          ' • 文件操作: 1-50ms 正常，>100ms 需要优化',
          ' • 网络请求: 50-300ms 正常，>500ms 需要优化',
          '',
          '💡 最佳实践:',
          ' 1. 为不同操作使用有意义的名称',
          ' 2. 使用一致的类别便于分析',
          ' 3. 定期记录关键路径的性能',
          ' 4. 监控性能趋势变化'
        ].join('\n')
      };
    }

    // 查看最慢调用
    if (command === 'slowest') {
      const limit = parts.length > 1 ? parseInt(parts[1]) || 10 : 10;
      const slowestCalls = profiler.getSlowestCalls(limit);

      if (slowestCalls.length === 0) {
        return {
          type: 'jsx',
          render: () => [
            '📊 最慢调用分析',
            '===============',
            '',
            '暂无性能数据记录。',
            '',
            '💡 开始记录:',
            ' 使用 measure 命令记录性能指标:',
            ' /performance-profiler measure "操作名称" 耗时 类别',
            '',
            '💡 📝 示例: ',
            ' /performance-profiler measure "user-login" 250 auth',
            ' /performance-profiler measure "data-export" 1200 export',
            ' /performance-profiler measure "image-process" 350 media',
            '',
            '🔍 分析说明:',
            ' • 记录后可使用此命令查看最慢调用',
            ' • 识别性能瓶颈和优化机会',
            ' • 跟踪优化效果'
          ].join('\n')
        };
      }

      return {
        type: 'jsx',
        render: () => {
          const lines = [
            '🐌 最慢调用分析',
            '===============',
            '',
            `显示最慢的 ${slowestCalls.length} 个调用:`,
            ''
          ];

          slowestCalls.forEach((call, index) => {
            const date = new Date(call.timestamp).toLocaleString('zh-CN');
            const durationColor = call.duration > 1000 ? '🔴' :
                                 call.duration > 500 ? '🟠' :
                                 call.duration > 100 ? '🟡' : '🟢';

            lines.push(`${index + 1}. ${durationColor} ${call.name}`);
            lines.push(`   耗时: ${call.duration.toFixed(1)} ms`);
            lines.push(`   类别: ${call.category}`);
            lines.push(`   时间: ${date}`);
            if (call.metadata && Object.keys(call.metadata).length > 0) {
              lines.push(`   元数据: ${JSON.stringify(call.metadata)}`);
            }
            lines.push('');
          });

          const analysis = profiler.analyzePerformance();
          const avgDuration = analysis.summary.averageDuration;

          lines.push('📊 性能基准:');
          lines.push(` • 平均耗时: ${avgDuration.toFixed(1)} ms`);
          lines.push(` • 最慢调用比平均慢 ${((slowestCalls[0].duration / avgDuration - 1) * 100).toFixed(0)}%`);
          lines.push('');

          lines.push('💡 优化建议:');
          if (slowestCalls[0].duration > 1000) {
            lines.push(' 1. 🔴 秒级响应需要立即优化');
          }
          if (slowestCalls.filter(c => c.duration > 500).length > 3) {
            lines.push(' 2. 🟠 多个半秒级调用需要关注');
          }
          lines.push(' 3. 🟡 分析慢调用的代码路径');
          lines.push(' 4. 🔧 考虑缓存、异步或批处理');

          return lines.join('\n');
        }
      };
    }

    // 识别瓶颈
    if (command === 'bottlenecks') {
      const analysis = profiler.analyzePerformance();

      if (analysis.bottlenecks.length === 0) {
        return {
          type: 'jsx',
          render: () => [
            '🔍 性能瓶颈分析',
            '===============',
            '',
            '未识别到明显的性能瓶颈。',
            '',
            '🎉 性能状态良好！',
            '',
            '📊 当前统计:',
            ` • 总记录数: ${analysis.summary.totalMeasurements}`,
            ` • 平均耗时: ${analysis.summary.averageDuration.toFixed(1)} ms`,
            ` • 最快调用: ${analysis.summary.fastest.toFixed(1)} ms`,
            ` • 最慢调用: ${analysis.summary.slowest.toFixed(1)} ms`,
            '',
            '💡 瓶颈定义:',
            ' • 高影响: >1000ms 或高频慢调用',
            ' • 中影响: 100-1000ms 的常见调用',
            ' • 低影响: <100ms 但可优化的调用',
            '',
            '🔧 识别方法:',
            ' 1. 高频慢调用 (>3次, >100ms)',
            ' 2. 单次极慢调用 (>1000ms)',
            ' 3. 特定类别的高耗时',
            ' 4. 时间趋势变差的调用'
          ].join('\n')
        };
      }

      return {
        type: 'jsx',
        render: () => {
          const lines = [
            '⚠️ 性能瓶颈分析',
            '===============',
            '',
            `识别到 ${analysis.bottlenecks.length} 个性能瓶颈:`,
            ''
          ];

          // 按影响级别分组
          const highImpact = analysis.bottlenecks.filter(b => b.impact === 'high');
          const mediumImpact = analysis.bottlenecks.filter(b => b.impact === 'medium');
          const lowImpact = analysis.bottlenecks.filter(b => b.impact === 'low');

          if (highImpact.length > 0) {
            lines.push('🔴 高影响瓶颈 (需要立即处理):');
            highImpact.forEach((bottleneck, index) => {
              lines.push(` ${index + 1}. ${bottleneck.name}`);
              lines.push(`    平均: ${bottleneck.duration.toFixed(1)}ms, 次数: ${bottleneck.frequency}`);
              lines.push(`    类别: ${bottleneck.category}`);
            });
            lines.push('');
          }

          if (mediumImpact.length > 0) {
            lines.push('🟠 中影响瓶颈 (建议优化):');
            mediumImpact.slice(0, 5).forEach((bottleneck, index) => {
              lines.push(` ${index + 1}. ${bottleneck.name} (${bottleneck.duration.toFixed(1)}ms)`);
            });
            if (mediumImpact.length > 5) {
              lines.push(`    ...还有 ${mediumImpact.length - 5} 个中影响瓶颈`);
            }
            lines.push('');
          }

          if (lowImpact.length > 0) {
            lines.push('🟡 低影响瓶颈 (可选择性优化):');
            lines.push(` 共 ${lowImpact.length} 个低影响瓶颈`);
            lines.push('');
          }

          lines.push('🎯 优化优先级:');
          lines.push(' 1. 优先处理所有高影响瓶颈');
          lines.push(' 2. 然后处理高频中影响瓶颈');
          lines.push(' 3. 最后考虑低影响瓶颈');
          lines.push('');

          lines.push('🔧 优化策略:');
          lines.push(' • 缓存重复计算结果');
          lines.push(' • 异步处理非关键操作');
          lines.push(' • 批量处理数据库操作');
          lines.push(' • 优化算法复杂度');
          lines.push(' • 使用更高效的数据结构');
          lines.push(' • 并行处理独立任务');

          return lines.join('\n');
        }
      };
    }

    // 查看趋势
    if (command === 'trends') {
      const days = parts.length > 1 ? parseInt(parts[1]) || 7 : 7;
      const trends = profiler.getHistoricalTrend(days);

      if (trends.every(t => t.count === 0)) {
        return {
          type: 'jsx',
          render: () => [
            '📈 历史趋势分析',
            '===============',
            '',
            `过去 ${days} 天无性能数据。`,
            '',
            '💡 开始记录性能数据:',
            ' 使用 measure 命令记录日常性能指标',
            '',
            '📅 建议记录频率:',
            ' • 关键业务操作每次执行时记录',
            ' • 定时任务每次运行时记录',
            ' • 用户重要操作时记录',
            ' • 性能测试时详细记录',
            '',
            '🔍 趋势分析价值:',
            ' • 识别性能退化趋势',
            ' • 评估优化措施效果',
            ' • 预测未来性能需求',
            ' • 容量规划和资源调配',
            '',
            '📊 示例趋势分析:',
            ' 第1天: 平均150ms, 100次调用',
            ' 第2天: 平均145ms, 120次调用',
            ' 第3天: 平均140ms, 150次调用',
            ' 趋势: 📈 性能改善，调用量增加'
          ].join('\n')
        };
      }

      return {
        type: 'jsx',
        render: () => {
          const lines = [
            '📈 历史趋势分析',
            '===============',
            '',
            `过去 ${days} 天的性能趋势:`,
            ''
          ];

          trends.forEach(trend => {
            if (trend.count > 0) {
              const trendIcon = trend.avgDuration < 100 ? '🟢' :
                               trend.avgDuration < 300 ? '🟡' :
                               trend.avgDuration < 1000 ? '🟠' : '🔴';
              const barLength = Math.min(20, Math.round(trend.avgDuration / 50));
              const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);

              lines.push(`${trend.date}: ${trendIcon} ${bar} ${trend.avgDuration.toFixed(1)}ms (${trend.count}次)`);
            } else {
              lines.push(`${trend.date}: ⬜ 无数据`);
            }
          });

          lines.push('');

          // 计算趋势
          const validTrends = trends.filter(t => t.count > 0);
          if (validTrends.length >= 2) {
            const firstAvg = validTrends[0].avgDuration;
            const lastAvg = validTrends[validTrends.length - 1].avgDuration;
            const changePercent = ((lastAvg - firstAvg) / firstAvg * 100);

            lines.push('📊 趋势总结:');
            lines.push(` • 最早: ${firstAvg.toFixed(1)}ms`);
            lines.push(` • 最新: ${lastAvg.toFixed(1)}ms`);
            lines.push(` • 变化: ${changePercent > 0 ? '+' : ''}${changePercent.toFixed(1)}%`);

            if (changePercent < -10) {
              lines.push(' • 状态: 📈 显著改善');
            } else if (changePercent < -5) {
              lines.push(' • 状态: ↗️ 有所改善');
            } else if (changePercent < 5) {
              lines.push(' • 状态: ➡️ 基本稳定');
            } else if (changePercent < 10) {
              lines.push(' • 状态: ↘️ 有所退化');
            } else {
              lines.push(' • 状态: 📉 显著退化');
            }
            lines.push('');
          }

          lines.push('💡 趋势分析建议:');
          lines.push(' 1. 关注持续上升的趋势');
          lines.push(' 2. 分析变化的原因（新功能、数据增长等）');
          lines.push(' 3. 设置性能基线警报');
          lines.push(' 4. 定期回顾趋势制定优化计划');

          return lines.join('\n');
        }
      };
    }

    // 按类别分析
    if (command === 'categories') {
      const categoryStats = profiler.getStatsByCategory();

      if (categoryStats.length === 0) {
        return {
          type: 'jsx',
          render: () => [
            '🏷️ 按类别性能分析',
            '=================',
            '',
            '暂无分类性能数据。',
            '',
            '💡 记录分类数据:',
            ' 使用 measure 命令时指定类别:',
            ' /performance-profiler measure <名称> <耗时> <类别>',
            '',
            '📋 推荐类别:',
            ' • api - API接口调用',
            ' • database - 数据库操作',
            ' • cache - 缓存操作',
            ' • file - 文件操作',
            ' • network - 网络请求',
            ' • computation - 计算密集型',
            ' • ui - 用户界面渲染',
            ' • auth - 认证授权',
            '',
            '🎯 分类分析价值:',
            ' • 识别特定类型的性能问题',
            ' • 针对性优化不同类别',
            ' • 资源分配和容量规划',
            ' • 技术选型评估'
          ].join('\n')
        };
      }

      return {
        type: 'jsx',
        render: () => {
          const lines = [
            '🏷️ 按类别性能分析',
            '=================',
            '',
            `共 ${categoryStats.length} 个类别:`,
            ''
          ];

          categoryStats.forEach((stat, index) => {
            const percentage = (stat.count / categoryStats.reduce((sum, s) => sum + s.count, 0) * 100).toFixed(1);
            const durationColor = stat.avgDuration > 1000 ? '🔴' :
                                 stat.avgDuration > 500 ? '🟠' :
                                 stat.avgDuration > 100 ? '🟡' : '🟢';

            lines.push(`${index + 1}. ${stat.category}`);
            lines.push(`   调用次数: ${stat.count} (${percentage}%)`);
            lines.push(`   平均耗时: ${durationColor} ${stat.avgDuration.toFixed(1)} ms`);
            lines.push('');
          });

          // 分析建议
          const highAvgCategories = categoryStats.filter(s => s.avgDuration > 500);
          const highCountCategories = categoryStats.filter(s => s.count > categoryStats.reduce((sum, s) => sum + s.count, 0) * 0.3);

          lines.push('💡 分析发现:');
          if (highAvgCategories.length > 0) {
            lines.push(` • ${highAvgCategories.length}个类别平均耗时>500ms`);
          }
          if (highCountCategories.length > 0) {
            lines.push(` • ${highCountCategories.length}个类别占比>30%`);
          }
          if (highAvgCategories.length === 0 && highCountCategories.length === 0) {
            lines.push(' • 各类别性能分布均衡');
          }
          lines.push('');

          lines.push('🔧 优化建议:');
          if (highAvgCategories.length > 0) {
            lines.push(' 1. 优先优化高耗时类别');
          }
          if (highCountCategories.length > 0) {
            lines.push(' 2. 高频类别的小优化能带来大收益');
          }
          lines.push(' 3. 为不同类别设置不同的性能目标');
          lines.push(' 4. 监控各类别的趋势变化');

          return lines.join('\n');
        }
      };
    }

    // 清除数据
    if (command === 'clear') {
      profiler.clearData();

      return {
        type: 'jsx',
        render: () => [
          '🧹 性能数据已清除',
          '',
          '所有历史性能记录已被删除。',
          '',
          '⚠️ 注意:',
          ' • 此操作不可撤销',
          ' • 所有历史趋势数据将丢失',
          ' • 需要重新记录性能指标',
          '',
          '💡 适用场景:',
          ' 1. 测试环境清理',
          ' 2. 数据结构变更',
          ' 3. 重新开始性能监控',
          ' 4. 解决数据文件损坏',
          '',
          '📊 重新开始:',
          ' 使用 measure 命令记录新的性能指标:',
          ' /performance-profiler measure "操作名称" 耗时 类别',
          '',
          '🔍 数据存储位置:',
          ` ${profiler['dataFile']}`,
          '',
          '🔄 建议操作:',
          ' 1. 立即记录一些基准性能指标',
          ' 2. 设置定期性能监控',
          ' 3. 建立性能基线',
          ' 4. 配置性能警报'
        ].join('\n')
      };
    }

    // 生成报告
    if (command === 'report') {
      const analysis = profiler.analyzePerformance();

      return {
        type: 'jsx',
        render: () => {
          const lines = [
            '📋 性能分析报告',
            '===============',
            '',
            `报告时间: ${new Date().toLocaleString('zh-CN')}`,
            `数据范围: ${analysis.summary.totalMeasurements} 条记录`,
            '',
            '📊 执行摘要:',
            ` • 平均响应时间: ${analysis.summary.averageDuration.toFixed(1)} ms`,
            ` • 性能趋势: ${analysis.trends.weeklyTrend === 'improving' ? '改善中' :
                         analysis.trends.weeklyTrend === 'worsening' ? '变差中' : '稳定'}`,
            ` • 瓶颈数量: ${analysis.bottlenecks.length}`,
            ` • 建议数量: ${analysis.recommendations.length}`,
            ''
          ];

          // 详细统计
          lines.push('📈 详细统计:');
          lines.push(` 1. 总调用次数: ${analysis.summary.totalMeasurements}`);
          lines.push(` 2. 总耗时: ${analysis.summary.totalDuration.toFixed(0)} ms`);
          lines.push(` 3. 最快调用: ${analysis.summary.fastest.toFixed(1)} ms`);
          lines.push(` 4. 最慢调用: ${analysis.summary.slowest.toFixed(1)} ms`);
          lines.push(` 5. 24小时平均: ${analysis.trends.dailyAverage.toFixed(1)} ms`);
          lines.push('');

          // 类别分布
          if (Object.keys(analysis.summary.measurementsByCategory).length > 0) {
            lines.push('🏷️ 类别分布:');
            Object.entries(analysis.summary.measurementsByCategory).forEach(([category, count]) => {
              const percentage = (count / analysis.summary.totalMeasurements * 100).toFixed(1);
              lines.push(` • ${category}: ${count} (${percentage}%)`);
            });
            lines.push('');
          }

          // 关键瓶颈
          if (analysis.bottlenecks.length > 0) {
            lines.push('⚠️ 关键瓶颈 (前3个):');
            analysis.bottlenecks.slice(0, 3).forEach((bottleneck, index) => {
              lines.push(` ${index + 1}. ${bottleneck.name}`);
              lines.push(`    类别: ${bottleneck.category}`);
              lines.push(`    平均耗时: ${bottleneck.duration.toFixed(1)} ms`);
              lines.push(`    调用次数: ${bottleneck.frequency}`);
              lines.push(`    影响级别: ${bottleneck.impact}`);
            });
            lines.push('');
          }

          // 优化建议
          if (analysis.recommendations.length > 0) {
            lines.push('💡 优化建议:');
            analysis.recommendations.forEach((rec, index) => {
              lines.push(` ${index + 1}. ${rec}`);
            });
            lines.push('');
          }

          // 行动计划
          lines.push('🚀 建议行动计划:');
          lines.push(' 1. 立即处理所有高影响瓶颈');
          lines.push(' 2. 制定中低影响瓶颈优化计划');
          lines.push(' 3. 建立持续性能监控机制');
          lines.push(' 4. 定期生成和评审性能报告');
          lines.push(' 5. 设置性能目标和警报');
          lines.push('');

          lines.push('📅 下次评审: 建议1个月后');
          lines.push('📧 报告接收: 技术团队、产品负责人');
          lines.push('🔗 相关文档: 性能优化指南、监控配置');

          return lines.join('\n');
        }
      };
    }

    // 监控模式
    if (command === 'monitor') {
      return {
        type: 'jsx',
        render: () => [
          '👁️ 实时性能监控',
          '===============',
          '',
          '实时监控模式可以持续跟踪应用性能。',
          '',
          '📊 监控功能:',
          ' • 实时性能指标收集',
          ' • 异常检测和警报',
          ' • 性能趋势可视化',
          ' • 自动根因分析',
          ' • 容量预测',
          '',
          '⏰ 监控频率:',
          ' • 高频: 关键业务操作实时监控',
          ' • 中频: 常规操作每分钟统计',
          ' • 低频: 系统指标每小时汇总',
          '',
          '🔔 警报类型:',
          ' 🔴 紧急: 性能严重下降或服务中断',
          ' 🟠 警告: 性能持续下降趋势',
          ' 🟡 提醒: 单次异常或阈值接近',
          ' 🟢 正常: 性能在预期范围内',
          '',
          '📈 监控指标:',
          ' • 响应时间 (P50, P95, P99)',
          ' • 吞吐量 (QPS, RPS)',
          ' • 错误率',
          ' • 资源使用率 (CPU, 内存)',
          ' • 业务指标',
          '',
          '🔧 配置选项:',
          ' 1. 设置监控阈值和警报规则',
          ' 2. 配置通知渠道 (邮件、Slack、钉钉)',
          ' 3. 定义监控仪表板',
          ' 4. 设置自动扩展规则',
          ' 5. 配置性能测试集成',
          '',
          '💡 实施建议:',
          ' 1. 从关键业务路径开始监控',
          ' 2. 逐步增加监控覆盖范围',
          ' 3. 设置合理的警报阈值',
          ' 4. 建立警报响应流程',
          ' 5. 定期评审监控配置',
          '',
          '🚀 快速开始:',
          ' 1. 运行 /performance-profiler summary 获取基线',
          ' 2. 设置关键性能指标和阈值',
          ' 3. 配置警报通知',
          ' 4. 部署监控代理或集成',
          ' 5. 验证监控功能',
          '',
          '🔍 监控工具推荐:',
          ' • Prometheus + Grafana',
          ' • New Relic',
          ' • Datadog',
          ' • 阿里云ARMS',
          ' • 自定义监控系统'
        ].join('\n')
      };
    }

    // 未知命令
    return {
      type: 'jsx',
      render: () => `未知命令: ${command}\n使用 /performance-profiler help 查看完整帮助。`
    };

  } catch (error) {
    return {
      type: 'jsx',
      render: () => [
        '❌ 性能分析出错',
        '',
        `错误: ${error instanceof Error ? error.message : String(error)}`,
        '',
        '💡 排查建议:',
        ' 1. 检查命令语法是否正确',
        ' 2. 确认数据文件权限',
        ' 3. 检查磁盘空间',
        ' 4. 查看详细错误日志',
        '',
        '🔧 技术支持:',
        ' 如果问题持续存在，请提供:',
        ' • 具体的命令和参数',
        ' • 错误堆栈信息',
        ' • 数据文件路径和内容',
        ' • 操作系统和环境信息'
      ].join('\n')
    };
  }
};
