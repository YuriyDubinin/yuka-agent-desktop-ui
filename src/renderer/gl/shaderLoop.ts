// Minimal WebGL runtime for full-surface fragment shaders: compiles the program, keeps the
// canvas sized to its box, and drives a frame-capped render loop that pauses while the
// window is hidden. No external dependencies.

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

/** Shared GLSL helpers: hash, value noise and fractal noise. */
export const GLSL_NOISE = `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rotate = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = rotate * p;
    amplitude *= 0.5;
  }
  return value;
}`;

export interface FrameContext {
  gl: WebGLRenderingContext;
  /** Uniform setter helpers (locations are cached). */
  set1f(name: string, value: number): void;
  set2f(name: string, x: number, y: number): void;
  set3f(name: string, value: readonly [number, number, number]): void;
  width: number;
  height: number;
  /** Seconds since start (frozen when motion is reduced). */
  time: number;
  /** Seconds since the previous frame. */
  dt: number;
}

export interface ShaderLoopOptions {
  canvas: HTMLCanvasElement;
  fragmentShader: string;
  /** Upper bound for frames per second. */
  fps: number;
  /** Render resolution relative to CSS pixels × devicePixelRatio. */
  resolutionScale?: number;
  premultipliedAlpha?: boolean;
  onFrame(frame: FrameContext): void;
}

export interface ShaderLoop {
  dispose(): void;
}

export const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader compile error: ${log}`);
  }
  return shader;
}

/** Returns null when WebGL is unavailable; callers fall back to CSS. */
export function createShaderLoop(options: ShaderLoopOptions): ShaderLoop | null {
  const { canvas, fps, resolutionScale = 1 } = options;
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: options.premultipliedAlpha ?? false,
    powerPreference: 'low-power',
  });
  if (!gl) return null;

  let program: WebGLProgram;
  try {
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(
      program,
      compile(gl, gl.FRAGMENT_SHADER, `precision highp float;\n${options.fragmentShader}`),
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program link error: ${gl.getProgramInfoLog(program)}`);
    }
  } catch (error) {
    console.error('[yuka] WebGL disabled:', error);
    return null;
  }
  gl.useProgram(program);

  // One oversized triangle covers the viewport.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const locations = new Map<string, WebGLUniformLocation | null>();
  const location = (name: string) => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
    return locations.get(name) ?? null;
  };

  let width = 1;
  let height = 1;
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2) * resolutionScale;
    width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const frameInterval = 1000 / fps;
  const reduced = prefersReducedMotion();
  const start = performance.now();
  let last = start;
  let lastDraw = 0;
  let raf = 0;
  let disposed = false;

  const frame: FrameContext = {
    gl,
    set1f: (name, value) => gl.uniform1f(location(name), value),
    set2f: (name, x, y) => gl.uniform2f(location(name), x, y),
    set3f: (name, value) => gl.uniform3f(location(name), value[0], value[1], value[2]),
    width,
    height,
    time: 0,
    dt: 0,
  };

  const tick = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    if (document.hidden || now - lastDraw < frameInterval - 1) return;

    lastDraw = now;
    frame.dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    frame.time = reduced ? 12.5 : (now - start) / 1000;
    frame.width = width;
    frame.height = height;
    options.onFrame(frame);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  raf = requestAnimationFrame(tick);

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

/** Frame-rate independent exponential approach towards `target`. */
export function approach(current: number, target: number, dt: number, tau: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

export function approach3(
  current: [number, number, number],
  target: readonly [number, number, number],
  dt: number,
  tau: number,
): void {
  for (let i = 0; i < 3; i++) current[i] = approach(current[i], target[i], dt, tau);
}
