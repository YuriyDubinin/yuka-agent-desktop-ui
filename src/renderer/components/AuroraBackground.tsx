import { memo, useEffect, useRef } from 'react';

import { approach, approach3, createShaderLoop, GLSL_NOISE } from '../gl/shaderLoop';
import { THEMES, type ThemeName, toRgb } from '../theme/themes';

const FRAGMENT = `
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform vec3 uBgTop;
uniform vec3 uBgBottom;
uniform vec3 uA1;
uniform vec3 uA2;
uniform vec3 uA3;
uniform float uStars;
uniform float uHaze;
uniform float uHorizon;
uniform float uStrength;
uniform float uGrain;
uniform float uDark;
varying vec2 vUv;
${GLSL_NOISE}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) + uMouse * 0.035;
  float t = uTime;

  vec3 col = mix(uBgBottom, uBgTop, uv.y);

  // Domain-warped flow field: slow, organic aurora streams.
  vec2 q = vec2(fbm(p * 1.3 + vec2(0.0, t * 0.025)), fbm(p * 1.3 + vec2(5.2, -t * 0.02)));
  vec2 r = vec2(fbm(p * 1.7 + q * 1.6 + vec2(1.7, 9.2) + t * 0.018),
                fbm(p * 1.7 + q * 1.6 + vec2(8.3, 2.8) - t * 0.015));
  float f = fbm(p * 1.4 + r * 1.8);

  // Light themes get wider, softer coverage so the aurora reads on a pale base.
  float curtain = smoothstep(mix(0.12, 0.28, uDark), mix(0.78, 0.86, uDark), f) * (0.55 + 0.45 * sin(p.x * 2.4 + r.y * 3.0 + t * 0.12));
  vec3 aurora = mix(uA1, uA2, smoothstep(0.2, 0.8, q.x));
  aurora = mix(aurora, uA3, smoothstep(0.45, 0.95, r.y));
  float mask = curtain * uStrength;

  // Light themes blend softly, dark themes glow additively.
  vec3 lit = mix(col, aurora, mask * 0.9);
  vec3 glow = col + aurora * mask * 0.55;
  col = mix(lit, glow, uDark);

  // Morning haze rising from the bottom.
  col = mix(col, uA3, uHaze * 0.38 * smoothstep(0.6, 0.0, uv.y) * (0.7 + 0.3 * f));

  // Evening: warm band at the horizon.
  float band = exp(-pow((uv.y - 0.16) * 5.0, 2.0));
  col += uA3 * uHorizon * 0.22 * band * (0.6 + 0.4 * f);
  col = mix(col, col + uA1 * 0.1, uHorizon * smoothstep(0.5, 0.0, uv.y));

  // Twinkling stars (night, a few in the evening).
  if (uStars > 0.001) {
    vec2 grid = uv * uRes / 3.0;
    vec2 id = floor(grid);
    float h = hash(id);
    float twinkle = 0.55 + 0.45 * sin(t * (0.8 + h * 2.5) + h * 40.0);
    float star = step(0.9968, h) * twinkle * smoothstep(0.5, 0.0, length(fract(grid) - 0.5));
    col += vec3(star) * uStars * (1.0 - mask * 0.7) * smoothstep(0.05, 0.5, uv.y);
  }

  // Soft vignette on dark themes.
  float vignette = 0.8 + 0.2 * smoothstep(1.25, 0.25, length((uv - 0.5) * vec2(aspect, 1.0)));
  col *= mix(1.0, vignette, uDark);

  // Film grain (also breaks gradient banding).
  col += (hash(uv * uRes + fract(t * 0.37) * 91.0) - 0.5) * uGrain;

  gl_FragColor = vec4(col, 1.0);
}`;

interface AuroraBackgroundProps {
  theme: ThemeName;
}

/** Full-window living background. Falls back to a CSS gradient without WebGL. */
export const AuroraBackground = memo(function AuroraBackground({ theme }: AuroraBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read by the render loop every frame; updated from an effect, never during render.
  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const initial = THEMES[themeRef.current];
    const colors = {
      uBgTop: toRgb(initial.colors.bgTop),
      uBgBottom: toRgb(initial.colors.bgBottom),
      uA1: toRgb(initial.colors.aurora1),
      uA2: toRgb(initial.colors.aurora2),
      uA3: toRgb(initial.colors.aurora3),
    };
    const scene = { ...initial.scene, dark: initial.scheme === 'dark' ? 1 : 0 };

    // Parallax: pointer position in -1..1, smoothed.
    const pointer = { x: 0, y: 0 };
    const smoothed = { x: 0, y: 0 };
    const onPointer = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    const loop = createShaderLoop({
      canvas,
      fragmentShader: FRAGMENT,
      fps: 30,
      resolutionScale: 0.5, // soft imagery – half resolution is indistinguishable
      onFrame(frame) {
        const target = THEMES[themeRef.current];
        const tau = 0.55; // ≈2 s cross-fade between themes
        approach3(colors.uBgTop, toRgb(target.colors.bgTop), frame.dt, tau);
        approach3(colors.uBgBottom, toRgb(target.colors.bgBottom), frame.dt, tau);
        approach3(colors.uA1, toRgb(target.colors.aurora1), frame.dt, tau);
        approach3(colors.uA2, toRgb(target.colors.aurora2), frame.dt, tau);
        approach3(colors.uA3, toRgb(target.colors.aurora3), frame.dt, tau);
        scene.stars = approach(scene.stars, target.scene.stars, frame.dt, tau);
        scene.haze = approach(scene.haze, target.scene.haze, frame.dt, tau);
        scene.horizon = approach(scene.horizon, target.scene.horizon, frame.dt, tau);
        scene.auroraStrength = approach(
          scene.auroraStrength,
          target.scene.auroraStrength,
          frame.dt,
          tau,
        );
        scene.grain = approach(scene.grain, target.scene.grain, frame.dt, tau);
        scene.dark = approach(scene.dark, target.scheme === 'dark' ? 1 : 0, frame.dt, tau);

        smoothed.x = approach(smoothed.x, pointer.x, frame.dt, 0.8);
        smoothed.y = approach(smoothed.y, pointer.y, frame.dt, 0.8);

        frame.set2f('uRes', frame.width, frame.height);
        frame.set1f('uTime', frame.time);
        frame.set2f('uMouse', smoothed.x, -smoothed.y);
        for (const [name, value] of Object.entries(colors)) frame.set3f(name, value);
        frame.set1f('uStars', scene.stars);
        frame.set1f('uHaze', scene.haze);
        frame.set1f('uHorizon', scene.horizon);
        frame.set1f('uStrength', scene.auroraStrength);
        frame.set1f('uGrain', scene.grain);
        frame.set1f('uDark', scene.dark);
      },
    });

    if (!loop) canvas.dataset.fallback = 'true';
    return () => {
      window.removeEventListener('pointermove', onPointer);
      loop?.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="aurora" aria-hidden="true" />;
});
