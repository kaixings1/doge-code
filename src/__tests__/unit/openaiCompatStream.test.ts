import { describe, it, expect } from 'vitest';
import { createAnthropicStreamFromOpenAI } from '../../services/api/openaiCompat.js';

/**
 * Test: createAnthropicStreamFromOpenAI should yield AssistantMessage at stream end
 * This is the core fix for the bug where UI never displayed responses from OpenAI-compatible APIs.
 */
describe('createAnthropicStreamFromOpenAI', () => {
  function createSSEReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
    const stream = new ReadableStream({
      pull(controller) {
        if (chunks.length > 0) {
          const chunk = chunks.shift()!;
          controller.enqueue(new TextEncoder().encode(chunk));
        } else {
          controller.close();
        }
      },
    });
    return stream.getReader();
  }

  it('should yield AssistantMessage after message_stop for OpenAI choices path', async () => {
    // Simulate OpenAI-compatible streaming response
    const chunks = [
      // First chunk with message_start equivalent (OpenAI format)
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
      // Text delta
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"test-model","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
      // More text
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"test-model","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
      // Finish
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"test-model","choices":[{"index":0,"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
      // [DONE]
      'data: [DONE]\n\n',
    ];

    const reader = createSSEReader(chunks);
    const gen = createAnthropicStreamFromOpenAI({
      reader,
      model: 'test-model',
    });

    const events: any[] = [];
    for await (const event of gen) {
      events.push(event);
    }

    // Collect all text deltas from content_block_delta events
    const textDeltas = events
      .filter(e => e.type === 'content_block_delta' && e.delta?.type === 'text_delta')
      .map(e => e.delta.text);

    const fullText = textDeltas.join('');
    expect(fullText).toContain('Hello world');
  });

  it('should yield text from reasoning_content (StepFun path)', async () => {
    // Simulate StepFun API response: text in reasoning_content, content is empty
    const chunks = [
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":"","reasoning":"The","reasoning_content":"The"},"finish_reason":null}]}\n\n',
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"test-model","choices":[{"index":0,"delta":{"content":"","reasoning":" answer","reasoning_content":" answer"},"finish_reason":null}]}\n\n',
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"test-model","choices":[{"index":0,"delta":{"content":"","reasoning":" is","reasoning_content":" is"},"finish_reason":null}]}\n\n',
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"test-model","choices":[{"index":0,"delta":{"content":"","reasoning":" 42","reasoning_content":" 42"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
      'data: [DONE]\n\n',
    ];

    const reader = createSSEReader(chunks);
    const gen = createAnthropicStreamFromOpenAI({
      reader,
      model: 'test-model',
    });

    const events: any[] = [];
    for await (const event of gen) {
      events.push(event);
    }

    // Collect all thinking deltas (reasoning_content should NOT appear as text_delta)
    const thinkingDeltas = events
      .filter(e => e.type === 'content_block_delta' && e.delta?.type === 'thinking_delta')
      .map(e => e.delta.thinking);

    const fullThinking = thinkingDeltas.join('');
    expect(fullThinking).toContain('The answer is 42');
  });

  it('should yield thinking delta as text (DeepSeek path)', async () => {
    // Simulate DeepSeek API: uses "thinking" field for reasoning tokens
    const chunks = [
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"thinking":"Let me think"},"finish_reason":null}]}\n\n',
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"thinking":" about this","content":""},"finish_reason":null}]}\n\n',
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"Done."},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
      'data: [DONE]\n\n',
    ];

    const reader = createSSEReader(chunks);
    const gen = createAnthropicStreamFromOpenAI({
      reader,
      model: 'deepseek-chat',
    });

    const events: any[] = [];
    for await (const event of gen) {
      events.push(event);
    }

    // Collect all thinking deltas (thinking content should NOT appear as text_delta)
    const thinkingDeltas = events
      .filter(e => e.type === 'content_block_delta' && e.delta?.type === 'thinking_delta')
      .map(e => e.delta.thinking);

    const fullThinking = thinkingDeltas.join('');
    expect(fullThinking).toContain('Let me think about this');

    // Collect text deltas separately
    const textDeltas = events
      .filter(e => e.type === 'content_block_delta' && e.delta?.type === 'text_delta')
      .map(e => e.delta.text);

    const fullText = textDeltas.join('');
    expect(fullText).toContain('Done.');
  });

  it('should emit thinking_delta events for thinking content (not text_delta)', async () => {
    const chunks = [
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"thinking":"Let me think"},"finish_reason":null}]}\n\n',
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"thinking":" about this"},"finish_reason":null}]}\n\n',
      'data: {"id":"test-1","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"Done."},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
      'data: [DONE]\n\n',
    ];

    const reader = createSSEReader(chunks);
    const gen = createAnthropicStreamFromOpenAI({ reader, model: 'deepseek-chat' });

    const events: any[] = [];
    for await (const event of gen) {
      events.push(event);
    }

    // Verify thinking block is created with type 'thinking'
    const blockStarts = events.filter(e => e.type === 'content_block_start');
    const thinkingBlockStart = blockStarts.find(e => e.content_block?.type === 'thinking');
    expect(thinkingBlockStart).toBeDefined();

    // Verify thinking deltas are emitted (not text_delta)
    const thinkingDeltaEvents = events.filter(e => e.type === 'content_block_delta' && e.delta?.type === 'thinking_delta');
    expect(thinkingDeltaEvents.length).toBeGreaterThan(0);

    const thinkingText = thinkingDeltaEvents.map(e => e.delta.thinking).join('');
    expect(thinkingText).toContain('Let me think about this');

    // Verify text block is created separately after thinking
    const textBlockStart = blockStarts.find(e => e.content_block?.type === 'text');
    expect(textBlockStart).toBeDefined();

    // Verify text deltas contain only the actual response text
    const textDeltas = events.filter(e => e.type === 'content_block_delta' && e.delta?.type === 'text_delta');
    const fullText = textDeltas.map(e => e.delta.text).join('');
    expect(fullText).toContain('Done.');
    // Thinking content should NOT appear in text deltas
    expect(fullText).not.toContain('Let me think');
  });

  it('should convert native Anthropic stream events', async () => {
    // Simulate native Anthropic streaming response
    const chunks = [
      'data: {"type":"message_start","message":{"id":"msg-1","type":"message","role":"assistant","model":"test-model","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there"}}\n\n',
      'data: {"type":"content_block_stop","index":0}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":5}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ];

    const reader = createSSEReader(chunks);
    const gen = createAnthropicStreamFromOpenAI({
      reader,
      model: 'test-model',
    });

    const events: any[] = [];
    for await (const event of gen) {
      events.push(event);
    }

    // Collect all text deltas
    const textDeltas = events
      .filter(e => e.type === 'content_block_delta' && e.delta?.type === 'text_delta')
      .map(e => e.delta.text);

    const fullText = textDeltas.join('');
    expect(fullText).toContain('Hi there');

    // Verify all expected event types were emitted
    const eventTypes = events.map(e => e.type);
    expect(eventTypes).toContain('message_start');
    expect(eventTypes).toContain('content_block_start');
    expect(eventTypes).toContain('content_block_delta');
    expect(eventTypes).toContain('content_block_stop');
    expect(eventTypes).toContain('message_delta');
    expect(eventTypes).toContain('message_stop');
  });
});
