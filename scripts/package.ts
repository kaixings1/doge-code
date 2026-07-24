import { spawn } from 'child_process';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');
const packageDir = join(rootDir, 'packages');

interface PackageConfig {
  platform: string;
  arch: string;
  executable: string;
  archive: string;
}

const PACKAGE_CONFIGS: PackageConfig[] = [
  { platform: 'windows', arch: 'x64', executable: 'doge.exe', archive: 'doge-windows-x64.zip' },
  { platform: 'windows', arch: 'arm64', executable: 'doge-arm64.exe', archive: 'doge-windows-arm64.zip' },
  { platform: 'macos', arch: 'x64', executable: 'doge', archive: 'doge-macos-x64.tar.gz' },
  { platform: 'macos', arch: 'arm64', executable: 'doge-arm64', archive: 'doge-macos-arm64.tar.gz' },
  { platform: 'linux', arch: 'x64', executable: 'doge', archive: 'doge-linux-x64.tar.gz' },
  { platform: 'linux', arch: 'arm64', executable: 'doge-arm64', archive: 'doge-linux-arm64.tar.gz' },
];

async function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: rootDir,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

function calculateChecksum(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

async function createReadme(): Promise<void> {
  const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
  const version = packageJson.version;

  const readme = `# Doge Code ${version}

## 安装

### Windows

\`\`\`powershell
# 解压并运行
doge.exe
\`\`\`

### macOS

\`\`\`bash
# 解压并运行
chmod +x doge
./doge
\`\`\`

### Linux

\`\`\`bash
# 解压并运行
chmod +x doge
./doge
\`\`\`

## 配置

创建配置文件 \`~/.doge/api.json\`：

\`\`\`json
{
  "activePreset": "anthropic-claude",
  "presets": {
    "anthropic-claude": {
      "provider": "anthropic",
      "apiKey": "your-api-key",
      "baseUrl": "https://api.anthropic.com/v1",
      "model": "claude-3-5-sonnet-20241022"
    }
  }
}
\`\`\`

## 使用

\`\`\`bash
# 查看帮助
doge --help

# 开始对话
doge

# 执行命令
doge /model
\`\`\`

## 校验和

${PACKAGE_CONFIGS.map(config => {
  const archivePath = join(packageDir, config.archive);
  if (existsSync(archivePath)) {
    const checksum = calculateChecksum(archivePath);
    return `\n### ${config.platform} (${config.arch})\n\`${config.archive}\`\nSHA256: \`${checksum}\``;
  }
  return '';
}).join('\n')}

## 许可证

MIT
`;

  writeFileSync(join(packageDir, 'README.md'), readme, 'utf-8');
}

async function packagePlatform(config: PackageConfig): Promise<void> {
  console.log(`Packaging ${config.platform} (${config.arch})...`);

  if (!existsSync(packageDir)) {
    mkdirSync(packageDir, { recursive: true });
  }

  const executablePath = join(distDir, config.executable);
  const archivePath = join(packageDir, config.archive);
  const tempDir = join(packageDir, 'temp');

  // 创建临时目录
  mkdirSync(tempDir, { recursive: true });

  // 复制可执行文件
  copyFileSync(executablePath, join(tempDir, config.executable));

  // 创建归档
  if (config.platform === 'windows') {
    await runCommand('powershell', [
      '-Command',
      `Compress-Archive -Path "${tempDir}/*" -DestinationPath "${archivePath}" -Force`,
    ]);
  } else {
    await runCommand('tar', [
      '-czf',
      archivePath,
      '-C',
      tempDir,
      config.executable,
    ]);
  }

  // 清理临时目录
  // TODO: 删除 tempDir

  console.log(`Packaged ${config.archive}`);
}

async function packageAll(): Promise<void> {
  console.log('Packaging all platforms...');

  for (const config of PACKAGE_CONFIGS) {
    await packagePlatform(config);
  }

  // 创建 README
  await createReadme();

  console.log('\nAll packages created!');
}

async function main(): Promise<void> {
  await packageAll();
}

main().catch((error) => {
  console.error('Package failed:', error);
  process.exit(1);
});