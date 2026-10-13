/** Strict, incremental SSE decoding shared by streaming and JSON aggregation. */
export class SseProtocolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SseProtocolError';
    this.statusCode = 502;
  }
}

export async function* readSseFrames(body, controller) {
  if (!body) throw new SseProtocolError('上游响应没有数据流');
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let dataLines = [];
  let sawChoice = false;
  let sawFinish = false;
  const aborted = () => { void reader.cancel(controller.signal.reason).catch(() => {}); };
  controller.signal.addEventListener('abort', aborted, { once: true });

  function event() {
    if (!dataLines.length) return null;
    const raw = dataLines.join('\n');
    dataLines = [];
    if (raw.trim() === '[DONE]') {
      if (!sawChoice) throw new SseProtocolError('上游在没有有效模型响应时结束了数据流');
      return { done: true };
    }
    let chunk;
    try { chunk = JSON.parse(raw); }
    catch { throw new SseProtocolError('上游 SSE 数据不是有效 JSON'); }
    if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk)) throw new SseProtocolError('上游 SSE 数据格式无效');
    if (chunk.error || (chunk.code && Number(chunk.code) !== 0 && !chunk.choices)) {
      throw new SseProtocolError(chunk.error?.message || (typeof chunk.error === 'string' ? chunk.error : '')
        || chunk.message || chunk.msg || '上游流式返回错误');
    }
    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    if (choices.length) sawChoice = true;
    if (choices.some(choice => choice.finish_reason != null)) sawFinish = true;
    return { done: false, chunk, raw };
  }

  function line(raw) {
    const value = raw.replace(/\r$/, '');
    if (!value) return event();
    if (value.startsWith('data:')) dataLines.push(value.slice(5).replace(/^ /, ''));
    return null; // comments, id and retry do not form model deltas
  }

  try {
    for (;;) {
      controller.signal.throwIfAborted();
      const { done, value } = await reader.read();
      controller.signal.throwIfAborted();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 8 * 1024 * 1024) throw new SseProtocolError('上游 SSE 帧超过大小限制');
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const frame = line(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        if (frame) {
          yield frame;
          if (frame.done) return; // Never read transport errors or stray frames after [DONE].
        }
      }
      if (!done) continue;
      if (buffer) {
        const frame = line(buffer);
        if (frame) { yield frame; if (frame.done) return; }
      }
      const last = event();
      if (last) { yield last; if (last.done) return; }
      if (!sawChoice || !sawFinish) throw new SseProtocolError('上游数据流提前结束，未收到完成标记');
      return; // Graceful EOF with explicit finish_reason is valid; usage is optional.
    }
  } catch (error) {
    if (controller.signal.aborted || error instanceof SseProtocolError) throw error;
    throw new SseProtocolError(`上游流中断: ${error.message}`);
  } finally {
    controller.signal.removeEventListener('abort', aborted);
    try { await reader.cancel(); } catch { /* terminal or errored stream */ }
    reader.releaseLock();
  }
}

/** Respect downstream backpressure without leaking listeners on a disconnect. */
export async function writeSse(res, text, controller) {
  controller.signal.throwIfAborted();
  if (res.destroyed || res.writableEnded) throw new Error('客户端已断开');
  if (res.write(text)) return;
  await new Promise((resolve, reject) => {
    const clean = () => {
      res.removeListener('drain', drain);
      res.removeListener('error', fail);
      res.removeListener('close', close);
      controller.signal.removeEventListener('abort', close);
    };
    const drain = () => { clean(); resolve(); };
    const fail = error => { clean(); reject(error); };
    const close = () => { clean(); reject(new Error('客户端已断开')); };
    res.once('drain', drain);
    res.once('error', fail);
    res.once('close', close);
    controller.signal.addEventListener('abort', close, { once: true });
    if (controller.signal.aborted || res.destroyed) close();
  });
}
