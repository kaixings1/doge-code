/** 消息队列条目 */
export type MessageQueueEntry = Record<string, unknown>

export type QueueOperation = 'enqueue' | 'dequeue' | 'clear' | 'pause' | 'resume'

export interface QueueOperationMessage {
  type: 'queue-operation'
  operation: QueueOperation
  timestamp: string
  sessionId: string
  content?: string
}
