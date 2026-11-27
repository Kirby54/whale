/* Whale — colors for scripts (charts, canvases, SVG, 3D): they come from the tokens in style.css (:root),
   so no component writes a color of its own. Theme.c.up, Theme.c.accent2… and Theme.alpha(color, 0.4). */
window.Theme = (() => {
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const NAMES = {
    bg: '--c-bg', text: '--c-text', text2: '--c-text-2', textHi: '--c-text-hi',
    accent: '--c-accent', accent2: '--c-accent-2', up: '--c-up', down: '--c-down', warn: '--c-warn',
    blue: '--c-blue', blue2: '--c-blue-2', violet: '--c-violet', teal: '--c-teal', cyan: '--c-cyan', cyan2: '--c-cyan-2',
    pink: '--c-pink', yellow: '--c-yellow', orange: '--c-orange', orange2: '--c-orange-2', lime: '--c-lime', magenta: '--c-magenta',
    slate: '--c-slate', green2: '--c-green-2', red2: '--c-red-2', neutral: '--c-neutral', neutralDim: '--c-neutral-dim',
    line: '--c-line', line2: '--c-line-2', surface: '--c-surface', hover: '--c-hover', selected: '--c-selected',
    accentSoft: '--c-accent-soft', accentEdge: '--c-accent-edge', upSoft: '--c-up-soft', downSoft: '--c-down-soft',
    grid: '--c-grid', crosshair: '--c-crosshair', chartLabel: '--c-chart-label', volUp: '--c-vol-up', volDown: '--c-vol-down',
  };
  const cache = {};
  const c = {};
  Object.keys(NAMES).forEach((k) => Object.defineProperty(c, k, { enumerable: true, get: () => cache[k] || (cache[k] = css(NAMES[k]) || '#808080') }));
  // The same color with another opacity; accepts #rgb, #rrggbb and rgb()/rgba() tokens
  function alpha(color, a) {
    let r, g, b;
    const h = String(color).trim();
    if (h[0] === '#') {
      const x = h.length === 4 ? h.slice(1).split('').map((d) => d + d).join('') : h.slice(1, 7);
      [r, g, b] = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
    } else {
      [r, g, b] = (h.match(/[\d.]+/g) || [128, 128, 128]).map(Number);
    }
    return `rgba(${r},${g},${b},${a})`;
  }
  return { css, c, alpha };
})();
