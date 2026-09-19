/**
 * AI motion engine — Cardiovascular Care Assistant
 * Auto-initializes on DOMContentLoaded:
 *   1. floating particle canvas (#ai-particles)
 *   2. scroll-reveal for .ai-reveal elements
 *   3. window.AI.countUp(el, target) for animated numerals
 * Zero dependencies; silently no-ops on reduced-motion.
 *
 * Academic prototype — synthetic demonstration data only.
 */
(function () {
  "use strict";

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var AI = {};

  /* ---------------- Count-up ---------------- */

  AI.countUp = function (el, target, decimals) {
    if (!el) return;
    var to = Number(target);
    if (isNaN(to)) { el.textContent = target; return; }
    if (reduced) { el.textContent = String(to); return; }
    var from = parseFloat(el.textContent);
    if (isNaN(from)) from = to - (to > 40 ? 6 : 3);
    var dur = 550, t0 = null;
    el.classList.add("ai-count");
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      var v = from + (to - from) * eased;
      el.textContent = decimals ? v.toFixed(decimals) : String(Math.round(v));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };

  /* ---------------- Scroll reveal ---------------- */

  function initReveal() {
    var els = document.querySelectorAll(".ai-reveal");
    if (!els.length) return;
    if (reduced || !("IntersectionObserver" in window)) {
      els.forEach ? els.forEach(function (e) { e.classList.add("ai-in"); }) : null;
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("ai-in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    Array.prototype.forEach.call(els, function (e, i) {
      e.style.transitionDelay = (Math.min(i, 6) * 60) + "ms";
      io.observe(e);
    });
  }

  /* ---------------- Particles ---------------- */

  function initParticles() {
    if (reduced) return;
    var canvas = document.createElement("canvas");
    canvas.id = "ai-particles";
    document.body.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    var parts = [], W = 0, H = 0;

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      var count = Math.min(70, Math.floor(W * H / 26000));
      parts = [];
      for (var i = 0; i < count; i++) {
        parts.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: Math.random() * 1.8 + 0.6,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25 - 0.08,
          hue: Math.random() < 0.75 ? "96, 165, 250" : (Math.random() < 0.5 ? "244, 114, 182" : "52, 211, 153"),
          a: Math.random() * 0.5 + 0.15
        });
      }
    }

    var linked = !document.body.classList.contains("ai-plain");

    function frame() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + p.hue + "," + p.a + ")";
        ctx.fill();
        if (linked) {
          for (var j = i + 1; j < parts.length; j++) {
            var q = parts[j];
            var dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
            if (d2 < 110 * 110) {
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
              ctx.strokeStyle = "rgba(96,165,250," + (0.10 * (1 - d2 / 12100)) + ")";
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }
        }
      }
      requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(frame);
  }

  function init() {
    initParticles();
    initReveal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.AI = AI;
})();
