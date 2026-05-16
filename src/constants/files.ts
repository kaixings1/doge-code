/**
 * 文本操作中应跳过的二进制文件扩展名。
 * 这些文件无法被有意义地作为文本进行比较，且通常体积较大。
 */
export const BINARY_EXTENSIONS = new Set([
  // 图片
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  '.tiff',
  '.tif',
  // 视频
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.wmv',
  '.flv',
  '.m4v',
  '.mpeg',
  '.mpg',
  // 音频
  '.mp3',
  '.wav',
  '.ogg',
  '.flac',
  '.aac',
  '.m4a',
  '.wma',
  '.aiff',
  '.opus',
  // 归档文件
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  '.xz',
  '.z',
  '.tgz',
  '.iso',
  // 可执行文件/二进制
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.o',
  '.a',
  '.obj',
  '.lib',
  '.app',
  '.msi',
  '.deb',
  '.rpm',
  // 文档（PDF 在此；FileReadTool 在调用处排除它）
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
  // 字体
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
  // 字节码 / VM 产物
  '.pyc',
  '.pyo',
  '.class',
  '.jar',
  '.war',
  '.ear',
  '.node',
  '.wasm',
  '.rlib',
  // 数据库文件
  '.sqlite',
  '.sqlite3',
  '.db',
  '.mdb',
  '.idx',
  // 设计 / 3D
  '.psd',
  '.ai',
  '.eps',
  '.sketch',
  '.fig',
  '.xd',
  '.blend',
  '.3ds',
  '.max',
  // Flash
  '.swf',
  '.fla',
  // 锁定/性能分析数据
  '.lockb',
  '.dat',
  '.data',
])

/**
 * 检查文件路径是否具有二进制扩展名。
 */
export function hasBinaryExtension(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  return BINARY_EXTENSIONS.has(ext)
}

/**
 * 用于二进制内容检测的读取字节数。
 */
const BINARY_CHECK_SIZE = 8192

/**
 * 通过查找空字节或高比例不可打印字符来检查缓冲区是否包含二进制内容。
 */
export function isBinaryContent(buffer: Buffer): boolean {
  // 检查前 BINARY_CHECK_SIZE 个字节（如果缓冲区较小则检查全部）
  const checkSize = Math.min(buffer.length, BINARY_CHECK_SIZE)

  let nonPrintable = 0
  for (let i = 0; i < checkSize; i++) {
    const byte = buffer[i]!
    // 空字节是二进制的强指标
    if (byte === 0) {
      return true
    }
    // 统计不可打印、非空白字节
    // 可打印 ASCII 为 32-126，加上常见空白字符（9、10、13）
    if (
      byte < 32 &&
      byte !== 9 && // 制表符
      byte !== 10 && // 换行符
      byte !== 13 // 回车符
    ) {
      nonPrintable++
    }
  }

  // 如果超过 10% 不可打印，则很可能是二进制
  return nonPrintable / checkSize > 0.1
}
