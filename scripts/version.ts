import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const packageJsonPath = join(rootDir, 'package.json');

interface PackageJson {
  version: string;
  [key: string]: any;
}

export class VersionManager {
  private packageJson: PackageJson;

  constructor() {
    this.packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  }

  /**
   * 获取当前版本
   */
  getVersion(): string {
    return this.packageJson.version;
  }

  /**
   * 设置版本
   */
  setVersion(version: string): void {
    this.packageJson.version = version;
    this.write();
  }

  /**
   * 主版本升级
   */
  bumpMajor(): string {
    const [major, minor, patch] = this.parseVersion();
    const newVersion = `${major + 1}.0.0`;
    this.setVersion(newVersion);
    return newVersion;
  }

  /**
   * 次版本升级
   */
  bumpMinor(): string {
    const [major, minor, patch] = this.parseVersion();
    const newVersion = `${major}.${minor + 1}.0`;
    this.setVersion(newVersion);
    return newVersion;
  }

  /**
   * 补丁版本升级
   */
  bumpPatch(): string {
    const [major, minor, patch] = this.parseVersion();
    const newVersion = `${major}.${minor}.${patch + 1}`;
    this.setVersion(newVersion);
    return newVersion;
  }

  /**
   * 预发布版本
   */
  bumpPre(preId: string = 'alpha'): string {
    const [major, minor, patch, pre] = this.parseVersion(true);
    let preVersion = 0;

    if (pre) {
      const match = pre.match(/alpha\.(\d+)/);
      if (match) {
        preVersion = parseInt(match[1], 10) + 1;
      }
    }

    const newVersion = `${major}.${minor}.${patch}-${preId}.${preVersion}`;
    this.setVersion(newVersion);
    return newVersion;
  }

  /**
   * 解析版本
   */
  private parseVersion(withPre: boolean = false): (string | number)[] {
    const version = this.getVersion();
    const [main, pre] = version.split('-');
    const parts = main.split('.').map(Number);

    if (withPre) {
      return [...parts, pre];
    }

    return parts;
  }

  /**
   * 写入 package.json
   */
  private write(): void {
    writeFileSync(packageJsonPath, JSON.stringify(this.packageJson, null, 2), 'utf-8');
  }
}

/**
 * CLI 入口
 */
async function main(): Promise<void> {
  const manager = new VersionManager();
  const command = process.argv[2];

  let newVersion: string;

  switch (command) {
    case 'major':
      newVersion = manager.bumpMajor();
      console.log(`Bumped major version to ${newVersion}`);
      break;
    case 'minor':
      newVersion = manager.bumpMinor();
      console.log(`Bumped minor version to ${newVersion}`);
      break;
    case 'patch':
      newVersion = manager.bumpPatch();
      console.log(`Bumped patch version to ${newVersion}`);
      break;
    case 'pre':
      newVersion = manager.bumpPre();
      console.log(`Bumped pre-release version to ${newVersion}`);
      break;
    default:
      console.log(`Current version: ${manager.getVersion()}`);
      console.log('Usage: bun run version [major|minor|patch|pre]');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Version management failed:', error);
  process.exit(1);
});