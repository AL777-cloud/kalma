// Generate Kálma PWA icons — orb-inspired design
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [192, 512];
const outDir = path.join(__dirname, 'app', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function drawOrb(ctx, size, maskable) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * (maskable ? 0.4 : 0.42);

  // Background
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, size, size);

  // Outer glow layer (blue)
  const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.3);
  g1.addColorStop(0, 'rgba(140, 180, 255, 0.25)');
  g1.addColorStop(0.5, 'rgba(140, 180, 255, 0.08)');
  g1.addColorStop(1, 'transparent');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, size, size);

  // Mid layer (purple/pink)
  const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.9);
  g2.addColorStop(0, 'rgba(200, 170, 255, 0.35)');
  g2.addColorStop(0.5, 'rgba(200, 170, 255, 0.1)');
  g2.addColorStop(1, 'transparent');
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
  ctx.fill();

  // Inner layer (warm pink)
  const g3 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.65);
  g3.addColorStop(0, 'rgba(255, 200, 220, 0.35)');
  g3.addColorStop(0.5, 'rgba(255, 190, 210, 0.12)');
  g3.addColorStop(1, 'transparent');
  ctx.fillStyle = g3;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  ctx.fill();

  // Core (green glow)
  const g4 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.35);
  g4.addColorStop(0, 'rgba(180, 255, 180, 0.5)');
  g4.addColorStop(0.5, 'rgba(180, 255, 180, 0.15)');
  g4.addColorStop(1, 'transparent');
  ctx.fillStyle = g4;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Eye — almond shape
  const eyeW = r * 0.35;
  const eyeH = r * 0.18;

  // Eye outline
  ctx.beginPath();
  ctx.moveTo(cx - eyeW, cy);
  ctx.quadraticCurveTo(cx, cy - eyeH, cx + eyeW, cy);
  ctx.quadraticCurveTo(cx, cy + eyeH, cx - eyeW, cy);
  ctx.closePath();
  ctx.fillStyle = 'rgba(10, 10, 18, 0.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(139, 131, 255, 0.6)';
  ctx.lineWidth = size * 0.005;
  ctx.stroke();

  // Iris
  const irisR = eyeH * 0.55;
  const irisGrad = ctx.createRadialGradient(cx, cy, irisR * 0.4, cx, cy, irisR);
  irisGrad.addColorStop(0, 'rgba(108, 99, 255, 0.9)');
  irisGrad.addColorStop(0.7, 'rgba(139, 131, 255, 0.8)');
  irisGrad.addColorStop(1, 'rgba(80, 70, 180, 0.6)');

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - eyeW, cy);
  ctx.quadraticCurveTo(cx, cy - eyeH, cx + eyeW, cy);
  ctx.quadraticCurveTo(cx, cy + eyeH, cx - eyeW, cy);
  ctx.closePath();
  ctx.clip();

  ctx.beginPath();
  ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
  ctx.fillStyle = irisGrad;
  ctx.fill();

  // Pupil
  const pupilR = irisR * 0.45;
  ctx.beginPath();
  ctx.arc(cx, cy, pupilR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10, 10, 18, 0.95)';
  ctx.fill();

  // Light reflection
  ctx.beginPath();
  ctx.arc(cx - pupilR * 0.3, cy - pupilR * 0.3, pupilR * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fill();

  ctx.restore();
}

// Generate regular icons
for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  drawOrb(ctx, size, false);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), canvas.toBuffer('image/png'));
  console.log(`Generated icon-${size}.png`);
}

// Generate maskable icon (512 only, more padding)
const maskCanvas = createCanvas(512, 512);
const maskCtx = maskCanvas.getContext('2d');
drawOrb(maskCtx, 512, true);
fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), maskCanvas.toBuffer('image/png'));
console.log('Generated icon-maskable-512.png');

console.log('Done!');
