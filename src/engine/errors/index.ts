/**
 * engine/errors/index.ts — 错误类型与自定义错误（文档 02 §9.1）
 */
export enum ErrorType {
  API_ERROR = "API_ERROR",
  RATE_LIMIT = "RATE_LIMIT",
  AUTH_ERROR = "AUTH_ERROR",
  PROMPT_TOO_LONG = "PROMPT_TOO_LONG",
  MODEL_NOT_FOUND = "MODEL_NOT_FOUND",
  INVALID_REQUEST = "INVALID_REQUEST",
  SERVER_ERROR = "SERVER_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT = "TIMEOUT",
  CONNECTION_REFUSED = "CONNECTION_REFUSED",
  TOOL_NOT_FOUND = "TOOL_NOT_FOUND",
  TOOL_EXECUTION_ERROR = "TOOL_EXECUTION_ERROR",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  STATE_ERROR = "STATE_ERROR",
  TOKEN_LIMIT_EXCEEDED = "TOKEN_LIMIT_EXCEEDED",
  MAX_ITERATIONS_EXCEEDED = "MAX_ITERATIONS_EXCEEDED",
  USER_ABORT = "USER_ABORT",
  INVALID_INPUT = "INVALID_INPUT",
  UNKNOWN = "UNKNOWN",
}

export class DogeCodeError extends Error {
  constructor(public type: ErrorType, message: string, public details?: unknown) {
    super(message);
    this.name = "DogeCodeError";
  }
  toJSON() {
    return { type: this.type, message: this.message, details: this.details, stack: this.stack };
  }
}

export class APIError extends DogeCodeError {
  constructor(message: string, public statusCode?: number, details?: unknown) {
    super(ErrorType.API_ERROR, message, { statusCode, ...(details as object) });
  }
}

export class RateLimitError extends DogeCodeError {
  constructor(public retryAfter?: number) {
    super(ErrorType.RATE_LIMIT, "超出速率限制", { retryAfter });
  }
}

export class TokenLimitExceededError extends DogeCodeError {
  constructor(public budgetCheck: { percentage: number }) {
    super(
      ErrorType.TOKEN_LIMIT_EXCEEDED,
      `Token limit exceeded: ${budgetCheck.percentage * 100}% used`,
      { budgetCheck },
    );
  }
}

export class ToolExecutionError extends DogeCodeError {
  constructor(toolName: string, originalError: Error) {
    super(ErrorType.TOOL_EXECUTION_ERROR, `Tool execution failed: ${toolName}`, {
      toolName,
      originalError: originalError.message,
    });
  }
}

export class StateError extends DogeCodeError {
  constructor(from: string, to: string, reason: string) {
    super(ErrorType.STATE_ERROR, `Invalid state transition: ${from} → ${to}. ${reason}`, {
      from,
      to,
      reason,
    });
  }
}