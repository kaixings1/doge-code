/**
 * 生成桌面应用图标资源
 * 生成 PNG 图标和 ICO 文件
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = join(__dirname, '..', 'build');
const ICONS_DIR = join(BUILD_DIR, 'icons');

// 确保目录存在
if (!existsSync(ICONS_DIR)) {
  mkdirSync(ICONS_DIR, { recursive: true });
}

/**
 * 生成 SVG 图标（Doge Code Logo - 简约风格）
 */
function generateSVG(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#e94560"/>
      <stop offset="100%" style="stop-color:#0f3460"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="url(#bg)"/>
  <circle cx="${size * 0.35}" cy="${size * 0.4}" r="${size * 0.08}" fill="#e94560"/>
  <circle cx="${size * 0.65}" cy="${size * 0.4}" r="${size * 0.08}" fill="#e94560"/>
  <path d="M ${size * 0.25} ${size * 0.6} Q ${size * 0.5} ${size * 0.8} ${size * 0.75} ${size * 0.6}" stroke="#e94560" stroke-width="${size * 0.04}" fill="none" stroke-linecap="round"/>
  <rect x="${size * 0.2}" y="${size * 0.25}" width="${size * 0.6}" height="${size * 0.06}" rx="${size * 0.03}" fill="#0f3460"/>
</svg>`;
}

/**
 * 生成简单的 PNG 图标（使用 BMP 转 PNG 的简化方法）
 * 这里生成一个有效的最小 PNG 文件
 */
function generateSimplePNG(size, r, g, b) {
  // PNG 签名
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk - 压缩图像数据
  const { deflateSync } = require('zlib');
  const rawData = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 3 + 1);
    rawData[rowStart] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const pixelStart = rowStart + 1 + x * 3;
      // 简单的圆形 logo
      const cx = size / 2, cy = size / 2;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxR = size * 0.45;

      if (dist < maxR) {
        // 内部 - 深色背景 + 红色圆点
        const dot1Dist = Math.sqrt((x - size * 0.35) ** 2 + (y - size * 0.38) ** 2);
        const dot2Dist = Math.sqrt((x - size * 0.65) ** 2 + (y - size * 0.38) ** 2);

        if (dot1Dist < size * 0.07 || dot2Dist < size * 0.07) {
          rawData[pixelStart] = 233;     // R
          rawData[pixelStart + 1] = 69;  // G
          rawData[pixelStart + 2] = 96;  // B
        } else {
          rawData[pixelStart] = 26;      // R
          rawData[pixelStart + 1] = 26;  // G
          rawData[pixelStart + 2] = 46;  // B
        }
      } else {
        // 外部 - 透明（这里用黑色替代，实际使用 alpha 通道）
        rawData[pixelStart] = 0;
        rawData[pixelStart + 1] = 0;
        rawData[pixelStart + 2] = 0;
      }
    }
  }

  const compressed = deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = getCRC32Table();
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function getCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      if (c & 1) {
        c = 0xEDB88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[i] = c >>> 0;
  }
  return table;
}

// 生成各种尺寸的 PNG 图标
const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];

console.log('🎨 生成 Doge Code 桌面应用图标...\n');

for (const size of sizes) {
  const png = generateSimplePNG(size, 26, 26, 46);
  const filename = `icon-${size}x${size}.png`;
  const filepath = join(ICONS_DIR, filename);
  writeFileSync(filepath, png);
  console.log(`  ✅ ${filename} (${png.length} bytes)`);
}

// 生成默认图标（256x256 作为 icon.png）
const defaultIcon = generateSimplePNG(256, 26, 26, 46);
writeFileSync(join(BUILD_DIR, 'icon.png'), defaultIcon);
console.log(`  ✅ icon.png (${defaultIcon.length} bytes)`);

// 生成 ICO 文件（Windows）
function generateICO(sizes) {
  // ICO header
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: ICO
  header.writeUInt16LE(sizes.length, 4); // count

  const entries = [];
  const dataParts = [];
  let offset = 6 + sizes.length * 16;

  for (const size of sizes) {
    const pngData = generateSimplePNG(size, 26, 26, 46);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(24, 6); // bits per pixel
    entry.writeUInt32LE(pngData.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    entries.push(entry);
    dataParts.push(pngData);
    offset += pngData.length;
  }

  return Buffer.concat([header, ...entries, ...dataParts]);
}

const icoSizes = [16, 32, 48, 64, 128, 256];
const icoData = generateICO(icoSizes);
writeFileSync(join(BUILD_DIR, 'icon.ico'), icoData);
console.log(`  ✅ icon.ico (${icoData.length} bytes, ${icoSizes.length} sizes)`);

console.log('\n🎉 图标生成完成！');
console.log(`   输出目录: ${BUILD_DIR}`);
