import { useEffect, useRef } from 'react';

/**
 * A figure plate for the sign-in page: a cloud of points (the noise RFdiffusion starts from) settles, residue by
 * residue, into the backbone of a three-helix bundle, then dissolves and starts over. The caption's step counter is
 * tied to the animation. With reduced motion the finished fold is drawn once.
 */

const STEPS = 50; // matches the studio's default number of diffusion steps
const N_HELIX = 26;
const N_LOOP = 6;

// Deterministic noise so every cycle starts from a fresh but reproducible cloud.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type V3 = [number, number, number];

/** C-alpha trace of three antiparallel helices joined by short loops, in arbitrary units (~±3). */
function buildBackbone(): V3[] {
  const centers: [number, number][] = [
    [-1.55, -0.9],
    [1.55, -0.9],
    [0, 1.75],
  ];
  const pts: V3[] = [];
  const helixPoint = (h: number, k: number): V3 => {
    const dir = h % 2 === 0 ? 1 : -1;
    const a = (k * 100 * Math.PI) / 180 + h * 1.3;
    const z = dir * (k * 0.19 - (N_HELIX * 0.19) / 2);
    return [centers[h][0] + 0.62 * Math.cos(a), centers[h][1] + 0.62 * Math.sin(a), z];
  };
  for (let h = 0; h < 3; h++) {
    for (let k = 0; k < N_HELIX; k++) pts.push(helixPoint(h, k));
    if (h < 2) {
      const from = helixPoint(h, N_HELIX - 1);
      const to = helixPoint(h + 1, 0);
      for (let k = 1; k <= N_LOOP; k++) {
        const t = k / (N_LOOP + 1);
        const bulge = Math.sin(t * Math.PI) * 0.9;
        const s = t * t * (3 - 2 * t);
        pts.push([
          from[0] + (to[0] - from[0]) * s,
          from[1] + (to[1] - from[1]) * s,
          from[2] + (to[2] - from[2]) * s + (from[2] >= 0 ? bulge : -bulge),
        ]);
      }
    }
  }
  return pts;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// Phases of one cycle, in seconds.
const T_DENOISE = 9;
const T_HOLD = 3.2;
const T_DISSOLVE = 1.6;
const T_CYCLE = T_DENOISE + T_HOLD + T_DISSOLVE;

const INK: [number, number, number] = [11, 43, 51]; // #0B2B33
const EMERALD: [number, number, number] = [16, 168, 117]; // #10A875
const NOISE: [number, number, number] = [111, 138, 131]; // #6F8A83

const mix = (a: number[], b: number[], t: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

export function DenoisingField({ stepRef }: { stepRef: React.RefObject<HTMLElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const target = buildBackbone();
    const n = target.length;
    const delay = Array.from({ length: n }, (_, i) => mulberry32(7 + i)() * 0.35);
    let noise: V3[] = [];
    let noiseCycle = Number.NaN; // never equals a real cycle, so the first frame always builds the cloud
    const makeNoise = (cycle: number) => {
      const rnd = mulberry32(1000 + cycle * 97);
      noise = Array.from({ length: n }, () => {
        // points in a ball, slightly larger than the finished fold
        const u = rnd(), v = rnd(), w = rnd();
        const r = 4.2 * Math.cbrt(u);
        const th = 2 * Math.PI * v;
        const ph = Math.acos(2 * w - 1);
        return [r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)] as V3;
      });
      noiseCycle = cycle;
    };

    let width = 0, height = 0, dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (time: number, staticFold: boolean) => {
      // a rAF timestamp can precede `start` by a few ms, so never let time go negative
      time = Math.max(0, time);
      const cycle = Math.floor(time / T_CYCLE);
      if (cycle !== noiseCycle) makeNoise(cycle);
      const local = time - cycle * T_CYCLE;
      // progress 0 (pure noise) -> 1 (folded)
      let p: number;
      if (staticFold) p = 1;
      else if (local < T_DENOISE) p = local / T_DENOISE;
      else if (local < T_DENOISE + T_HOLD) p = 1;
      else p = 1 - easeInOut((local - T_DENOISE - T_HOLD) / T_DISSOLVE);

      if (stepRef.current) stepRef.current.textContent = String(Math.round(p * STEPS));

      ctx.clearRect(0, 0, width, height);
      const rotY = staticFold ? 0.7 : time * 0.14 + 0.4;
      const rotX = -0.38;
      const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
      const unit = Math.min(width / 9.2, height / 9.2);
      const focal = 14;

      type P = { x: number; y: number; s: number; e: number; i: number; depth: number };
      const proj: P[] = [];
      for (let i = 0; i < n; i++) {
        const e = easeInOut(clamp01((p - delay[i]) / (1 - 0.35)));
        const wob = (1 - e) * 0.35;
        let x = noise[i][0] + (target[i][0] - noise[i][0]) * e + Math.sin(time * 1.7 + i) * wob * (staticFold ? 0 : 1);
        let y = noise[i][1] + (target[i][1] - noise[i][1]) * e + Math.cos(time * 1.3 + i * 1.7) * wob * (staticFold ? 0 : 1);
        let z = noise[i][2] + (target[i][2] - noise[i][2]) * e;
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        const y1 = y * cx - z1 * sx;
        const z2 = y * sx + z1 * cx;
        x = x1; y = y1; z = z2;
        const s = focal / (focal + z);
        proj.push({ x: width / 2 + x * unit * s, y: height / 2 + y * unit * s, s, e, i, depth: z });
      }

      // bonds first (back to front by average depth), then residues on top
      ctx.lineCap = 'round';
      const bonds: [P, P][] = [];
      for (let i = 0; i < n - 1; i++) bonds.push([proj[i], proj[i + 1]]);
      bonds.sort((a, b) => b[0].depth + b[1].depth - (a[0].depth + a[1].depth));
      for (const [a, b] of bonds) {
        const e = (a.e + b.e) / 2;
        if (e < 0.25) continue;
        const t = a.i / (n - 1);
        ctx.strokeStyle = mix(INK, EMERALD, t);
        ctx.globalAlpha = Math.min(1, (e - 0.25) / 0.75) * 0.85;
        ctx.lineWidth = 1.2 + 2.2 * ((a.s + b.s) / 2) * e;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      const order = [...proj].sort((a, b) => b.depth - a.depth);
      for (const q of order) {
        const t = q.i / (n - 1);
        ctx.globalAlpha = 0.35 + 0.65 * q.e;
        ctx.fillStyle = q.e < 0.5 ? mix(NOISE, INK, q.e * 2) : mix(INK, EMERALD, t);
        ctx.beginPath();
        ctx.arc(q.x, q.y, (1.5 + 1.8 * q.e) * q.s * (width > 520 ? 1.15 : 0.9), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(0, true);
    });
    ro.observe(canvas);

    let raf = 0;
    if (reduce) {
      draw(0, true);
    } else {
      const start = performance.now();
      const loop = (now: number) => {
        draw((now - start) / 1000, false);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [stepRef]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Animation: scattered points settle into the backbone of a three-helix protein"
      className="absolute inset-0 block h-full w-full"
    />
  );
}
