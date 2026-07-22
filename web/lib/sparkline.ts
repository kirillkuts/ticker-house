import { deflateSync } from "node:zlib";

// A tiny price sparkline as a PNG — no browser, no native canvas. We draw into
// an RGBA buffer and hand-encode the PNG (zlib for the pixel data), because
// email clients strip inline SVG and we don't want a headless browser in the
// send path. Rendered at 2x for crisp display.

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// values chronological (oldest -> newest). up tints the line/fill green, else red.
export function sparklinePng(values: number[], up: boolean): Buffer {
  const s = 2; // 2x
  const W = 240 * s, H = 48 * s, pad = 6 * s;
  const buf = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    buf[i * 4] = 255; buf[i * 4 + 1] = 255; buf[i * 4 + 2] = 255; buf[i * 4 + 3] = 255;
  }
  const line = up ? [10, 150, 90] : [214, 60, 60];
  const fill = line.map((c) => Math.round(255 + (c - 255) * 0.12)); // light tint over white

  const n = values.length;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const px = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(1, n - 1);
  const py = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const pts = values.map((v, i) => [px(i), py(v)] as [number, number]);

  const set = (x: number, y: number, c: number[]) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const o = (y * W + x) * 4;
    buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255;
  };

  for (let seg = 0; seg < n - 1; seg++) {
    const [x0, y0] = pts[seg], [x1, y1] = pts[seg + 1];
    for (let x = Math.round(x0); x <= Math.round(x1); x++) {
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      const y = y0 + (y1 - y0) * t;
      for (let yy = Math.round(y); yy <= H - pad; yy++) set(x, yy, fill);
    }
  }
  const th = s;
  for (let seg = 0; seg < n - 1; seg++) {
    const [x0, y0] = pts[seg], [x1, y1] = pts[seg + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      for (let dx = -th; dx <= th; dx++) for (let dy = -th; dy <= th; dy++) set(x + dx, y + dy, line);
    }
  }
  const [lx, ly] = pts[n - 1], r = 3 * s;
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (dx * dx + dy * dy <= r * r) set(lx + dx, ly + dy, line);

  const raw = new Uint8Array(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    raw.set(buf.subarray(y * W * 4, (y + 1) * W * 4), y * (1 + W * 4) + 1);
  }
  const idat = deflateSync(Buffer.from(raw));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))]);
}
