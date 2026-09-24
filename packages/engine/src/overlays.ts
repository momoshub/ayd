/**
 * On-screen demo chrome injected into each persona's page: a big gliding pointer
 * with click ripples, a translucent caption that dodges the highlighted element,
 * green success highlights, and a persona-coloured frame + tag.
 *
 * `captionAnchor` is the one bit of real logic (where to put the caption so it
 * never covers what we're pointing at) and is unit-tested; `OVERLAY_RUNTIME` is
 * a self-contained script installed via addInitScript and exercised by the
 * integration test.
 */

/** Put the caption on the opposite half from the target so it never covers it. */
export const captionAnchor = (
  targetTop: number,
  targetHeight: number,
  viewportHeight: number,
): 'top' | 'bottom' => {
  const center = targetTop + targetHeight / 2;
  return center > viewportHeight / 2 ? 'top' : 'bottom';
};

export interface HighlightBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Installed once per context; defines window.__ayd used by the driver. */
export const OVERLAY_RUNTIME = String.raw`
(() => {
  if (window.__ayd) return;
  const Z = 2147483640;
  const el = (tag, style, parent) => {
    const n = document.createElement(tag);
    Object.assign(n.style, style);
    (parent || document.body).appendChild(n);
    return n;
  };
  const ensureCursor = () => {
    if (document.getElementById('__ayd_cursor')) return;
    const c = el('div', {
      position: 'fixed', left: '-100px', top: '-100px', zIndex: String(Z + 6),
      pointerEvents: 'none', transform: 'translate(-3px,-2px)',
      filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.5))', transition: 'left .05s linear, top .05s linear',
    });
    c.id = '__ayd_cursor';
    c.innerHTML = '<svg width="40" height="40" viewBox="0 0 28 28"><path d="M7 4 L7 24 L12.5 18.5 L16 26 L19 24.7 L15.5 17.3 L23 17.3 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => {
      const r = el('div', {
        position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px', width: '12px', height: '12px',
        borderRadius: '50%', border: '3px solid #22c55e', transform: 'translate(-50%,-50%)',
        zIndex: String(Z + 6), pointerEvents: 'none', transition: 'all .5s ease-out',
      });
      requestAnimationFrame(() => { r.style.width = '52px'; r.style.height = '52px'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  window.__ayd = {
    frame(color, label) {
      let f = document.getElementById('__ayd_frame');
      if (!f) { f = el('div', {}, document.documentElement); f.id = '__ayd_frame'; }
      Object.assign(f.style, { position: 'fixed', inset: '0', border: '4px solid ' + color, boxSizing: 'border-box', zIndex: String(Z), pointerEvents: 'none' });
      let t = document.getElementById('__ayd_tag');
      if (!t) { t = el('div', {}, document.documentElement); t.id = '__ayd_tag'; }
      t.textContent = label;
      Object.assign(t.style, {
        position: 'fixed', left: '50%', top: '0', transform: 'translateX(-50%)', background: color, color: '#fff',
        font: '700 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif', letterSpacing: '.1em',
        padding: '6px 16px', borderRadius: '0 0 10px 10px', zIndex: String(Z + 7), pointerEvents: 'none',
        boxShadow: '0 2px 10px rgba(0,0,0,.3)',
      });
      ensureCursor();
    },
    caption(text, sub, anchor) {
      let cap = document.getElementById('__ayd_cap');
      if (!cap) {
        cap = el('div', {}, document.body); cap.id = '__ayd_cap';
        cap.innerHTML = '<div id="__ayd_cap_t" style="font-weight:600"></div><div id="__ayd_cap_s" style="font-size:15px;opacity:.78;margin-top:7px"></div>';
      }
      Object.assign(cap.style, {
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: String(Z + 7),
        background: 'rgba(15,17,21,0.55)', border: '1px solid rgba(255,255,255,0.14)',
        backdropFilter: 'blur(6px)', webkitBackdropFilter: 'blur(6px)', color: '#fff', padding: '16px 30px',
        borderRadius: '16px', textAlign: 'center', maxWidth: '70vw', boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
        pointerEvents: 'none', fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
        top: anchor === 'top' ? '28px' : 'auto', bottom: anchor === 'top' ? 'auto' : '38px',
      });
      const t = document.getElementById('__ayd_cap_t'), s = document.getElementById('__ayd_cap_s');
      t.style.fontSize = '22px'; t.textContent = text;
      s.textContent = sub || ''; s.style.display = sub ? 'block' : 'none';
    },
    highlight(box, label) {
      const h = el('div', {
        position: 'fixed', left: (box.x - 4) + 'px', top: (box.y - 4) + 'px', width: (box.width + 8) + 'px',
        height: (box.height + 8) + 'px', border: '3px solid #22c55e', borderRadius: '10px',
        boxShadow: '0 0 0 4px rgba(34,197,94,.22), 0 0 26px rgba(34,197,94,.55)', background: 'rgba(34,197,94,.08)',
        zIndex: String(Z + 5), pointerEvents: 'none', transition: 'opacity .4s ease',
      });
      if (label) {
        const b = el('div', {
          position: 'absolute', left: '0', top: '-30px', background: '#22c55e', color: '#fff',
          font: '600 13px/1 -apple-system,Segoe UI,Roboto,sans-serif', padding: '7px 11px', borderRadius: '8px', whiteSpace: 'nowrap',
        }, h);
        b.textContent = '✓ ' + label;
      }
      setTimeout(() => { h.style.opacity = '0'; setTimeout(() => h.remove(), 400); }, 1800);
    },
  };
})();
`;
