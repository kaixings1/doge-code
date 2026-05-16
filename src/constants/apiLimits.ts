/**
 * Anthropic API 限制
 *
 * 这些常量定义了 Anthropic API 强制执行的服务器端限制。
 * 保持此文件无依赖，以防止循环导入。
 *
 * 最后验证时间：2025-12-22
 * 来源：api/api/schemas/messages/blocks/ 和 api/api/config.py
 *
 * 未来：有关从服务器动态获取限制，请参见 issue #13240。
 */

// =============================================================================
// 图片限制
// =============================================================================

/**
 * 最大 base64 编码图片大小（API 强制执行）。
 * 如果 base64 字符串长度超过此值，API 将拒绝该图片。
 * 注意：这是 base64 长度，而非原始字节数。Base64 编码会使大小增加约 33%。
 */
export const API_IMAGE_MAX_BASE64_SIZE = 5 * 1024 * 1024 // 5 MB

/**
 * 目标原始图片大小，确保编码后不超过 base64 限制。
 * Base64 编码使大小增加 4/3 倍，因此推导出最大原始大小：
 * raw_size * 4/3 = base64_size → raw_size = base64_size * 3/4
 */
export const IMAGE_TARGET_RAW_SIZE = (API_IMAGE_MAX_BASE64_SIZE * 3) / 4 // 3.75 MB

/**
 * 客户端图片缩放的最大尺寸。
 *
 * 注意：API 会在内部对大于 1568px 的图片进行缩放（来源：
 * encoding/full_encoding.py），但这是在服务端处理，不会引发错误。
 * 这些客户端限制（2000px）稍大一些，以便在有益时保留质量。
 *
 * API_IMAGE_MAX_BASE64_SIZE（5MB）是实际的硬限制，超出会导致
 * API 错误。
 */
export const IMAGE_MAX_WIDTH = 2000
export const IMAGE_MAX_HEIGHT = 2000

// =============================================================================
// PDF 限制
// =============================================================================

/**
 * 适合 API 请求限制的最大原始 PDF 文件大小（编码后）。
 * API 的总请求大小限制为 32MB。Base64 编码使大小增加约
 * 33%（4/3），因此 20MB 原始 → 约 27MB base64，为对话上下文留出空间。
 */
export const PDF_TARGET_RAW_SIZE = 20 * 1024 * 1024 // 20 MB

/**
 * API 接受的最大 PDF 页数。
 */
export const API_PDF_MAX_PAGES = 100

/**
 * 超过此大小阈值时，PDF 将被提取为页面图片，
 * 而非作为 base64 文档块发送。这仅适用于
 * 第一方 API；非第一方始终使用提取方式。
 */
export const PDF_EXTRACT_SIZE_THRESHOLD = 3 * 1024 * 1024 // 3 MB

/**
 * 页面提取路径的最大 PDF 文件大小。超过此大小的
 * PDF 将被拒绝，以避免处理极大的文件。
 */
export const PDF_MAX_EXTRACT_SIZE = 100 * 1024 * 1024 // 100 MB

/**
 * Read 工具在使用 pages 参数单次调用时最大提取页数。
 */
export const PDF_MAX_PAGES_PER_READ = 20

/**
 * 页数超过此值的 PDF 在 @ 引用时将获得引用处理，
 * 而非直接内联到上下文中。
 */
export const PDF_AT_MENTION_INLINE_THRESHOLD = 10

// =============================================================================
// 媒体限制
// =============================================================================

/**
 * 每次 API 请求允许的最大媒体项数（图片 + PDF）。
 * API 会拒绝超出此限制的请求，并返回令人困惑的错误。
 * 我们在客户端进行验证，以提供清晰的错误消息。
 */
export const API_MAX_MEDIA_PER_REQUEST = 100
