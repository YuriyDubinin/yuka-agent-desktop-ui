import { memo, useEffect, useRef } from 'react';

import { approach, approach3, createShaderLoop, GLSL_NOISE } from '../gl/shaderLoop';
import type { CoreMood } from '../state/chat';
import { THEMES, type ThemeName, toRgb } from '../theme/themes';

interface MoodParams {
  speed: number; // drift speed of the inner glow
  swirl: number; // vortex strength of the glow
  glow: number; // brightness of the inner glow
  spread: number; // how far the glow fills the sphere (0 tight … 1 full)
  flicker: number; // unstable signal
  ring: number; // orbit ring (thinking)
  cold: number; // shift towards cold desaturated tones
  breathPeriod: number; // seconds per breath of the ember
  breathDepth: number; // how much the glow swells with each breath
}

const MOODS: Record<CoreMood, MoodParams> = {
  idle: {
    speed: 0.22,
    swirl: 0.25,
    glow: 0.85,
    spread: 0.45,
    flicker: 0,
    ring: 0,
    cold: 0,
    breathPeriod: 5,
    breathDepth: 0.16,
  },
  thinking: {
    speed: 0.85,
    swirl: 1.1,
    glow: 1.0,
    spread: 0.6,
    flicker: 0,
    ring: 1,
    cold: 0,
    breathPeriod: 2,
    breathDepth: 0.2,
  },
  talking: {
    speed: 0.5,
    swirl: 0.45,
    glow: 1.15,
    spread: 0.7,
    flicker: 0,
    ring: 0,
    cold: 0,
    breathPeriod: 1.3,
    breathDepth: 0.22,
  },
  sleeping: {
    speed: 0.06,
    swirl: 0.1,
    glow: 0.24,
    spread: 0.2,
    flicker: 0,
    ring: 0,
    cold: 0.2,
    breathPeriod: 7,
    breathDepth: 0.1,
  },
  offline: {
    speed: 0.18,
    swirl: 0.2,
    glow: 0.45,
    spread: 0.3,
    flicker: 1,
    ring: 0,
    cold: 0.7,
    breathPeriod: 5,
    breathDepth: 0.05,
  },
};

// A glass sphere with a glowing ember inside, drawn on a fully transparent canvas:
// transparent body, fresnel rim, specular highlight and a volumetric inner glow.
// Output is premultiplied; outside the sphere only the halo (and the thinking ring) emit,
// and everything fades to exactly zero before the edge of the window.
const FRAGMENT = `
uniform float uTime;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform float uRadius;  // sphere radius, in units of half the canvas
uniform float uPixel;   // one device pixel, in the same units
uniform float uSpeed;
uniform float uSwirl;
uniform float uGlow;
uniform float uSpread;
uniform float uPulse;
uniform float uFlicker;
uniform float uRing;
uniform float uCold;
uniform float uLight;
uniform float uBreath;  // 1 ± breath depth
uniform float uHover;   // 0..1, pointer over the sphere
uniform float uFlash;   // 0..1, unread reply
varying vec2 vUv;
${GLSL_NOISE}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float t = uTime;

  float R = uRadius * (1.0 + 0.004 * sin(t * 1.1));
  float nr = r / R;
  // Analytic anti-aliasing: the silhouette is ~1.2 device pixels wide at any DPI.
  float aa = 1.2 * uPixel / R;
  float inside = 1.0 - smoothstep(1.0 - aa, 1.0 + aa * 0.5, nr);
  float z = sqrt(max(0.0, 1.0 - min(nr, 1.0) * min(nr, 1.0)));
  vec3 normal = vec3(p / R, z);

  float energy = (uGlow + uPulse * 0.45) * uBreath * (1.0 + 0.22 * uHover) + uFlash * 0.55;

  // Inner glow: a drifting, swirling ember with a hot centre.
  vec2 q = p / R;
  float a = atan(q.y, q.x);
  float twist = uSwirl * (1.0 - min(nr, 1.0)) * 2.2 + t * uSpeed * 0.5;
  vec2 w = vec2(cos(a + twist), sin(a + twist)) * length(q);
  float n1 = fbm(w * 1.9 + vec2(t * uSpeed * 0.3, -t * uSpeed * 0.22));
  float n2 = fbm(w * 3.4 - n1 * 1.4 + t * uSpeed * 0.18);
  vec2 drift = vec2(sin(t * 0.37), cos(t * 0.29)) * 0.08;
  float d = length(q - drift);
  float falloff = mix(5.5, 2.2, uSpread) - uPulse * 1.2 - (uBreath - 1.0) * 2.0;
  float core = exp(-d * d * falloff);
  float wisps = pow(smoothstep(0.35, 0.95, n2), 2.0) * (1.0 - min(nr, 1.0)) * 0.9;
  float glow = (core * (0.65 + 0.55 * n1) + wisps) * energy;

  vec3 glowColor = mix(uC2, uC1, smoothstep(0.25, 0.8, n1));
  // White-hot centre on dark themes; stays saturated on light ones so it reads on pale glass.
  glowColor = mix(glowColor, uC3, pow(core, 2.4) * mix(0.85, 0.35, uLight));

  // Glass shell: emitted light is ADDED over whatever is behind the window; the glass
  // itself barely tints it – so the sphere stays see-through.
  float edge = 1.0 - z;
  float fresnel = pow(edge, 3.0);
  vec3 rimLight = vec3(pow(edge, 2.6), pow(edge, 2.9), pow(edge, 3.3)) * mix(vec3(1.0), uC3, 0.4);

  vec3 lightDir = normalize(vec3(-0.45, 0.6, 0.75));
  vec3 halfVec = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float facing = max(dot(normal, halfVec), 0.0);
  float spec = pow(facing, 260.0) * 1.25 + pow(facing, 40.0) * 0.08;
  // Caustic reflection along the lower edge.
  float caustic = smoothstep(0.12, 0.0, abs(nr - 0.86)) * smoothstep(-0.1, -0.75, q.y) * 0.28;

  vec3 emit = glowColor * glow
            + rimLight * (0.9 + 0.15 * uHover) * (1.0 - 0.55 * uLight)
            + vec3(spec)
            + uC3 * caustic;
  // A crisp silhouette line – the "cut out" edge.
  float rimLine = 1.0 - smoothstep(0.0, 2.2 * aa + 0.02, abs(nr - 0.985));
  emit += mix(vec3(1.0), uC3, 0.5) * rimLine * (0.32 + 0.08 * uHover) * (1.0 - 0.6 * uLight);
  // Over light backgrounds a soft coloured shade keeps the glass visible.
  float shade = uLight * (fresnel * 0.8 + rimLine * 0.5) + 0.05 * fresnel;
  vec3 body = emit + uC2 * 0.22 * shade;
  float bodyCover = 0.025 + shade;

  // Halo outside the glass and a faint orbit ring while thinking.
  float outside = max(r - R, 0.0);
  float bloom = exp(-outside * 12.0) * 0.32 * energy * (1.0 - inside);
  float ringBand = 1.0 - smoothstep(0.0, 0.009 + uPixel, abs(r - (R + 0.13)));
  float ring = uRing * ringBand * (0.25 + 0.75 * pow(0.5 + 0.5 * sin(a * 2.0 - t * 2.6), 4.0));

  vec3 color = body * inside + glowColor * bloom + uC3 * ring * (1.0 - inside);
  float cover = bodyCover * inside + bloom * 0.45 + ring * 0.6;

  vec3 grey = vec3(dot(color, vec3(0.3, 0.5, 0.2)));
  color = mix(color, grey * vec3(0.75, 0.88, 1.08), uCold);
  float flicker = 1.0 - uFlicker * (0.25 + 0.25 * sin(t * 21.0) * sin(t * 6.7 + 1.0));

  // Nothing may reach the window's edge: the orb is a cut-out, never a square.
  float frame = 1.0 - smoothstep(0.86, 0.98, max(abs(p.x), abs(p.y)));
  color = min(color * flicker, vec3(1.0)) * frame;
  cover *= flicker * frame;

  // Keep the premultiplied colour valid (rgb <= alpha).
  float alpha = clamp(max(cover, max(color.r, max(color.g, color.b))), 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}`;

interface OrbProps {
  mood: CoreMood;
  theme: ThemeName;
  /** Sphere radius relative to half the canvas (see geometry.ts: ORB_RADIUS / half window). */
  radius: number;
  hover: boolean;
  unread: boolean;
  /** Increments with every streamed chunk – each one sends a pulse through the glow. */
  activity: number;
}

/** Yuka's glass sphere (WebGL), alone on a transparent canvas. */
export const Orb = memo(function Orb({ mood, theme, radius, hover, unread, activity }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read by the render loop every frame; updated from effects, never during render.
  const live = useRef({ mood, theme, hover, unread, radius, impulse: 0 });
  useEffect(() => {
    Object.assign(live.current, { mood, theme, hover, unread, radius });
  }, [mood, theme, hover, unread, radius]);

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
    const smooth = { light: start.scheme === 'light' ? 1 : 0, hover: 0, flash: 0, breath: 0 };

    const loop = createShaderLoop({
      canvas,
      fragmentShader: FRAGMENT,
      // Full rate when something happens, half rate while it just breathes.
      fps: () => {
        const s = live.current;
        return s.hover || s.unread || s.mood === 'thinking' || s.mood === 'talking' ? 60 : 30;
      },
      premultipliedAlpha: true,
      onFrame(frame) {
        const state = live.current;
        const target = MOODS[state.mood];
        for (const key of Object.keys(params) as (keyof MoodParams)[]) {
          params[key] = approach(params[key], target[key], frame.dt, 0.35);
        }
        state.impulse = approach(state.impulse, 0, frame.dt, 0.4);
        smooth.hover = approach(smooth.hover, state.hover ? 1 : 0, frame.dt, 0.12);

        // Breathing: integrate the phase so period changes never jump.
        smooth.breath += (frame.dt / Math.max(params.breathPeriod, 0.1)) * Math.PI * 2;
        const breath = 1 + params.breathDepth * Math.sin(smooth.breath);

        // Unread: a soft double blink every 2.4 s.
        const cycle = (frame.time % 2.4) / 2.4;
        const blink =
          Math.exp(-(((cycle - 0.08) / 0.035) ** 2)) +
          0.6 * Math.exp(-(((cycle - 0.2) / 0.035) ** 2));
        smooth.flash = approach(smooth.flash, state.unread ? blink : 0, frame.dt, 0.05);

        const theme = THEMES[state.theme];
        approach3(colors.uC1, toRgb(theme.colors.core1), frame.dt, 0.55);
        approach3(colors.uC2, toRgb(theme.colors.core2), frame.dt, 0.55);
        approach3(colors.uC3, toRgb(theme.colors.core3), frame.dt, 0.55);
        smooth.light = approach(smooth.light, theme.scheme === 'light' ? 1 : 0, frame.dt, 0.55);

        frame.set1f('uTime', frame.time);
        for (const [name, value] of Object.entries(colors)) frame.set3f(name, value);
        frame.set1f('uRadius', state.radius);
        frame.set1f('uPixel', 2 / Math.max(frame.width, 1));
        frame.set1f('uSpeed', params.speed);
        frame.set1f('uSwirl', params.swirl);
        frame.set1f('uGlow', params.glow);
        frame.set1f('uSpread', params.spread);
        frame.set1f('uPulse', state.impulse);
        frame.set1f('uFlicker', params.flicker);
        frame.set1f('uRing', params.ring);
        frame.set1f('uCold', params.cold);
        frame.set1f('uLight', smooth.light);
        frame.set1f('uBreath', breath);
        frame.set1f('uHover', smooth.hover);
        frame.set1f('uFlash', smooth.flash);
      },
    });

    if (!loop) canvas.dataset.fallback = 'true';
    return () => loop?.dispose();
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="orb__canvas" aria-hidden="true" />
      {/* CSS fallback, visible only when WebGL is unavailable */}
      <span className={`orb__fallback orb__fallback--${mood}`} aria-hidden="true" />
    </>
  );
});

/** Lightweight CSS glass orb for the "thinking" indicator (no extra GL context). */
export function MiniCore({ mood }: { mood: CoreMood }) {
  return <span className={`mini-core mini-core--${mood}`} aria-hidden="true" />;
}
