/**
 * The reconciliation, as eleven thousand points, in one draw call.
 *
 * No library. The whole animation is a function of one uniform, how far the
 * reader has scrolled through the section, evaluated per point in a vertex
 * shader, so there is nothing to tween on the CPU and nothing to keep in
 * sync. ogl would be 20KB and three.js 170KB to do a job that is one buffer,
 * one program and one drawArrays call.
 *
 * What it draws is the same data the static figure draws: every record of
 * both seeded companies, in feed order, with the planted defects at the rows
 * they were actually planted in. The animation adds an argument the still
 * picture cannot make, that reconciliation is a process most records survive,
 * and it must not add a fact.
 */

export type Register = {
  label: string;
  count: number;
  marks: number[];
  period_runs: { period: string; at: number }[];
};

export type Band = { label: string; count: number; top: number; height: number };

export type Scene = {
  draw: (phase: number, month?: number) => void;
  /** Where each register sits, in CSS pixels, for labelling in the DOM. */
  bands: () => Band[];
  resize: () => void;
  destroy: () => void;
};

const COLUMNS = 160;
const BAND_GAP = 0.06;

const VERT = `#version 300 es
in vec2 aFinal;
in float aSeed;
in float aMarked;
in float aPeriod;   // 0 at the oldest month, 1 at the newest

uniform vec2 uRes;
uniform float uPhase;
uniform float uDpr;
uniform float uCell;
uniform float uMonth;   // -1 for every month, else the month's index

out float vMarked;
out float vAlpha;

float ease(float t) {
  float u = 1.0 - clamp(t, 0.0, 1.0);
  return 1.0 - u * u * u;
}

void main() {
  // The registers fill over the section's entry, so the fall is done by
  // about a third and the rest of the scroll belongs to the settle.
  float delay = aSeed * 0.20;
  float fall = ease((uPhase - delay) / 0.18);
  float settle = smoothstep(0.58, 0.90, uPhase);

  // The month a record belongs to is a dimension the reader chooses, not one
  // the picture performs. An earlier cut fanned the months apart in depth as
  // you scrolled; a month here is about a hundred and fifty records, which
  // is a single row at this width, so what it produced was a staircase of
  // thin strips rather than a stack of sheets. The axis was real and the
  // picture was not legible, which is the test that matters.
  //
  // So depth is gone and the month drives selection instead: uMonth is -1
  // for the whole year, or a month's index, and anything outside the chosen
  // month recedes rather than disappearing — the denominator has to stay
  // visible or the selection is a filter rather than a comparison.
  float chosen = step(abs(aPeriod - uMonth), 0.001);

  vec2 start = vec2(aFinal.x, -0.25 * uRes.y - aSeed * uRes.y * 0.9);
  vec2 pos = mix(start, aFinal, fall);

    // 0.45, not the 0.22 this carried under alpha blending. Fading toward
  // white through a multiply is not the same curve as fading toward
  // transparent, and at 0.22 the settled field printed so faintly that the
  // denominator the picture exists to show had almost gone.
  // What a settled record is worth when the whole year is shown.
  float year = mix(1.0, mix(0.45, 1.0, aMarked), settle);

  // Choosing a month PROMOTES it rather than only receding the rest. The
  // first cut multiplied everything outside the selection by 0.22, which on
  // top of the 0.45 a settled record already carries left the chosen month
  // at the same weight it had before and the other eleven at a tenth of it -
  // so selecting read as "the picture went faint" rather than as "this is
  // the month". The selected month is now printed at full ink, which is
  // heavier than any record is at rest, and the rest drop far enough to be
  // ground rather than figure.
  float month = mix(year * 0.30, 1.0, chosen);

  vAlpha = fall * (uMonth < 0.0 ? year : month);
  vMarked = aMarked;
  gl_PointSize = uCell * uDpr * mix(1.0, mix(0.86, 1.5, aMarked), settle);

  vec2 clip = (pos / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision mediump float;

in float vMarked;
in float vAlpha;
out vec4 outColour;

const vec3 FIELD = vec3(0.549, 0.522, 0.478);
const vec3 STATUTE = vec3(0.769, 0.161, 0.106);

void main() {
  vec2 d = abs(gl_PointCoord - 0.5);
  if (max(d.x, d.y) > 0.5) discard;

  // Multiply blending, so this fades toward WHITE rather than toward
  // transparent: under src*dst a white fragment leaves the paper untouched,
  // and alpha does nothing at all. Fading with alpha here would simply stop
  // the settle from happening.
  vec3 ink = mix(FIELD, STATUTE, vMarked);
  outColour = vec4(mix(vec3(1.0), ink, vAlpha), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("shader alloc failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(String(log));
  }
  return shader;
}

/**
 * Build the scene, or return null if this browser cannot draw it.
 *
 * Null rather than a throw, because the caller's answer to "no WebGL" is to
 * render the static figure, and that is a complete answer rather than a
 * degraded one.
 */
/** Every distinct month across every register, oldest first. */
export function monthsOf(registers: Register[]): string[] {
  return [
    ...new Set(registers.flatMap((r) => r.period_runs.map((run) => run.period))),
  ].sort();
}

export function createScene(
  canvas: HTMLCanvasElement,
  registers: Register[],
): Scene | null {
  // Opaque, and cleared to the paper colour.
  //
  // This is not a preference, it is what multiply blending requires. The
  // blend is `src * dst`, so it needs real paper in the buffer to print
  // onto: against a transparent clear every fragment multiplies by zero and
  // the whole figure renders as nothing at all. An alpha canvas here let the
  // page's bone ground show through in CSS, which looked identical and was
  // not the same thing.
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
  });
  if (!gl) return null;

  let program: WebGLProgram | null = null;
  try {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  } catch {
    return null;
  }

  const total = registers.reduce((n, r) => n + r.count, 0);
  const finals = new Float32Array(total * 2);
  const seeds = new Float32Array(total);
  const marked = new Float32Array(total);
  const period = new Float32Array(total);

  // Every distinct month across every register, oldest first, so a record's
  // depth is its position in the year rather than its position in its own
  // feed. The runs are boundaries: each says a period begins at a row, and
  // it holds until the next one does.
  const months = monthsOf(registers);
  const depthOf = (month: string) =>
    months.length > 1 ? months.indexOf(month) / (months.length - 1) : 0;

  // A stable pseudo-random, so the stagger is identical on every load and on
  // every machine. Math.random would make a figure about a fixed dataset look
  // different each time it was looked at.
  let state = 0x2f6e2b1;
  const rand = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };

  let cell = 4;
  const bandBoxes: Band[] = [];

  /**
   * Where every record sits, with each month starting on a fresh row.
   *
   * The row break at a period boundary is not decoration. The first cut let
   * periods run on through the wrap, which is fine while the sheet is flat
   * and falls apart the moment depth is applied: shearing by month tears
   * every band across the middle of a row, because a month ends wherever it
   * happens to end. Aligning months to whole rows means the fan moves
   * rectangular blocks, which is what a stack of sheets looks like.
   *
   * It costs some empty cells at the end of each month and earns a flat
   * picture that shows where the months are, which the old one did not.
   */
  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    cell = w / COLUMNS;

    // Rows per register, counting each month's part-row as a whole one.
    const rows = registers.map((register) => {
      const runs = register.period_runs;
      let used = 0;
      for (let r = 0; r < runs.length; r += 1) {
        const to = r + 1 < runs.length ? runs[r + 1].at : register.count;
        used += Math.ceil((to - runs[r].at) / COLUMNS);
      }
      return Math.max(used, 1);
    });

    const totalRows = rows.reduce((a, b) => a + b, 0);
    const gaps = (registers.length - 1) * BAND_GAP * h;
    const rowHeight = Math.max((h - gaps) / totalRows, 1);

    bandBoxes.length = 0;
    let cursor = 0;
    let top = 0;
    registers.forEach((register, band) => {
      bandBoxes.push({
        label: register.label,
        count: register.count,
        top,
        height: rows[band] * rowHeight,
      });
      const markSet = new Set(register.marks);
      const runs = register.period_runs;
      let row = 0;
      for (let r = 0; r < runs.length; r += 1) {
        const from = runs[r].at;
        const to = r + 1 < runs.length ? runs[r + 1].at : register.count;
        for (let i = from; i < to; i += 1) {
          const within = i - from;
          const at = cursor + i;
          finals[at * 2] = (within % COLUMNS) * cell + cell * 0.5;
          finals[at * 2 + 1] =
            top + (row + Math.floor(within / COLUMNS)) * rowHeight + rowHeight * 0.5;
          marked[at] = markSet.has(i) ? 1 : 0;
        }
        row += Math.ceil((to - from) / COLUMNS);
      }
      cursor += register.count;
      top += rows[band] * rowHeight + BAND_GAP * h;
    });
  }

  for (let i = 0; i < total; i += 1) seeds[i] = rand();

  let base = 0;
  for (const register of registers) {
    const runs = register.period_runs;
    for (let r = 0; r < runs.length; r += 1) {
      const from = runs[r].at;
      const to = r + 1 < runs.length ? runs[r + 1].at : register.count;
      const depth = depthOf(runs[r].period);
      for (let i = from; i < to; i += 1) period[base + i] = depth;
    }
    base += register.count;
  }

  layout();

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const buffers: WebGLBuffer[] = [];
  const bind = (name: string, data: Float32Array, size: number) => {
    const buffer = gl.createBuffer();
    if (!buffer || !program) return null;
    buffers.push(buffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    return buffer;
  };

  const finalBuffer = bind("aFinal", finals, 2);
  bind("aSeed", seeds, 1);
  bind("aMarked", marked, 1);
  bind("aPeriod", period, 1);

  gl.useProgram(program);
  const uRes = gl.getUniformLocation(program, "uRes");
  const uPhase = gl.getUniformLocation(program, "uPhase");
  const uDpr = gl.getUniformLocation(program, "uDpr");
  const uCell = gl.getUniformLocation(program, "uCell");
  const uMonth = gl.getUniformLocation(program, "uMonth");

  gl.enable(gl.BLEND);
  // Two impressions on paper multiply. Where records overlap, the result is
  // the product of the inks rather than the topmost one winning, which is the
  // same arithmetic that makes `agreed` = books x statute in the palette.
  // Concretely: the ten invoices booked twice occupy adjacent rows, and at
  // settle the marks are wider than the pitch, so a duplicate prints denser
  // than a single defect. The picture states which defects are doublings
  // without being told to.
  gl.blendFunc(gl.DST_COLOR, gl.ZERO);

  return {
    draw(phase: number, month = -1) {
      const dpr = window.devicePixelRatio || 1;
      gl.viewport(0, 0, canvas.width, canvas.height);
      // #F4F1E8, the `stock` token, so the canvas is the same sheet as the
      // page around it and an unprinted cell is indistinguishable from paper.
      gl.clearColor(0.9569, 0.9451, 0.9098, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(uRes, canvas.width / dpr, canvas.height / dpr);
      gl.uniform1f(uPhase, phase);
      gl.uniform1f(uDpr, dpr);
      gl.uniform1f(uCell, cell * 0.72);
      gl.uniform1f(uMonth, month);
      gl.drawArrays(gl.POINTS, 0, total);
    },
    bands() {
      return bandBoxes.map((b) => ({ ...b }));
    },
    resize() {
      layout();
      if (finalBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, finalBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, finals);
      }
    },
    destroy() {
      buffers.forEach((b) => gl.deleteBuffer(b));
      gl.deleteVertexArray(vao);
      if (program) gl.deleteProgram(program);
    },
  };
}
