// Минимальный PNG-кодек (RGBA, 8 бит) — чтобы снапшоты можно было посмотреть
// и сравнить попиксельно без зависимостей: только node:zlib.
// Формат: https://www.w3.org/TR/png/

import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8ClampedArray|Uint8Array} rgba построчно, по 4 байта на пиксель
 * @returns {Buffer}
 */
export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // фильтр «none»
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, rowStart + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // бит на канал
  header[9] = 6; // RGBA
  header[10] = 0; // deflate
  header[11] = 0; // без фильтрации
  header[12] = 0; // без чересстрочности

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Предсказание Пэта для фильтра 4. */
function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const distLeft = Math.abs(estimate - left);
  const distUp = Math.abs(estimate - up);
  const distUpLeft = Math.abs(estimate - upLeft);

  if (distLeft <= distUp && distLeft <= distUpLeft) return left;
  return distUp <= distUpLeft ? up : upLeft;
}

/**
 * Чтение PNG, который пишет этот же модуль (RGBA 8 бит, без чересстрочности).
 * Нужен golden-эталонам: сравнение идёт по пикселям, а не по хешу.
 * @param {Buffer} buffer
 * @returns {{width: number, height: number, data: Uint8ClampedArray}}
 */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('файл не является PNG');

  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      if (bitDepth !== 8 || colorType !== 6) {
        throw new Error(`ожидался RGBA8, получено depth=${bitDepth} type=${colorType}`);
      }
      if (data[12] !== 0) throw new Error('чересстрочный PNG не поддерживается');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }

    offset += length + 12;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const data = new Uint8ClampedArray(stride * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const target = y * stride;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? data[target + x - 4] : 0;
      const up = y > 0 ? data[target - stride + x] : 0;
      const upLeft = x >= 4 && y > 0 ? data[target - stride + x - 4] : 0;
      const value = raw[rowStart + 1 + x];

      let result;
      switch (filter) {
        case 0:
          result = value;
          break;
        case 1:
          result = value + left;
          break;
        case 2:
          result = value + up;
          break;
        case 3:
          result = value + ((left + up) >> 1);
          break;
        case 4:
          result = value + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`неизвестный фильтр PNG: ${filter}`);
      }

      data[target + x] = result & 255;
    }
  }

  return { width, height, data };
}
