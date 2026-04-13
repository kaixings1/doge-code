<think></think><think></think><think></think>subtype: 'error',
            request_id: request.request_id,
            error: verdict.error,
          },
        }
      }
      break

    }

    case 'interrupt':
      onInterrupt?.()
      response = {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: request.request_id,
        },
      }
      break

    default:
      // 未知子类型 —— 响应错误，以便服务器不会
      // 挂起等待一个永远不会到来的回复。
      response = {
        type: 'control_response',
        response: {
          subtype: 'error',
          request_id: request.request_id,
          error: `REPL桥不处理控制请求子类型：${request.request.subtype}`,
        },
      }
  }

  const event = { ...response, session_id: sessionId }
  void transport.write(event)
  logForDebugging(
    `[bridge:repl] 已发送control_response，请求子类型=${request.request.subtype}，请求ID=${request.request_id}，结果=${response.response.subtype}`,
  )
}

// ─── 结果消息（用于会话归档结束时） ───────────────────────────────

/**
 * 构建一个用于会话归档的最小化`SDKResultSuccess`消息。
 * 服务器在WebSocket关闭前需要此事件以触发归档。
 */
export function makeResultMessage(sessionId: string): SDKResultSuccess {
  return {
    type: 'result',
    subtype: 'success',
    duration_ms: 0,
    duration_api_ms: 0,
    is_error: false,
    num_turns: 0,
    result: '',
    stop_reason: null,
    total_cost_usd: 0,
    usage: { ...EMPTY_USAGE },
    modelUsage: {},
    permission_denials: [],
    session_id: sessionId,
    uuid: randomUUID(),
  }
}

// ─── BoundedUUIDSet（echo去重环形缓冲区） ───────────────────────────────

/**
 * 基于环形缓冲区的FIFO有界集合。当容量达到时，会逐出最旧的条目
 * ，保持内存使用量恒定在O(容量)。
 *
 * 消息按时间顺序添加，因此逐出的条目始终是最旧的。调用者依赖于外部排序（钩子的
 * lastWrittenIndexRef）作为主要去重依据 —— 此集合是echo过滤和防重复去重的次要安全网。
 */
export class BoundedUUIDSet {
  private readonly capacity: number
  private readonly ring: (string | undefined)[]
  private readonly set = new Set<string>()
  private writeIdx = 0

  constructor(capacity: number) {
    this.capacity = capacity
    this.ring = new Array<string | undefined>(capacity)
  }

  add(uuid: string): void {
    if (this.set.has(uuid)) return
    // 逐出当前写入位置的条目（如果已被占用）
    const evicted = this.ring[this.writeIdx]
    if (evicted !== undefined) {
      this.set.delete(evicted)
    }
    this.ring[this.writeIdx] = uuid
    this.set.add(uuid)
    this.writeIdx = (this.writeIdx + 1) % this.capacity
  }

  has(uuid: string): boolean {
    return this.set.has(uuid)
  }

  clear(): void {
    this.set.clear()
    this.ring.fill(undefined)
    this.writeIdx = 0
  }
}<｜end▁of▁sentence｜>