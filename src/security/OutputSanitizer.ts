/**
 * 输出净化器
 * 文件：src/security/OutputSanitizer.ts
 * 文档 16 §7.1
 */

export interface SanitizeOptions {
  redactSecrets: boolean;
  redactPaths: boolean;
  redactIPs: boolean;
  redactEmails: boolean;
  redactPhoneNumbers: boolean;
  redactCreditCards: boolean;
  maxOutputLength: number;
}

export class OutputSanitizer {
  private defaultOptions: SanitizeOptions = {
    redactSecrets: true,
    redactPaths: false,
    redactIPs: false,
    redactEmails: false,
    redactPhoneNumbers: false,
    redactCreditCards: true,
    maxOutputLength: 100000,
  };

  /**
   * 净化输出
   */
  sanitize(output: string, options: Partial<SanitizeOptions> = {}): string {
    const opts = { ...this.defaultOptions, ...options };
    let sanitized = output;

    // 限制长度
    if (sanitized.length > opts.maxOutputLength) {
      sanitized = sanitized.slice(0, opts.maxOutputLength) + '\n... [output truncated]';
    }

    // 净化密钥
    if (opts.redactSecrets) {
      sanitized = this.redactSecrets(sanitized);
    }

    // 净化路径
    if (opts.redactPaths) {
      sanitized = this.redactPaths(sanitized);
    }

    // 净化 IP 地址
    if (opts.redactIPs) {
      sanitized = this.redactIPs(sanitized);
    }

    // 净化邮箱
    if (opts.redactEmails) {
      sanitized = this.redactEmails(sanitized);
    }

    // 净化电话号码
    if (opts.redactPhoneNumbers) {
      sanitized = this.redactPhoneNumbers(sanitized);
    }

    // 净化信用卡号
    if (opts.redactCreditCards) {
      sanitized = this.redactCreditCards(sanitized);
    }

    return sanitized;
  }

  /**
   * 净化密钥
   */
  private redactSecrets(text: string): string {
    const patterns: Array<{ pattern: RegExp; replacement: string }> = [
      // API Key
      { pattern: /(?:api[_-]?key|apikey)["\s]*[:=]\s*["']?([a-zA-Z0-9\-_]{20,})["']?/gi, replacement: '$1=***REDACTED***' },
      // Bearer Token
      { pattern: /Bearer\s+([a-zA-Z0-9\-_\.]+)/gi, replacement: 'Bearer ***REDACTED***' },
      // Password
      { pattern: /(?:password|passwd|pwd)["\s]*[:=]\s*["']?([^"'\s]+)["']?/gi, replacement: '$1=***REDACTED***' },
      // Secret
      { pattern: /(?:secret|token)["\s]*[:=]\s*["']?([a-zA-Z0-9\-_]{16,})["']?/gi, replacement: '$1=***REDACTED***' },
      // AWS Access Key
      { pattern: /AKIA[0-9A-Z]{16}/g, replacement: '***AWS_KEY_REDACTED***' },
      // AWS Secret Key
      { pattern: /aws_secret_access_key\s*=\s*([a-zA-Z0-9/+=]{40})/gi, replacement: 'aws_secret_access_key=***REDACTED***' },
      // Private Key
      { pattern: /-----BEGIN\s+(RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/g, replacement: '***PRIVATE_KEY_REDACTED***' },
    ];

    let result = text;
    for (const { pattern, replacement } of patterns) {
      result = result.replace(pattern, replacement);
    }

    return result;
  }

  /**
   * 净化路径
   */
  private redactPaths(text: string): string {
    return text.replace(
      /(?:[A-Za-z]:\\|\/)(?:Users|home|root)[\/\\][^\/\\\s]+/g,
      '***PATH_REDACTED***'
    );
  }

  /**
   * 净化 IP 地址
   */
  private redactIPs(text: string): string {
    return text.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '***IP_REDACTED***');
  }

  /**
   * 净化邮箱
   */
  private redactEmails(text: string): string {
    return text.replace(
      /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      '***EMAIL_REDACTED***'
    );
  }

  /**
   * 净化电话号码
   */
  private redactPhoneNumbers(text: string): string {
    return text.replace(
      /(?:\+?86)?1[3-9]\d{9}/g,
      '***PHONE_REDACTED***'
    );
  }

  /**
   * 净化信用卡号
   */
  private redactCreditCards(text: string): string {
    return text.replace(
      /\b(?:\d[ -]*?){13,16}\b/g,
      '***CARD_REDACTED***'
    );
  }
}
