import { memo, useEffect, useRef } from 'react';

import { approach, approach3, createShaderLoop, GLSL_NOISE } from '../gl/shaderLoop';
import { THEMES, type ThemeName, toRgb } from '../theme/themes';

export type CoreMood = 'idle' | 'thinking' | 'talking' | 'sleeping' | 'offline';

interface MoodParams {
  speed: number; // drift speed of the inner glow
  swirl: number; // vortex strength of the glow
  glow: number; // brightness of the inner glow
  spread: number; // how far the glow fills the sphere (0 tight … 1 full)
  flicker: number; // unstable signal
  ring: number; // orbit ring (thinking)
  cold: number; // shift towards cold desaturated tones
}

const MOODS: Record<CoreMood, MoodParams> = {
  idle: { speed: 0.22, swirl: 0.25, glow: 0.85, spread: 0.45, flicker: 0, ring: 0, cold: 0 },
  thinking: { speed: 0.85, swirl: 1.1, glow: 1.0, spread: 0.6, flicker: 0, ring: 1, cold: 0 },
  talking: { speed: 0.5, swirl: 0.45, glow: 1.15, spread: 0.7, flicker: 0, ring: 0, cold: 0 },
  sleeping: { speed: 0.06, swirl: 0.1, glow: 0.22, spread: 0.2, flicker: 0, ring: 0, cold: 0.2 },
  offline: { speed: 0.18, swirl: 0.2, glow: 0.45, spread: 0.3, flicker: 1, ring: 0, cold: 0.7 },
};

// A glass sphere with a glowing ember inside: transparent body, fresnel rim with slight
// dispersion, specular highlights and a volumetric inner glow that drifts and breathes.
const FRAGMENT = `
uniform float uTime;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform float uSpeed;
uniform float uSwirl;
uniform float uGlow;
uniform float uSpread;
uniform float uPulse;
uniform float uFlicker;
uniform float uRing;
uniform float uCold;
uniform float uLight;
varying vec2 vUv;
${GLSL_NOISE}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float t = uTime;

  float R = 0.56 + 0.006 * sin(t * 1.1);
  float nr = r / R;
  float inside = smoothstep(1.0, 0.985, nr);
  float z = sqrt(max(0.0, 1.0 - min(nr, 1.0) * min(nr, 1.0)));
  vec3 normal = vec3(p / R, z);

  // Inner glow: a drifting, swirling ember with a hot centre.
  vec2 q = p / R;
  float a = atan(q.y, q.x);
  float twist = uSwirl * (1.0 - min(nr, 1.0)) * 2.2 + t * uSpeed * 0.5;
  vec2 w = vec2(cos(a + twist), sin(a + twist)) * length(q);
  float n1 = fbm(w * 1.9 + vec2(t * uSpeed * 0.3, -t * uSpeed * 0.22));
  float n2 = fbm(w * 3.4 - n1 * 1.4 + t * uSpeed * 0.18);
  vec2 drift = vec2(sin(t * 0.37), cos(t * 0.29)) * 0.08;
  float d = length(q - drift);
  float falloff = mix(5.5, 2.2, uSpread) - uPulse * 1.2;
  float core = exp(-d * d * falloff);
  float wisps = pow(smoothstep(0.35, 0.95, n2), 2.0) * (1.0 - min(nr, 1.0)) * 0.9;
  float glow = (core * (0.65 + 0.55 * n1) + wisps) * (uGlow + uPulse * 0.45);

  vec3 glowColor = mix(uC2, uC1, smoothstep(0.25, 0.8, n1));
  // White-hot centre on dark themes; stays saturated on light ones so it reads on pale glass.
  glowColor = mix(glowColor, uC3, pow(core, 2.4) * mix(0.85, 0.35, uLight));

  // Glass shell. Output is premultiplied: emitted light is ADDED over the background,
  // the glass itself only lightly tints it – so the sphere stays transparent.
  float edge = 1.0 - z;
  float fresnel = pow(edge, 3.0);
  vec3 rimLight = vec3(pow(edge, 2.6), pow(edge, 2.9), pow(edge, 3.3)) * mix(vec3(1.0), uC3, 0.4);

  vec3 lightDir = normalize(vec3(-0.45, 0.6, 0.75));
  vec3 halfVec = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float facing = max(dot(normal, halfVec), 0.0);
  float spec = pow(facing, 260.0) * 1.2 + pow(facing, 40.0) * 0.08;
  // Caustic reflection along the lower edge.
  float caustic = smoothstep(0.12, 0.0, abs(nr - 0.86)) * smoothstep(-0.1, -0.75, q.y) * 0.28;

  vec3 emit = glowColor * glow
            + rimLight * 0.9 * (1.0 - 0.6 * uLight)
            + vec3(spec)
            + uC3 * caustic;
  // A crisp silhouette line gives the glass a defined edge.
  float rimLine = smoothstep(0.045, 0.0, abs(nr - 0.975));
  emit += mix(vec3(1.0), uC3, 0.5) * rimLine * 0.35 * (1.0 - uLight);
  // On light themes a coloured shadow defines the glass (light-on-light is invisible).
  float shade = uLight * (fresnel * 0.9 + rimLine * 0.55 + 0.04);
  vec3 body = emit + uC2 * 0.22 * shade;
  float bodyCover = mix(0.03, 0.0, uLight) + shade;

  // Bloom outside the glass and a faint orbit ring while thinking.
  float outside = max(r - R, 0.0);
  float bloom = exp(-outside * 11.0) * 0.3 * (uGlow + uPulse * 0.5) * (1.0 - inside);
  float ringBand = smoothstep(0.008, 0.0, abs(r - (R + 0.13)));
  float ring = uRing * ringBand * (0.25 + 0.75 * pow(0.5 + 0.5 * sin(a * 2.0 - t * 2.6), 4.0));

  vec3 color = body * inside + glowColor * bloom + uC3 * ring * (1.0 - inside);
  float cover = bodyCover * inside + bloom * 0.4 + ring * 0.6;

  vec3 grey = vec3(dot(color, vec3(0.3, 0.5, 0.2)));
  color = mix(color, grey * vec3(0.75, 0.88, 1.08), uCold);
  float flicker = 1.0 - uFlicker * (0.25 + 0.25 * sin(t * 21.0) * sin(t * 6.7 + 1.0));
  color = min(color * flicker, vec3(1.0));

  // Keep the premultiplied colour valid (rgb <= alpha).
  float alpha = clamp(max(cover * flicker, max(color.r, max(color.g, color.b))), 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}`;

interface YukaCoreProps {
  mood: CoreMood;
  theme: ThemeName;
  size: number;
  /** Increments with every streamed chunk – each one sends a pulse through the glow. */
  activity?: number;
}

/** Yuka's core: a glass sphere with a living glow inside (WebGL). */
export const YukaCore = memo(function YukaCore({ mood, theme, size, activity = 0 }: YukaCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read by the render loop every frame; updated from effects, never during render.
  const live = useRef({ mood, theme, impulse: 0 });
  useEffect(() => {
    live.current.mood = mood;
    live.current.theme = theme;
  }, [mood, theme]);

  const lastActivity = useRef(activity);
  useEffect(() => {
    if (activity !== lastActivity.current) {
      lastActivity.current = activity;
      live.current.impulse = Math.min(1, live.current.impulse + 0.25);
    }
  }, [activity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const params: MoodParams = { ...MOODS[live.current.mood] };
    const start = THEMES[live.current.theme];
    const colors = {
      uC1: toRgb(start.colors.core1),
      uC2: toRgb(start.colors.core2),
      uC3: toRgb(start.colors.core3),
    };
    const scheme = { light: start.scheme === 'light' ? 1 : 0 };

    const loop = createShaderLoop({
      canvas,
      fragmentShader: FRAGMENT,
      fps: 60,
      premultipliedAlpha: true,
      onFrame(frame) {
        const state = live.current;
        const target = MOODS[state.mood];
        for (const key of Object.keys(params) as (keyof MoodParams)[]) {
          params[key] = approach(params[key], target[key], frame.dt, 0.35);
        }
        state.impulse = approach(state.impulse, 0, frame.dt, 0.4);

        const theme = THEMES[state.theme];
        approach3(colors.uC1, toRgb(theme.colors.core1), frame.dt, 0.55);
        approach3(colors.uC2, toRgb(theme.colors.core2), frame.dt, 0.55);
        approach3(colors.uC3, toRgb(theme.colors.core3), frame.dt, 0.55);
        scheme.light = approach(scheme.light, theme.scheme === 'light' ? 1 : 0, frame.dt, 0.55);

        frame.set1f('uTime', frame.time);
        for (const [name, value] of Object.entries(colors)) frame.set3f(name, value);
        frame.set1f('uSpeed', params.speed);
        frame.set1f('uSwirl', params.swirl);
        frame.set1f('uGlow', params.glow);
        frame.set1f('uSpread', params.spread);
        frame.set1f('uPulse', state.impulse);
        frame.set1f('uFlicker', params.flicker);
        frame.set1f('uRing', params.ring);
        frame.set1f('uCold', params.cold);
        frame.set1f('uLight', scheme.light);
      },
    });

    if (!loop) canvas.dataset.fallback = 'true';
    return () => loop?.dispose();
  }, []);

  return (
    <span className={`core core--${mood}`} style={{ width: size, height: size }}>
      <canvas ref={canvasRef} className="core__canvas" aria-hidden="true" />
      {/* CSS fallback, visible only when WebGL is unavailable */}
      <span className="core__fallback" aria-hidden="true" />
    </span>
  );
});

/** Lightweight CSS glass orb for message avatars (no extra GL contexts). */
export function MiniCore({ mood }: { mood: CoreMood }) {
  return <span className={`mini-core mini-core--${mood}`} aria-hidden="true" />;
}
