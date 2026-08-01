/**
 * 输入验证器
 * 文件：src/security/InputValidator.ts
 * 文档 16 §3.1
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: any;
}

export class InputValidator {
  /**
   * 验证字符串
   */
  validateString(
    value: any,
    options: {
      maxLength?: number;
      minLength?: number;
      pattern?: RegExp;
      allowEmpty?: boolean;
    } = {}
  ): ValidationResult {
    const errors: string[] = [];

    if (typeof value !== 'string') {
      return { valid: false, errors: ['Value must be a string'] };
    }

    if (!options.allowEmpty && value.length === 0) {
      errors.push('Value cannot be empty');
    }

    if (options.minLength && value.length < options.minLength) {
      errors.push(`Value must be at least ${options.minLength} characters`);
    }

    if (options.maxLength && value.length > options.maxLength) {
      errors.push(`Value must be at most ${options.maxLength} characters`);
    }

    if (options.pattern && !options.pattern.test(value)) {
      errors.push('Value does not match required pattern');
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: this.sanitizeString(value),
    };
  }

  /**
   * 验证文件路径
   */
  validateFilePath(path: string): ValidationResult {
    const errors: string[] = [];

    // 检查空路径
    if (!path || path.trim().length === 0) {
      return { valid: false, errors: ['Path cannot be empty'] };
    }

    // 检查路径遍历攻击
    if (path.includes('..')) {
      errors.push('Path traversal detected (.. is not allowed)');
    }

    // 检查绝对路径访问
    if (/^[a-zA-Z]:[\\\/]/.test(path) || path.startsWith('/')) {
      // 允许绝对路径，但需要额外检查
    }

    // 检查特殊字符
    const dangerousChars = /[<>:"|?*\x00-\x1f]/;
    if (dangerousChars.test(path)) {
      errors.push('Path contains dangerous characters');
    }

    // 检查 Windows 保留名称
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    const basename = path.split(/[\\\/]/).pop() || '';
    if (reservedNames.test(basename.split('.')[0])) {
      errors.push('Path uses reserved Windows name');
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: this.sanitizePath(path),
    };
  }

  /**
   * 验证命令
   */
  validateCommand(command: string): ValidationResult {
    const errors: string[] = [];

    if (!command || command.trim().length === 0) {
      return { valid: false, errors: ['Command cannot be empty'] };
    }

    // 检查危险命令
    const dangerousPatterns = [
      { pattern: /rm\s+-rf\s+\//, message: 'Recursive delete from root' },
      { pattern: /:\(\)\s*\{\s*:\|:\&\s*\}\s*;/, message: 'Fork bomb detected' },
      { pattern: /mkfs/, message: 'Filesystem format command' },
      { pattern: /dd\s+.*of=\/dev\//, message: 'Direct device write' },
      { pattern: />\s*\/dev\/sd[a-z]/, message: 'Direct device write' },
      { pattern: /chmod\s+777\s+\//, message: 'Setting world-writable on root' },
      { pattern: /curl.*\|\s*sh/, message: 'Remote code execution via curl' },
      { pattern: /wget.*\|\s*sh/, message: 'Remote code execution via wget' },
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(command)) {
        errors.push(`Dangerous command detected: ${message}`);
      }
    }

    // 检查命令注入
    if (/[$`]/.test(command) && !command.startsWith('echo')) {
      errors.push('Potential command injection (shell metacharacters)');
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: this.sanitizeCommand(command),
    };
  }

  /**
   * 验证 JSON
   */
  validateJSON(value: any, schema: Record<string, any>): ValidationResult {
    const errors: string[] = [];

    if (typeof value !== 'object' || value === null) {
      return { valid: false, errors: ['Value must be an object'] };
    }

    for (const [key, rule] of Object.entries(schema)) {
      const fieldRule = rule as Record<string, unknown>;

      if (fieldRule.required && !(key in value)) {
        errors.push(`Missing required field: ${key}`);
        continue;
      }

      if (key in value) {
        const fieldValue = value[key];

        if (fieldRule.type && typeof fieldValue !== fieldRule.type) {
          errors.push(`Field ${key} must be of type ${fieldRule.type}`);
        }

        if (fieldRule.maxLength && typeof fieldValue === 'string' && fieldValue.length > fieldRule.maxLength) {
          errors.push(`Field ${key} exceeds max length of ${fieldRule.maxLength}`);
        }

        if (fieldRule.pattern && typeof fieldValue === 'string' && !fieldRule.pattern.test(fieldValue)) {
          errors.push(`Field ${key} does not match required pattern`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: value,
    };
  }

  /**
   * 净化字符串
   */
  private sanitizeString(value: string): string {
    return value
      .replace(/[\x00-\x1f\x7f]/g, '') // 移除控制字符
      .replace(/javascript:/gi, '') // 移除 javascript: 协议
      .replace(/on\w+\s*=/gi, '') // 移除事件处理器
      .trim();
  }

  /**
   * 净化路径
   */
  private sanitizePath(path: string): string {
    return path
      .replace(/\.\./g, '') // 移除路径遍历
      .replace(/[<>:"|?*\x00-\x1f]/g, '') // 移除危险字符
      .replace(/\/+/g, '/') // 规范化斜杠
      .trim();
  }

  /**
   * 净化命令
   */
  private sanitizeCommand(command: string): string {
    // 移除危险字符，但保留命令结构
    return command
      .replace(/[\x00-\x1f]/g, ' ') // 控制字符替换为空格
      .trim();
  }
}
