import { EventEmitter } from 'events';

interface ProgressData {
  toolCallId: string;
  type: 'bash' | 'exec';
  output: string;   // 新增的输出片段
  elapsedSeconds: number;
}

class ProgressEmitter extends EventEmitter {
  emitProgress(toolCallId: string, data: Omit<ProgressData, 'toolCallId'>) {
    this.emit('progress', { ...data, toolCallId });
  }
}

export const progressEmitter = new ProgressEmitter();