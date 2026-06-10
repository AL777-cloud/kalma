/* Kálma Player — Visualizer Engine
   Mood-driven color palettes + Sacred geometry morphing.
   Integrates with the existing canvas visualizer in app.js. */

class KalmaVisualizer {
  constructor() {
    // Current mood palette (transitions smoothly)
    this._currentPalette = KalmaVisualizer.PALETTES.calm;
    this._targetPalette = KalmaVisualizer.PALETTES.calm;
    this._paletteBlend = 1; // 0 = transitioning, 1 = arrived
    this._mood = 'calm';

    // Sacred geometry state
    this._geoPhase = 0;        // 0-1 morph between shapes
    this._geoTarget = 0;       // target shape index
    this._geoCurrent = 0;      // current shape index (float for morphing)
    this._tension = 0;         // phrase tension drives morphing
    this._rotation = 0;        // slow rotation
    this._breathPhase = 0;     // breathing scale animation

    // Geometry shapes: 0=circle, 1=hexagon, 2=flower of life, 3=seed of life, 4=mandala
    this._shapes = ['circle', 'hexagon', 'flowerOfLife', 'seedOfLife', 'mandala'];
    this._shapeIndex = 0;
  }

  /* ═══ MOOD COLOR PALETTES ═══
     Each mood has a distinct color world:
     - primary: main geometry/ring color
     - secondary: accent/glow color
     - tertiary: subtle background tint
     - glow: orb glow color
     - bg: canvas clear tint (very subtle) */

  static PALETTES = {
    calm: {
      primary:   [0, 180, 170],    // teal
      secondary: [120, 200, 200],   // light cyan
      tertiary:  [40, 140, 160],    // deep teal
      glow:      [80, 220, 200],    // bright teal
      bg:        [10, 30, 35],      // dark teal tint
    },
    sleepy: {
      primary:   [80, 60, 180],     // indigo
      secondary: [120, 80, 200],    // soft purple
      tertiary:  [50, 30, 120],     // deep indigo
      glow:      [100, 80, 220],    // light indigo
      bg:        [12, 8, 30],       // near-black indigo
    },
    bright: {
      primary:   [220, 180, 50],    // gold
      secondary: [255, 210, 100],   // warm yellow
      tertiary:  [180, 130, 30],    // deep gold
      glow:      [255, 220, 120],   // bright gold
      bg:        [25, 20, 8],       // warm dark
    },
    sad: {
      primary:   [140, 120, 180],   // grey-violet
      secondary: [160, 140, 200],   // soft lavender
      tertiary:  [100, 80, 140],    // muted purple
      glow:      [170, 150, 210],   // pale violet
      bg:        [15, 12, 22],      // dark violet
    },
    dark: {
      primary:   [60, 50, 120],     // deep navy-purple
      secondary: [80, 70, 150],     // muted blue
      tertiary:  [40, 30, 80],      // very dark
      glow:      [90, 80, 160],     // subtle glow
      bg:        [8, 6, 18],        // near-black
    },
    melancholy: {
      primary:   [120, 130, 170],   // blue-grey
      secondary: [140, 150, 190],   // soft steel
      tertiary:  [80, 90, 130],     // muted blue
      glow:      [150, 160, 200],   // pale blue
      bg:        [12, 14, 22],      // cool dark
    },
    neutral: {
      primary:   [108, 99, 255],    // original purple
      secondary: [140, 131, 255],   // light purple
      tertiary:  [80, 70, 200],     // deep purple
      glow:      [160, 150, 255],   // soft purple
      bg:        [12, 10, 25],      // dark purple
    }
  };

  /* ═══ SET MOOD — triggers palette transition ═══ */
  setMood(mood) {
    if (mood === this._mood) return;
    this._mood = mood;
    const palette = KalmaVisualizer.PALETTES[mood] || KalmaVisualizer.PALETTES.neutral;
    this._currentPalette = this._getInterpolatedPalette(); // snapshot current
    this._targetPalette = palette;
    this._paletteBlend = 0; // start transition
  }

  /* ═══ SET TENSION — drives sacred geometry morphing ═══ */
  setTension(tension) {
    this._tension = tension;
    // Higher tension → more complex geometry
    // 0-0.2: circle, 0.2-0.4: hexagon, 0.4-0.6: flower of life,
    // 0.6-0.8: seed of life, 0.8-1.0: mandala
    this._geoTarget = tension * (this._shapes.length - 1);
  }

  /* ═══ UPDATE — call each frame ═══ */
  update(dt) {
    // Smooth palette transition (2 seconds)
    if (this._paletteBlend < 1) {
      this._paletteBlend = Math.min(1, this._paletteBlend + dt * 0.5);
    }

    // Smooth geometry morphing
    const morphSpeed = 0.3 * dt; // slow, organic morphing
    this._geoCurrent += (this._geoTarget - this._geoCurrent) * morphSpeed;

    // Slow rotation
    this._rotation += dt * 0.08; // very slow

    // Breathing animation (synced to ~4s cycle)
    this._breathPhase += dt * 0.4;
  }

  /* ═══ GET CURRENT PALETTE (interpolated) ═══ */
  _getInterpolatedPalette() {
    if (this._paletteBlend >= 1) return this._targetPalette;
    const t = this._smoothstep(this._paletteBlend);
    const result = {};
    for (const key of Object.keys(this._targetPalette)) {
      result[key] = this._lerpColor(this._currentPalette[key], this._targetPalette[key], t);
    }
    return result;
  }

  /* ═══ GET COLOR HELPERS ═══ */
  getPrimary(alpha = 1) {
    const p = this._getInterpolatedPalette();
    return `rgba(${p.primary[0]}, ${p.primary[1]}, ${p.primary[2]}, ${alpha})`;
  }

  getSecondary(alpha = 1) {
    const p = this._getInterpolatedPalette();
    return `rgba(${p.secondary[0]}, ${p.secondary[1]}, ${p.secondary[2]}, ${alpha})`;
  }

  getGlow(alpha = 1) {
    const p = this._getInterpolatedPalette();
    return `rgba(${p.glow[0]}, ${p.glow[1]}, ${p.glow[2]}, ${alpha})`;
  }

  getRawPrimary() {
    return this._getInterpolatedPalette().primary;
  }

  getRawSecondary() {
    return this._getInterpolatedPalette().secondary;
  }

  getRawGlow() {
    return this._getInterpolatedPalette().glow;
  }

  /* ═══ DRAW SACRED GEOMETRY ═══
     Renders the current geometry state on a canvas context.
     Morphs between shapes based on tension. */
  drawGeometry(ctx, cx, cy, radius, energy) {
    const p = this._getInterpolatedPalette();
    const breath = 1 + Math.sin(this._breathPhase) * 0.04;
    const r = radius * breath;

    // Determine which two shapes to blend between
    const shapeIdx = this._geoCurrent;
    const lower = Math.floor(shapeIdx);
    const upper = Math.min(lower + 1, this._shapes.length - 1);
    const blend = shapeIdx - lower;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this._rotation);

    // Draw lower shape
    if (blend < 1) {
      ctx.globalAlpha = (1 - blend) * (0.25 + energy * 0.3);
      this._drawShape(ctx, this._shapes[lower], r, p, energy);
    }

    // Draw upper shape
    if (blend > 0) {
      ctx.globalAlpha = blend * (0.25 + energy * 0.3);
      this._drawShape(ctx, this._shapes[upper], r, p, energy);
    }

    ctx.restore();
  }

  /* ═══ INDIVIDUAL SHAPE RENDERERS ═══ */
  _drawShape(ctx, shape, r, palette, energy) {
    switch (shape) {
      case 'circle': this._drawCircle(ctx, r, palette, energy); break;
      case 'hexagon': this._drawHexagon(ctx, r, palette, energy); break;
      case 'flowerOfLife': this._drawFlowerOfLife(ctx, r, palette, energy); break;
      case 'seedOfLife': this._drawSeedOfLife(ctx, r, palette, energy); break;
      case 'mandala': this._drawMandala(ctx, r, palette, energy); break;
    }
  }

  /* ── Circle: simple breathing ring ── */
  _drawCircle(ctx, r, palette, energy) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${palette.primary[0]}, ${palette.primary[1]}, ${palette.primary[2]}, 0.4)`;
    ctx.lineWidth = 1.5 + energy * 2;
    ctx.stroke();

    // Inner glow
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${palette.glow[0]}, ${palette.glow[1]}, ${palette.glow[2]}, 0.2)`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* ── Hexagon: six-sided with inner structure ── */
  _drawHexagon(ctx, r, palette, energy) {
    // Outer hexagon
    this._polygon(ctx, 6, r);
    ctx.strokeStyle = `rgba(${palette.primary[0]}, ${palette.primary[1]}, ${palette.primary[2]}, 0.4)`;
    ctx.lineWidth = 1.5 + energy * 1.5;
    ctx.stroke();

    // Inner hexagon (rotated 30°)
    ctx.save();
    ctx.rotate(Math.PI / 6);
    this._polygon(ctx, 6, r * 0.6);
    ctx.strokeStyle = `rgba(${palette.secondary[0]}, ${palette.secondary[1]}, ${palette.secondary[2]}, 0.3)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Center dot
    ctx.beginPath();
    ctx.arc(0, 0, 2 + energy * 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${palette.glow[0]}, ${palette.glow[1]}, ${palette.glow[2]}, 0.5)`;
    ctx.fill();
  }

  /* ── Flower of Life: overlapping circles (sacred geometry) ── */
  _drawFlowerOfLife(ctx, r, palette, energy) {
    const circleR = r * 0.33;
    ctx.strokeStyle = `rgba(${palette.primary[0]}, ${palette.primary[1]}, ${palette.primary[2]}, 0.3)`;
    ctx.lineWidth = 1 + energy * 1;

    // Center circle
    ctx.beginPath();
    ctx.arc(0, 0, circleR, 0, Math.PI * 2);
    ctx.stroke();

    // 6 surrounding circles
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const px = Math.cos(angle) * circleR;
      const py = Math.sin(angle) * circleR;
      ctx.beginPath();
      ctx.arc(px, py, circleR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Outer ring
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${palette.secondary[0]}, ${palette.secondary[1]}, ${palette.secondary[2]}, 0.15)`;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  /* ── Seed of Life: 7 circles (genesis pattern) ── */
  _drawSeedOfLife(ctx, r, palette, energy) {
    const circleR = r * 0.35;
    ctx.lineWidth = 1 + energy * 0.8;

    // Center circle
    ctx.strokeStyle = `rgba(${palette.glow[0]}, ${palette.glow[1]}, ${palette.glow[2]}, 0.3)`;
    ctx.beginPath();
    ctx.arc(0, 0, circleR, 0, Math.PI * 2);
    ctx.stroke();

    // First ring of 6
    ctx.strokeStyle = `rgba(${palette.primary[0]}, ${palette.primary[1]}, ${palette.primary[2]}, 0.3)`;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const px = Math.cos(angle) * circleR;
      const py = Math.sin(angle) * circleR;
      ctx.beginPath();
      ctx.arc(px, py, circleR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Second ring of 6 (rotated 30°, at double distance)
    ctx.strokeStyle = `rgba(${palette.secondary[0]}, ${palette.secondary[1]}, ${palette.secondary[2]}, 0.2)`;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const px = Math.cos(angle) * circleR * 1.73;
      const py = Math.sin(angle) * circleR * 1.73;
      ctx.beginPath();
      ctx.arc(px, py, circleR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Bounding circle
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${palette.tertiary[0]}, ${palette.tertiary[1]}, ${palette.tertiary[2]}, 0.15)`;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  /* ── Mandala: full complexity (multiple rings + radial lines) ── */
  _drawMandala(ctx, r, palette, energy) {
    const petals = 12;
    const layers = 3;

    // Radial guide lines (very subtle)
    ctx.strokeStyle = `rgba(${palette.tertiary[0]}, ${palette.tertiary[1]}, ${palette.tertiary[2]}, 0.12)`;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      ctx.stroke();
    }

    // Concentric petal rings
    for (let layer = 1; layer <= layers; layer++) {
      const layerR = r * (layer / layers) * 0.85;
      const petalR = layerR * 0.3;
      const alpha = 0.15 + (layer / layers) * 0.2 + energy * 0.15;

      ctx.strokeStyle = `rgba(${palette.primary[0]}, ${palette.primary[1]}, ${palette.primary[2]}, ${alpha})`;
      ctx.lineWidth = 1 + energy * 0.5;

      for (let i = 0; i < petals; i++) {
        const angle = (i / petals) * Math.PI * 2 + (layer * Math.PI / petals);
        const px = Math.cos(angle) * layerR;
        const py = Math.sin(angle) * layerR;

        // Draw petal (ellipse approximation)
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, petalR * 0.4, petalR, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Center flower (small flower of life)
    const centerR = r * 0.18;
    ctx.strokeStyle = `rgba(${palette.glow[0]}, ${palette.glow[1]}, ${palette.glow[2]}, 0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, centerR, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * centerR * 0.5, Math.sin(angle) * centerR * 0.5, centerR * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Outer bounding circle
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${palette.secondary[0]}, ${palette.secondary[1]}, ${palette.secondary[2]}, 0.2)`;
    ctx.lineWidth = 1.2 + energy * 1;
    ctx.stroke();
  }

  /* ═══ UTILITY ═══ */
  _polygon(ctx, sides, r) {
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  _lerpColor(a, b, t) {
    if (!a || !b) return b || a || [128, 128, 128];
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }

  _smoothstep(t) {
    return t * t * (3 - 2 * t);
  }
}
