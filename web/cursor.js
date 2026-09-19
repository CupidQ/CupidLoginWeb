// 使用 canvas-nest.js 2.0.1 。
const nestLayer = document.createElement('div');
nestLayer.className = 'nest-effects';
nestLayer.setAttribute('aria-hidden', 'true');
document.body.append(nestLayer);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let nest = null;
const dayColor = [28, 57, 105];
const nightColor = [174, 192, 255];
let particleColor = targetColor();
let colorFrame = 0;

class SmoothCanvasNest extends CanvasNest {
  drawCanvas() {
    const now = performance.now();
    const dt = Math.min((now - (this.lastTime ?? now - 1000 / 60)) / (1000 / 60), 2);
    this.lastTime = now;
    this.updatePositions(dt);
    this.drawConnections();
    this.requestFrame(this.drawCanvas);
  }

  updatePositions(frameScale) {
    const { canvas, points, current } = this;
    points.forEach((point) => {
      let influence = 0;
      let dx = 0;
      let dy = 0;
      if (current.x !== null && current.y !== null) {
        dx = current.x - point.x;
        dy = current.y - point.y;
        const proximity = Math.max(0, 1 - Math.hypot(dx, dy) / Math.sqrt(current.max));
        influence = proximity * proximity * (3 - 2 * proximity);
      }
      const vx = point.xa * (1 - influence) + dx * 0.025 * influence;
      const vy = point.ya * (1 - influence) + dy * 0.025 * influence;
      point.x += vx * frameScale;
      point.y += vy * frameScale;
      if (point.x < 0 || point.x > canvas.width) {
        point.x = Math.max(0, Math.min(canvas.width, point.x));
        point.xa *= -1;
      }
      if (point.y < 0 || point.y > canvas.height) {
        point.y = Math.max(0, Math.min(canvas.height, point.y));
        point.ya *= -1;
      }
    });
  }

  drawConnections() {
    const { context: ctx, canvas, points } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    points.forEach((point, index) => {
      ctx.fillRect(point.x - 0.5, point.y - 0.5, 1, 1);
      for (let j = index + 1; j < this.all.length; j++) {
        const other = this.all[j];
        if (other.x === null || other.y === null) continue;
        const distanceSquared = (point.x - other.x) ** 2 + (point.y - other.y) ** 2;
        if (distanceSquared >= other.max) continue;
        const strength = 1 - distanceSquared / other.max;
        ctx.beginPath();
        ctx.lineWidth = strength / 2;
        ctx.strokeStyle = `rgba(${this.c.color},${strength * 0.8})`;
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(other.x, other.y);
        ctx.stroke();
      }
    });
  }
}

function targetColor() {
  return document.documentElement.dataset.theme === 'dark' ? nightColor : dayColor;
}

function paintParticles() {
  if (!nest) return;
  nest.c.color = particleColor.map(Math.round).join(',');
  nest.context.fillStyle = `rgb(${nest.c.color})`;
}

function transitionParticles() {
  cancelAnimationFrame(colorFrame);
  const from = [...particleColor];
  const to = targetColor();
  if (!nest || reducedMotion.matches || document.hidden) {
    particleColor = [...to];
    paintParticles();
    return;
  }
  const started = performance.now();
  function step(now) {
    const progress = Math.min((now - started) / 1000, 1);
    const eased = progress * progress * (3 - 2 * progress);
    particleColor = from.map((value, i) => value + (to[i] - value) * eased);
    paintParticles();
    if (progress < 1) colorFrame = requestAnimationFrame(step);
  }
  colorFrame = requestAnimationFrame(step);
}

function updateNest() {
  if (reducedMotion.matches || document.hidden) {
    cancelAnimationFrame(colorFrame);
    if (nest) nest.destroy();
    nest = null;
    return;
  }
  if (nest) return;
  particleColor = [...targetColor()];
  nest = new SmoothCanvasNest(nestLayer, {
    color: particleColor.join(','),
    opacity: 0.65,
    count: window.innerWidth < 600 ? 100 : 250,
    zIndex: 0,
  });
  nest.points.forEach((point) => {
    point.xa *= 0.25;
    point.ya *= 0.25;
  });
  nest.current.max = 60 * 60;
  paintParticles();
}

new MutationObserver(transitionParticles).observe(document.documentElement, {
  attributes: true, attributeFilter: ['data-theme'],
});

reducedMotion.addEventListener('change', updateNest);
document.addEventListener('visibilitychange', updateNest);
updateNest();
