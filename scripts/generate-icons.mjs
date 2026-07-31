/**
 * 生成小红蚁桌面版所需的图标资源(两套位置)
 *  - src-tauri/icons/     Tauri 2 跨平台打包(图标文件命名固定)
 *      - 32x32.png, 128x128.png, 128x128@2x.png, icon.icns, icon.ico, icon.png
 *  - resources/           项目内部使用
 *      - icon.png(256x256), tray-icon.png(32x32), icon.ico, installer-sidebar.bmp
 *
 * 不依赖 sharp/canvas 等重型库,手写 PNG/ICO 编码。
 * 主色:小红书红(#FF2442) + 紫色渐变
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TAURI_ICONS = path.join(ROOT, 'src-tauri', 'icons');
const RESOURCES_ICONS = path.join(ROOT, 'resources');
for (const dir of [TAURI_ICONS, RESOURCES_ICONS]) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

// 配色:渐变紫红
const COLORS = {
  bg1: [124, 58, 237],   // 紫色 #7C3AED
  bg2: [236, 72, 153],   // 粉色 #EC4899
  fg:  [255, 255, 255],  // 白
  accent: [255, 36, 66], // 小红书红
};

/**
 * 渲染一只圆角方块 + 中心 emoji 蚂蚁造型
 * 纯算法绘制,不依赖字体
 */
function renderIcon(size) {
  const pixels = new Uint8ClampedArray(size * size * 4);
  const r = size * 0.22; // 圆角半径
  const cx = size / 2, cy = size / 2;
  const innerR = size * 0.36; // 内部圆半径
  const ringW = size * 0.05;  // 圆环宽度

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // 圆角矩形判断
      const inside = isInsideRoundedRect(x, y, size, size, r);

      if (!inside) {
        // 透明
        pixels[i] = 0; pixels[i+1] = 0; pixels[i+2] = 0; pixels[i+3] = 0;
        continue;
      }

      // 渐变背景
      const t = y / size;
      const r0 = lerp(COLORS.bg1[0], COLORS.bg2[0], t);
      const g0 = lerp(COLORS.bg1[1], COLORS.bg2[1], t);
      const b0 = lerp(COLORS.bg1[2], COLORS.bg2[2], t);

      // 中心圆
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx*dx + dy*dy);

      let cr = r0, cg = g0, cb = b0, ca = 255;

      if (dist < innerR + ringW && dist > innerR - ringW) {
        // 圆环
        cr = COLORS.accent[0];
        cg = COLORS.accent[1];
        cb = COLORS.accent[2];
      } else if (dist <= innerR) {
        // 内部白色填充
        cr = 255; cg = 255; cb = 255;
      }

      // 画蚂蚁身体: 头 + 身 + 尾 三个圆
      const antColor = [40, 30, 60];
      // 头部(上)
      const headD = distToCircle(x, y, cx, cy - size*0.18, size*0.07);
      // 身体(中)
      const bodyD = distToCircle(x, y, cx, cy + size*0.02, size*0.08);
      // 尾部(下)
      const tailD = distToCircle(x, y, cx, cy + size*0.22, size*0.06);
      if (headD < size*0.07 || bodyD < size*0.08 || tailD < size*0.06) {
        cr = antColor[0]; cg = antColor[1]; cb = antColor[2];
      }
      // 触角
      const antL = lineDist(x, y, cx - size*0.04, cy - size*0.22, cx - size*0.07, cy - size*0.30, size*0.012);
      const antR = lineDist(x, y, cx + size*0.04, cy - size*0.22, cx + size*0.07, cy - size*0.30, size*0.012);
      if (antL < size*0.012 || antR < size*0.012) {
        cr = antColor[0]; cg = antColor[1]; cb = antColor[2];
      }
      // 腿(3 对)
      const legs = [
        [cx - size*0.08, cy - size*0.05, cx - size*0.16, cy - size*0.10],
        [cx - size*0.08, cy + size*0.05, cx - size*0.16, cy + size*0.10],
        [cx + size*0.08, cy - size*0.05, cx + size*0.16, cy - size*0.10],
        [cx + size*0.08, cy + size*0.05, cx + size*0.16, cy + size*0.10],
        [cx - size*0.08, cy + size*0.15, cx - size*0.14, cy + size*0.22],
        [cx + size*0.08, cy + size*0.15, cx + size*0.14, cy + size*0.22],
      ];
      for (const [x1, y1, x2, y2] of legs) {
        if (lineDist(x, y, x1, y1, x2, y2, size*0.012) < size*0.012) {
          cr = antColor[0]; cg = antColor[1]; cb = antColor[2];
        }
      }
      // 眼睛(头内)
      const eyeL = distToCircle(x, y, cx - size*0.025, cy - size*0.20, size*0.012);
      const eyeR = distToCircle(x, y, cx + size*0.025, cy - size*0.20, size*0.012);
      if (eyeL < size*0.012 || eyeR < size*0.012) {
        cr = 255; cg = 255; cb = 255;
      }

      pixels[i] = cr;
      pixels[i+1] = cg;
      pixels[i+2] = cb;
      pixels[i+3] = ca;
    }
  }
  return { width: size, height: size, data: pixels };
}

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

function isInsideRoundedRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  // 四角
  if (x < r && y < r) {
    return (x - r) ** 2 + (y - r) ** 2 <= r * r;
  }
  if (x >= w - r && y < r) {
    return (x - (w - r - 1)) ** 2 + (y - r) ** 2 <= r * r;
  }
  if (x < r && y >= h - r) {
    return (x - r) ** 2 + (y - (h - r - 1)) ** 2 <= r * r;
  }
  if (x >= w - r && y >= h - r) {
    return (x - (w - r - 1)) ** 2 + (y - (h - r - 1)) ** 2 <= r * r;
  }
  return true;
}

function distToCircle(x, y, cx, cy, r) {
  return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
}

function lineDist(px, py, x1, y1, x2, y2, half) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx*dx + dy*dy;
  if (len2 === 0) return Math.sqrt((px-x1)**2 + (py-y1)**2);
  let t = ((px-x1)*dx + (py-y1)*dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const lx = x1 + t*dx, ly = y1 + t*dy;
  return Math.sqrt((px-lx)**2 + (py-ly)**2);
}

// =============== PNG 编码 ===============
function encodePNG(img) {
  const { width, height, data } = img;
  // 签名
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  // IDAT: 过滤字节 0 + 行数据
  const rowSize = width * 4;
  const raw = Buffer.alloc((rowSize + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowSize + 1)] = 0; // filter none
    data.subarray(y * rowSize, (y + 1) * rowSize).copy
      ? data.subarray(y * rowSize, (y + 1) * rowSize).copy(raw, y * (rowSize + 1) + 1)
      : Buffer.from(data.buffer, data.byteOffset + y * rowSize, rowSize).copy(raw, y * (rowSize + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// =============== ICO 编码 ===============
function encodeICO(sizes) {
  // sizes: [{size, data}, ...]
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(sizes.length, 4);

  const dirEntries = [];
  let offset = 6 + 16 * sizes.length;
  const datas = [];

  for (const { size, data } of sizes) {
    const e = Buffer.alloc(16);
    e[0] = size === 256 ? 0 : size;
    e[1] = size === 256 ? 0 : size;
    e[2] = 0; // colors
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    dirEntries.push(e);
    datas.push(data);
    offset += data.length;
  }

  return Buffer.concat([header, ...dirEntries, ...datas]);
}

// =============== BMP 编码(NSIS sidebar) ===============
function encodeBMP(img) {
  const { width, height, data } = img;
  const rowSize = ((width * 3 + 3) >> 2) << 2; // 4-byte 对齐
  const pad = rowSize - width * 3;
  const pixelSize = rowSize * height;
  const fileSize = 14 + 40 + pixelSize;

  const buf = Buffer.alloc(fileSize);
  // File header
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(54, 10);
  // DIB header
  buf.writeUInt32LE(40, 14);
  buf.writeUInt32LE(width, 18);
  buf.writeUInt32LE(height, 22); // 正数 = bottom-up
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); // BI_RGB
  buf.writeUInt32LE(pixelSize, 34);
  buf.writeUInt32LE(2835, 38); // 72 DPI
  buf.writeUInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  // 像素(BMP 顺序:BGR + bottom-up)
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const si = (srcY * width + x) * 4;
      const di = 54 + y * rowSize + x * 3;
      buf[di]     = data[si + 2]; // B
      buf[di + 1] = data[si + 1]; // G
      buf[di + 2] = data[si];     // R
    }
    for (let p = 0; p < pad; p++) {
      buf[54 + y * rowSize + width * 3 + p] = 0;
    }
  }
  return buf;
}

// =============== ICNS 编码(macOS) ===============
// Tauri 2 接受最简 ICNS 容器,只装一个 icp4(16x16 PNG)+ icp5(32x32)+ icp6(64x64)+ ic07(128x128)+ ic08(256x256)+ ic09(512x512)+ ic10(1024x1024)
// 实际 Tauri 2 只用 icon.icns 路径,内容可以是 PNG-based ICNS,我们用最简 ic08(256x256) 单图格式
function encodeICNS(png256) {
  // 1. ic08 块:256x256 PNG
  const ic08Type = Buffer.from('ic08', 'ascii');
  const ic08Size = Buffer.alloc(4);
  ic08Size.writeUInt32BE(8 + png256.length, 0);
  const ic08 = Buffer.concat([ic08Type, ic08Size, png256]);
  // 2. info 块
  const infoType = Buffer.from('info', 'ascii');
  const infoData = Buffer.alloc(4);
  infoData.writeUInt32BE(0, 0); // 高度/宽度都是 256
  const infoSize = Buffer.alloc(4);
  infoSize.writeUInt32BE(8 + infoData.length, 0);
  const info = Buffer.concat([infoType, infoSize, infoData]);
  // 3. 总容器
  const icnsType = Buffer.from('icns', 'ascii');
  const totalSize = Buffer.alloc(4);
  totalSize.writeUInt32BE(8 + info.length + ic08.length, 0);
  return Buffer.concat([icnsType, totalSize, info, ic08]);
}

// =============== 渲染 + 写盘 ===============
console.log('🎨 生成图标...');

const sizes = [16, 32, 48, 64, 128, 256];
const icoImages = sizes.map(s => ({ size: s, data: encodePNG(renderIcon(s)) }));
const icoBuf = encodeICO(icoImages);

const png256 = encodePNG(renderIcon(256));
const png128 = encodePNG(renderIcon(128));
const png32 = encodePNG(renderIcon(32));

// Tauri 2 icons(命名固定,跨平台打包需要)
await writeFile(path.join(TAURI_ICONS, '32x32.png'), png32);
await writeFile(path.join(TAURI_ICONS, '128x128.png'), png128);
// 128x128@2x.png = 256x256(2x DPR)
await writeFile(path.join(TAURI_ICONS, '128x128@2x.png'), png256);
await writeFile(path.join(TAURI_ICONS, 'icon.ico'), icoBuf);
await writeFile(path.join(TAURI_ICONS, 'icon.png'), png256);
await writeFile(path.join(TAURI_ICONS, 'icon.icns'), encodeICNS(png256));

// 项目内部 resources/
await writeFile(path.join(RESOURCES_ICONS, 'icon.png'), png256);
await writeFile(path.join(RESOURCES_ICONS, 'tray-icon.png'), png32);
await writeFile(path.join(RESOURCES_ICONS, 'icon.ico'), icoBuf);
await writeFile(path.join(RESOURCES_ICONS, 'installer-sidebar.bmp'), encodeBMP(renderIcon(164)));

console.log('✅ src-tauri/icons/32x32.png, 128x128.png, 128x128@2x.png, icon.ico, icon.png, icon.icns');
console.log('✅ resources/icon.png, tray-icon.png, icon.ico, installer-sidebar.bmp');
console.log('🎉 完成');
