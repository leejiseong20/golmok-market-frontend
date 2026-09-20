/**
 * 앱 아이콘 생성기.
 *
 * PNG 를 저장소에 손으로 넣어 두면 나중에 색이나 모양을 바꿀 때 다시 만들 방법이 없다.
 * 그래서 도형을 코드로 두고 여기서 뽑는다. `npm run icons` 로 다시 만들 수 있다.
 *
 * 이미지 라이브러리를 쓰지 않는다(런타임 의존성을 늘리지 않는다는 규칙과 같은 이유다).
 * Node 의 zlib 만으로 PNG 를 직접 쓴다 — PNG 는 "IHDR·IDAT·IEND 청크 + CRC" 라 손으로 쓸 만하다.
 *
 * 마크는 Icon.jsx 의 집 모양과 같은 계열이다(동네 = 집). 배경은 강조색, 집은 흰색이다.
 */
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(import.meta.dirname, "..", "public");

const ACCENT = [0xd2, 0x50, 0x2f]; // index.css 의 --accent
const WHITE = [0xff, 0xff, 0xff];
const CLEAR = [0, 0, 0, 0];

/* ---------- PNG 쓰기 ---------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 채널당 8비트
  header[9] = 6; // 색 유형 6 = RGBA
  // 각 줄 앞에 필터 바이트(0 = 필터 없음)가 붙는다.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- 도형 (0~1 좌표. 크기와 무관하게 같은 그림이 나온다) ---------- */

/** 모서리를 둥글린 정사각형. 가운데 영역은 늘 안쪽이고 네 귀퉁이만 원으로 자른다. */
function inRoundedSquare(x, y, radius) {
  if (radius <= 0) return x >= 0 && x <= 1 && y >= 0 && y <= 1;
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function inTriangle([x, y], [ax, ay], [bx, by], [cx, cy]) {
  const side = (px, py, qx, qy) => (qx - px) * (y - py) - (qy - py) * (x - px);
  const s1 = side(ax, ay, bx, by);
  const s2 = side(bx, by, cx, cy);
  const s3 = side(cx, cy, ax, ay);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

const inRect = ([x, y], x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** 집 마크. 지붕은 처마가 벽보다 넓고, 문은 배경색으로 뚫어 벽과 구분한다. */
function houseColor(point) {
  if (inRect(point, 0.43, 0.60, 0.57, 0.80)) return ACCENT;
  if (inTriangle(point, [0.5, 0.22], [0.12, 0.52], [0.88, 0.52])) return WHITE;
  if (inRect(point, 0.24, 0.52, 0.76, 0.80)) return WHITE;
  return null;
}

/** 아이콘 한 장. mark 는 집이 차지하는 비율(maskable 은 안전 영역 때문에 더 작다). */
function draw(size, { radius, mark }) {
  const SS = 4; // 한 픽셀을 4x4 로 나눠 평균낸다(계단 현상 방지)
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          const color = inRoundedSquare(x, y, radius)
            ? houseColor([0.5 + (x - 0.5) / mark, 0.5 + (y - 0.5) / mark]) ?? ACCENT
            : CLEAR;
          const alpha = color.length === 4 ? color[3] : 255;
          // 투명한 부분과 섞을 때 색이 어두워지지 않게 알파를 곱해서 더한다.
          r += color[0] * alpha; g += color[1] * alpha; b += color[2] * alpha; a += alpha;
        }
      }
      const i = (py * size + px) * 4;
      rgba[i] = a ? Math.round(r / a) : 0;
      rgba[i + 1] = a ? Math.round(g / a) : 0;
      rgba[i + 2] = a ? Math.round(b / a) : 0;
      rgba[i + 3] = Math.round(a / (SS * SS));
    }
  }
  return encodePng(size, rgba);
}

/*
 * radius 0.22: 안드로이드·PC 가 그대로 쓰는 아이콘이라 우리가 모서리를 둥글린다.
 * radius 0: maskable 과 iOS 는 운영체제가 알아서 모양을 자르므로 꽉 채운다.
 * maskable 의 mark 0.56: 가운데 80% 원 안에 들어와야 어떤 모양으로 잘려도 집이 잘리지 않는다.
 */
const TARGETS = [
  ["icon-192.png", 192, { radius: 0.22, mark: 0.70 }],
  ["icon-512.png", 512, { radius: 0.22, mark: 0.70 }],
  ["icon-maskable-512.png", 512, { radius: 0, mark: 0.56 }],
  ["apple-touch-icon.png", 180, { radius: 0, mark: 0.66 }],
];

for (const [name, size, options] of TARGETS) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, draw(size, options));
  console.log(`${name} ${size}x${size} ${fs.statSync(file).size} bytes`);
}
