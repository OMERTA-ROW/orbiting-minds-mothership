// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import * as THREE from "three";

/**
 * Procedural surface maps for the descent scene. Everything is generated on a
 * canvas at a tier-driven resolution, so there is real texture at orbit, at
 * cloud level and on the ground without shipping image assets.
 *
 * Results are cached per (kind, size) so re-mounting a band is free.
 */

const cache = new Map<string, THREE.Texture>();

const canvasOf = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

/** Tileable value noise + fbm on a small lattice, sampled bilinearly. */
const makeNoise = (seed: number, size: number) => {
  const r = rng(seed);
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const at = (x: number, y: number) =>
    grid[((y % size) + size) % size * size + (((x % size) + size) % size)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = smooth(x - xi);
    const ty = smooth(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
};

const fbm = (
  noise: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves: number,
) => {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    v += noise(x * f, y * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / norm;
};

const finish = (canvas: HTMLCanvasElement, srgb: boolean, aniso: number, repeat = 1) => {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = aniso;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
};

const memo = (key: string, build: () => THREE.Texture) => {
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = build();
  cache.set(key, tex);
  return tex;
};

/** Planet day map — oceans, shelves, landmasses, ice caps, desert bands. */
export const planetDayMap = (size: number, aniso: number) =>
  memo(`day:${size}`, () => {
    const w = size * 2;
    const h = size;
    const c = canvasOf(w, h);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    const n1 = makeNoise(1337, 64);
    const n2 = makeNoise(7717, 128);
    for (let y = 0; y < h; y++) {
      const lat = y / h; // 0 north .. 1 south
      const polar = Math.pow(Math.abs(lat - 0.5) * 2, 3);
      for (let x = 0; x < w; x++) {
        const u = (x / w) * 24;
        const v = (y / h) * 12;
        const land = fbm(n1, u, v, 5) * 0.75 + fbm(n2, u * 2.4, v * 2.4, 4) * 0.25;
        const isLand = land > 0.52;
        let r: number, g: number, b: number;
        if (isLand) {
          const dry = fbm(n2, u * 1.7 + 40, v * 1.7, 4);
          const green = 0.35 + dry * 0.4;
          r = 46 + dry * 110;
          g = 78 + green * 90;
          b = 40 + dry * 40;
          const alt = (land - 0.52) * 3;
          r += alt * 40;
          g += alt * 34;
          b += alt * 30;
        } else {
          const depth = Math.min(1, (0.52 - land) * 4);
          r = 6 + (1 - depth) * 20;
          g = 22 + (1 - depth) * 52;
          b = 58 + (1 - depth) * 66;
        }
        // ice caps
        const ice = Math.min(1, Math.max(0, polar * 1.25 - 0.25));
        r = r * (1 - ice) + 236 * ice;
        g = g * (1 - ice) + 242 * ice;
        b = b * (1 - ice) + 250 * ice;
        const i = (y * w + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return finish(c, true, aniso);
  });

/** Night side — city light clusters hugging the coastlines. */
export const planetNightMap = (size: number, aniso: number) =>
  memo(`night:${size}`, () => {
    const w = size * 2;
    const h = size;
    const c = canvasOf(w, h);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    const n1 = makeNoise(1337, 64);
    const r = rng(99);
    const dots = Math.round(size * 6);
    for (let i = 0; i < dots; i++) {
      const x = r() * w;
      const y = h * (0.12 + r() * 0.76);
      const land = fbm(n1, (x / w) * 24, (y / h) * 12, 5);
      if (land < 0.53 || land > 0.72) continue;
      const rad = 0.8 + r() * (size / 160);
      const a = 0.25 + r() * 0.6;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 4);
      g.addColorStop(0, `rgba(255,206,140,${a})`);
      g.addColorStop(0.4, `rgba(120,220,255,${a * 0.35})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    return finish(c, true, aniso);
  });

/** Cloud alpha map — banded, wispy, tileable in longitude. */
export const cloudAlphaMap = (size: number, aniso: number) =>
  memo(`cloud:${size}`, () => {
    const w = size * 2;
    const h = size;
    const c = canvasOf(w, h);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    const n = makeNoise(4242, 96);
    for (let y = 0; y < h; y++) {
      const lat = (y / h - 0.5) * 2;
      const band = 0.5 + Math.sin(lat * 7.5) * 0.16;
      for (let x = 0; x < w; x++) {
        const v = fbm(n, (x / w) * 18, (y / h) * 9, 5);
        let a = Math.max(0, v * 1.35 - band);
        a = Math.min(1, a * 2.2);
        // coverage lives in RGB: alphaMap samples the green channel
        const i = (y * w + x) * 4;
        const cov = a * 255;
        img.data[i] = cov;
        img.data[i + 1] = cov;
        img.data[i + 2] = cov;

        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return finish(c, false, aniso);
  });

/** Street-level ground — wet asphalt, lane paint, kerbs, grime. */
export const streetGroundMap = (size: number, aniso: number) =>
  memo(`street:${size}`, () => {
    const s = size;
    const c = canvasOf(s, s);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#0b0d10";
    ctx.fillRect(0, 0, s, s);

    // grain
    const img = ctx.getImageData(0, 0, s, s);
    const n = makeNoise(555, 128);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const g = fbm(n, (x / s) * 40, (y / s) * 40, 4);
        const i = (y * s + x) * 4;
        const v = 8 + g * 26;
        img.data[i] = v;
        img.data[i + 1] = v + 2;
        img.data[i + 2] = v + 6;
      }
    }
    ctx.putImageData(img, 0, 0);

    // road cross with kerbs and centre lane markings
    const road = s * 0.34;
    ctx.fillStyle = "#141820";
    ctx.fillRect(0, s / 2 - road / 2, s, road);
    ctx.fillRect(s / 2 - road / 2, 0, road, s);
    ctx.strokeStyle = "rgba(120,240,255,0.5)";
    ctx.lineWidth = Math.max(1, s / 300);
    ctx.setLineDash([s / 26, s / 20]);
    ctx.beginPath();
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s, s / 2);
    ctx.moveTo(s / 2, 0);
    ctx.lineTo(s / 2, s);
    ctx.stroke();
    ctx.setLineDash([]);

    // kerb edges
    ctx.strokeStyle = "rgba(180,190,205,0.32)";
    ctx.lineWidth = Math.max(1, s / 400);
    ctx.strokeRect(0, s / 2 - road / 2, s, road);
    ctx.strokeRect(s / 2 - road / 2, 0, road, s);

    return finish(c, true, aniso, 1);
  });

/** Facade map for instanced towers — lit window grid on dark composite. */
export const facadeMap = (size: number, aniso: number) =>
  memo(`facade:${size}`, () => {
    const s = size;
    const c = canvasOf(s, s);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#0a0c11";
    ctx.fillRect(0, 0, s, s);
    const cols = 16;
    const rows = 24;
    const r = rng(31337);
    const cw = s / cols;
    const rh = s / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lit = r();
        const px = x * cw + cw * 0.22;
        const py = y * rh + rh * 0.22;
        const pw = cw * 0.56;
        const ph = rh * 0.5;
        if (lit > 0.62) {
          const warm = r() > 0.55;
          ctx.fillStyle = warm
            ? `rgba(255,196,120,${0.45 + r() * 0.5})`
            : `rgba(110,236,255,${0.35 + r() * 0.5})`;
        } else {
          ctx.fillStyle = `rgba(24,30,40,${0.6 + r() * 0.3})`;
        }
        ctx.fillRect(px, py, pw, ph);
      }
    }
    // panel seams
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = Math.max(1, s / 512);
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cw, 0);
      ctx.lineTo(x * cw, s);
      ctx.stroke();
    }
    return finish(c, true, aniso, 1);
  });

/** Free every cached map — called when the scene unmounts. */
export const disposeWorldTextures = () => {
  cache.forEach((t) => t.dispose());
  cache.clear();
};
