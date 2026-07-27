/**
 * engine/errors/index.ts — 错误类型与自定义错误（文档 02 §9.1）
 */
export var ErrorType;
(function (ErrorType) {
    ErrorType["API_ERROR"] = "API_ERROR";
    ErrorType["RATE_LIMIT"] = "RATE_LIMIT";
    ErrorType["AUTH_ERROR"] = "AUTH_ERROR";
    ErrorType["PROMPT_TOO_LONG"] = "PROMPT_TOO_LONG";
    ErrorType["MODEL_NOT_FOUND"] = "MODEL_NOT_FOUND";
    ErrorType["INVALID_REQUEST"] = "INVALID_REQUEST";
    ErrorType["SERVER_ERROR"] = "SERVER_ERROR";
    ErrorType["NETWORK_ERROR"] = "NETWORK_ERROR";
    ErrorType["TIMEOUT"] = "TIMEOUT";
    ErrorType["CONNECTION_REFUSED"] = "CONNECTION_REFUSED";
    ErrorType["TOOL_NOT_FOUND"] = "TOOL_NOT_FOUND";
    ErrorType["TOOL_EXECUTION_ERROR"] = "TOOL_EXECUTION_ERROR";
    ErrorType["PERMISSION_DENIED"] = "PERMISSION_DENIED";
    ErrorType["STATE_ERROR"] = "STATE_ERROR";
    ErrorType["TOKEN_LIMIT_EXCEEDED"] = "TOKEN_LIMIT_EXCEEDED";
    ErrorType["MAX_ITERATIONS_EXCEEDED"] = "MAX_ITERATIONS_EXCEEDED";
    ErrorType["USER_ABORT"] = "USER_ABORT";
    ErrorType["INVALID_INPUT"] = "INVALID_INPUT";
    ErrorType["UNKNOWN"] = "UNKNOWN";
})(ErrorType || (ErrorType = {}));
export class DogeCodeError extends Error {
    type;
    details;
    constructor(type, message, details) {
        super(message);
        this.type = type;
        this.details = details;
        this.name = "DogeCodeError";
    }
    toJSON() {
        return { type: this.type, message: this.message, details: this.details, stack: this.stack };
    }
}
export class APIError extends DogeCodeError {
    statusCode;
    constructor(message, statusCode, details) {
        super(ErrorType.API_ERROR, message, { statusCode, ...details });
        this.statusCode = statusCode;
    }
}
export class RateLimitError extends DogeCodeError {
    retryAfter;
    constructor(retryAfter) {
        super(ErrorType.RATE_LIMIT, "超出速率限制", { retryAfter });
        this.retryAfter = retryAfter;
    }
}
export class TokenLimitExceededError extends DogeCodeError {
    budgetCheck;
    constructor(budgetCheck) {
        super(ErrorType.TOKEN_LIMIT_EXCEEDED, `Token limit exceeded: ${budgetCheck.percentage * 100}% used`, { budgetCheck });
        this.budgetCheck = budgetCheck;
    }
}
export class ToolExecutionError extends DogeCodeError {
    constructor(toolName, originalError) {
        super(ErrorType.TOOL_EXECUTION_ERROR, `Tool execution failed: ${toolName}`, {
            toolName,
            originalError: originalError.message,
        });
    }
}
export class StateError extends DogeCodeError {
    constructor(from, to, reason) {
        super(ErrorType.STATE_ERROR, `Invalid state transition: ${from} → ${to}. ${reason}`, {
            from,
            to,
            reason,
        });
    }
}
//# sourceMappingURL=index.js.map