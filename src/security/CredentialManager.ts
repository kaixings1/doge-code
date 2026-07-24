/**
 * 凭证管理器
 * 文件：src/security/CredentialManager.ts
 * 文档 16 §9.1
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';

export interface StoredCredential {
  id: string;
  type: 'api_key' | 'token' | 'password' | 'certificate';
  name: string;
  value: string; // 加密后的值
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export class CredentialManager {
  private credentials: Map<string, StoredCredential> = new Map();
  private storageFile: string;
  private encryptionKey: Buffer;

  constructor(storageFile: string, encryptionKey?: string) {
    this.storageFile = storageFile;
    this.encryptionKey = encryptionKey
      ? crypto.scryptSync(encryptionKey, 'salt', 32)
      : crypto.scryptSync('default-key', 'salt', 32);
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    await this.load();
  }

  /**
   * 存储凭证
   */
  async setCredential(params: {
    id: string;
    type: StoredCredential['type'];
    name: string;
    value: string;
    expiresAt?: Date;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const encryptedValue = this.encrypt(params.value);
    const now = new Date();

    const credential: StoredCredential = {
      id: params.id,
      type: params.type,
      name: params.name,
      value: encryptedValue,
      createdAt: now,
      updatedAt: now,
      expiresAt: params.expiresAt,
      metadata: params.metadata,
    };

    this.credentials.set(params.id, credential);
    await this.save();
  }

  /**
   * 获取凭证
   */
  getCredential(id: string): string | null {
    const credential = this.credentials.get(id);

    if (!credential) {
      return null;
    }

    // 检查是否过期
    if (credential.expiresAt && credential.expiresAt < new Date()) {
      this.credentials.delete(id);
      return null;
    }

    return this.decrypt(credential.value);
  }

  /**
   * 获取凭证信息（不含值）
   */
  getCredentialInfo(id: string): Omit<StoredCredential, 'value'> | null {
    const credential = this.credentials.get(id);
    if (!credential) {
      return null;
    }

    const { value, ...info } = credential;
    return info;
  }

  /**
   * 删除凭证
   */
  deleteCredential(id: string): boolean {
    return this.credentials.delete(id);
  }

  /**
   * 列出所有凭证
   */
  listCredentials(): Omit<StoredCredential, 'value'>[] {
    return Array.from(this.credentials.values()).map(({ value, ...rest }) => rest);
  }

  /**
   * 加密
   */
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * 解密
   */
  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * 保存到文件
   */
  private async save(): Promise<void> {
    const data = Array.from(this.credentials.values());
    await fs.writeFile(this.storageFile, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * 从文件加载
   */
  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.storageFile, 'utf-8');
      const data = JSON.parse(content) as StoredCredential[];
      this.credentials = new Map(data.map((c) => [c.id, c]));
    } catch {
      // 文件不存在或格式错误，忽略
    }
  }
}
