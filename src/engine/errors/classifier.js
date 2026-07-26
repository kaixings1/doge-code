/**
 * engine/errors/classifier.ts — 错误分类器（文档 02 §9.2）
 */
import { DogeCodeError, ErrorType } from "./index.ts";
export class ErrorClassifier {
    static classify(error) {
        if (error instanceof DogeCodeError)
            return error.type;
        if (error instanceof Error) {
            const m = error.message.toLowerCase();
            if (m.includes("rate limit") || m.includes("429"))
                return ErrorType.RATE_LIMIT;
            if (m.includes("unauthorized") || m.includes("401"))
                return ErrorType.AUTH_ERROR;
            if (m.includes("too long"))
                return ErrorType.PROMPT_TOO_LONG;
            if (m.includes("model not found") || m.includes("404"))
                return ErrorType.MODEL_NOT_FOUND;
            if (m.includes("invalid") || m.includes("400"))
                return ErrorType.INVALID_REQUEST;
            if (m.includes("server error") || m.includes("500"))
                return ErrorType.SERVER_ERROR;
            if (m.includes("network") || m.includes("econnrefused"))
                return ErrorType.NETWORK_ERROR;
            if (m.includes("timeout") || m.includes("etimedout"))
                return ErrorType.TIMEOUT;
            if (m.includes("tool not found"))
                return ErrorType.TOOL_NOT_FOUND;
            if (m.includes("permission denied"))
                return ErrorType.PERMISSION_DENIED;
            if (m.includes("abort") || m.includes("cancel"))
                return ErrorType.USER_ABORT;
        }
        return ErrorType.UNKNOWN;
    }
    static wrap(error) {
        if (error instanceof DogeCodeError)
            return error;
        const type = this.classify(error);
        const message = error instanceof Error ? error.message : String(error);
        return new DogeCodeError(type, message, { originalError: error });
    }
}
