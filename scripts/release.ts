import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { VersionManager } from './version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

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

async function checkCleanGit(): Promise<boolean> {
  try {
    await runCommand('git', ['diff-index', '--quiet', 'HEAD', '--']);
    return true;
  } catch {
    return false;
  }
}

async function createGitTag(version: string): Promise<void> {
  await runCommand('git', ['tag', '-a', `v${version}`, '-m', `Release v${version}`]);
  await runCommand('git', ['push', 'origin', `v${version}`]);
}

async function createGitHubRelease(version: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log('Skipping GitHub release (no GITHUB_TOKEN)');
    return;
  }

  // 使用 GitHub CLI 创建发布
  try {
    await runCommand('gh', [
      'release',
      'create',
      `v${version}`,
      '--title', `Release v${version}`,
      '--notes', `Release notes for v${version}`,
      'packages/*',
    ]);
  } catch (error) {
    console.log('GitHub release failed:', error);
  }
}

async function publishToNPM(): Promise<void> {
  try {
    await runCommand('npm', ['publish']);
  } catch (error) {
    console.log('NPM publish failed:', error);
  }
}

async function release(type: 'major' | 'minor' | 'patch' | 'pre'): Promise<void> {
  console.log('Starting release process...');

  // 1. 检查 Git 状态
  console.log('Checking Git status...');
  const isClean = await checkCleanGit();
  if (!isClean) {
    console.error('Working directory is not clean. Please commit or stash changes.');
    process.exit(1);
  }

  // 2. 更新版本
  console.log(`Updating ${type} version...`);
  const versionManager = new VersionManager();
  const newVersion = versionManager[`bump${type.charAt(0).toUpperCase() + type.slice(1)}`]();
  console.log(`New version: ${newVersion}`);

  // 3. 提交版本变更
  console.log('Committing version change...');
  await runCommand('git', ['add', 'package.json']);
  await runCommand('git', ['commit', '-m', `chore: bump version to v${newVersion}`]);

  // 4. 构建项目
  console.log('Building project...');
  await runCommand('bun', ['run', 'build', 'all']);

  // 5. 打包
  console.log('Packaging...');
  await runCommand('bun', ['run', 'package']);

  // 6. 提交打包文件
  console.log('Committing packages...');
  await runCommand('git', ['add', 'packages/']);
  await runCommand('git', ['commit', '-m', `chore: add release packages for v${newVersion}`]);

  // 7. 推送到远程
  console.log('Pushing to remote...');
  await runCommand('git', ['push', 'origin', 'main']);

  // 8. 创建 Git Tag
  console.log('Creating Git tag...');
  await createGitTag(newVersion);

  // 9. 创建 GitHub Release
  console.log('Creating GitHub release...');
  await createGitHubRelease(newVersion);

  // 10. 发布到 NPM
  console.log('Publishing to NPM...');
  await publishToNPM();

  console.log('\nRelease complete!');
}

async function main(): Promise<void> {
  const type = process.argv[2] as 'major' | 'minor' | 'patch' | 'pre';

  if (!['major', 'minor', 'patch', 'pre'].includes(type)) {
    console.log('Usage: bun run release [major|minor|patch|pre]');
    process.exit(1);
  }

  await release(type);
}

main().catch((error) => {
  console.error('Release failed:', error);
  process.exit(1);
});