/**
 * Canvas chart helpers — Cardiovascular Care Assistant
 * Lightweight dependency-free line charts for vitals history and the
 * synthetic ECG waveform. Prototype visualization only — NOT diagnostic.
 */

/** Handle devicePixelRatio so lines stay crisp on HiDPI screens. */
function prepareCanvas(canvas, cssWidth, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = cssWidth + "px";
  canvas.style.height = cssHeight + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * Draw a line chart of numeric values (oldest -> newest).
 * opts: { color, fillColor, unit, min, max, showBounds: [lo, hi] }
 */
function drawLineChart(canvas, values, opts) {
  opts = opts || {};
  const cssWidth = canvas.clientWidth || 600;
  const cssHeight = canvas.clientHeight || 160;
  const ctx = prepareCanvas(canvas, cssWidth, cssHeight);

  const color = opts.color || "#2563eb";
  const unit = opts.unit || "";
  const padL = 34, padR = 10, padT = 12, padB = 18;
  const w = cssWidth - padL - padR;
  const h = cssHeight - padT - padB;

  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const nums = (values || []).map(Number).filter(v => !isNaN(v));
  if (nums.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data yet", cssWidth / 2, cssHeight / 2);
    return;
  }

  let min = typeof opts.min === "number" ? opts.min : Math.min.apply(null, nums);
  let max = typeof opts.max === "number" ? opts.max : Math.max.apply(null, nums);
  if (opts.showBounds) {
    min = Math.min(min, opts.showBounds[0]);
    max = Math.max(max, opts.showBounds[1]);
  }
  if (max - min < 1e-6) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;

  const X = i => padL + (nums.length === 1 ? w / 2 : (i / (nums.length - 1)) * w);
  const Y = v => padT + h - ((v - min) / (max - min)) * h;

  // horizontal grid + y labels (3 lines)
  ctx.strokeStyle = "#e2e8f0";
  ctx.fillStyle = "#64748b";
  ctx.lineWidth = 1;
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "right";
  for (let g = 0; g <= 2; g++) {
    const v = min + ((max - min) * g) / 2;
    const y = Y(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + w, y);
    ctx.stroke();
    ctx.fillText(Math.round(v) + (unit === "%" ? "%" : ""), padL - 5, y + 3);
  }

  // prototype threshold band (dashed) — demo rules, not medical advice
  if (opts.showBounds) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#f59e0b";
    [opts.showBounds[0], opts.showBounds[1]].forEach(b => {
      if (b > min && b < max) {
        const y = Y(b);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + w, y);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  // area fill
  const grad = ctx.createLinearGradient(0, padT, 0, padT + h);
  grad.addColorStop(0, opts.fillColor || "rgba(37, 99, 235, 0.18)");
  grad.addColorStop(1, "rgba(37, 99, 235, 0)");
  ctx.beginPath();
  nums.forEach((v, i) => (i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v))));
  ctx.lineTo(X(nums.length - 1), padT + h);
  ctx.lineTo(X(0), padT + h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // line
  ctx.beginPath();
  nums.forEach((v, i) => (i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  // last point marker
  const lx = X(nums.length - 1), ly = Y(nums[nums.length - 1]);
  ctx.beginPath();
  ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // min/max labels
  ctx.fillStyle = "#64748b";
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(Math.round(Math.max.apply(null, nums)) + unit, padL + 2, padT + 9);
}

/**
 * Draw the synthetic ECG waveform. `samples` is an array of raw numeric
 * samples (10-bit ADC style, baseline ~512), oldest -> newest.
 */
function drawEcg(canvas, samples) {
  const cssWidth = canvas.clientWidth || 600;
  const cssHeight = canvas.clientHeight || 170;
  const ctx = prepareCanvas(canvas, cssWidth, cssHeight);

  ctx.clearRect(0, 0, cssWidth, cssHeight);

  // background grid — ECG-paper look
  ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
  ctx.lineWidth = 1;
  for (let x = 0; x < cssWidth; x += 12) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cssHeight); ctx.stroke();
  }
  for (let y = 0; y < cssHeight; y += 12) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cssWidth, y); ctx.stroke();
  }

  const nums = (samples || []).map(Number).filter(v => !isNaN(v));
  if (nums.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Waiting for ECG data…", cssWidth / 2, cssHeight / 2);
    return;
  }

  // baseline = median-ish (resistant to spikes)
  const sorted = nums.slice().sort((a, b) => a - b);
  const base = sorted[Math.floor(sorted.length / 2)];

  // normalize around baseline with generous headroom for QRS spikes
  let maxDev = 30;
  nums.forEach(v => { maxDev = Math.max(maxDev, Math.abs(v - base)); });
  const scale = (cssHeight / 2 - 10) / maxDev;

  const X = i => (i / Math.max(1, nums.length - 1)) * cssWidth;
  const Y = v => cssHeight / 2 - (v - base) * scale;

  ctx.beginPath();
  nums.forEach((v, i) => (i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v))));
  ctx.strokeStyle = "#059669";
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  ctx.stroke();

  // leading dot (sweep feel)
  ctx.beginPath();
  ctx.arc(X(nums.length - 1), Y(nums[nums.length - 1]), 3, 0, Math.PI * 2);
  ctx.fillStyle = "#059669";
  ctx.fill();
}
