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
    // A floating, hidable chat box injected into the page itself, so the operator can
    // steer the agent without leaving the demo window. Two-way: it renders agent
    // messages pushed from Node and sends operator input back via window.__aydChatSend.
    chat: {
      mount() {
        if (document.getElementById('__ayd_chat')) return;
        const panel = el('div', {
          position: 'fixed', right: '20px', bottom: '20px', width: '340px', maxHeight: '62vh',
          display: 'flex', flexDirection: 'column', zIndex: String(Z + 8), color: '#e8eaf0',
          background: 'rgba(18,20,27,0.92)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', webkitBackdropFilter: 'blur(10px)',
          font: '13px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif', overflow: 'hidden',
        }, document.documentElement);
        panel.id = '__ayd_chat';
        const head = el('div', { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }, panel);
        el('span', { width: '8px', height: '8px', borderRadius: '50%', background: '#34d399', flex: 'none' }, head);
        const title = el('span', { fontWeight: '700', letterSpacing: '.02em' }, head);
        title.textContent = 'ayd agent';
        const min = el('button', { marginLeft: 'auto', background: 'transparent', border: '0', color: '#98a1b3', cursor: 'pointer', fontSize: '18px', lineHeight: '1', padding: '0 4px' }, head);
        min.textContent = '–'; min.title = 'Hide';
        min.onclick = () => window.__ayd.chat.hide();
        const logEl = el('div', { flex: '1', overflow: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '80px' }, panel);
        logEl.id = '__ayd_chat_log';
        const foot = el('div', { display: 'flex', gap: '8px', padding: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' }, panel);
        const input = el('textarea', {
          flex: '1', resize: 'none', height: '38px', maxHeight: '96px', background: 'rgba(255,255,255,0.06)', color: '#e8eaf0',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: '9px', padding: '8px 10px', font: 'inherit', outline: 'none',
        }, foot);
        input.id = '__ayd_chat_input'; input.placeholder = 'Message the agent…';
        const send = el('button', { background: '#6d6cf5', color: '#fff', border: '0', borderRadius: '9px', padding: '0 14px', fontWeight: '600', cursor: 'pointer' }, foot);
        send.textContent = 'Send';
        const doSend = () => {
          const t = input.value.trim(); if (!t) return;
          window.__ayd.chat.push({ kind: 'you', text: t });
          try { if (typeof window.__aydChatSend === 'function') window.__aydChatSend(t); } catch (e) {}
          input.value = '';
        };
        send.onclick = doSend;
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
        const btn = el('button', {
          position: 'fixed', right: '20px', bottom: '20px', zIndex: String(Z + 8), display: 'none',
          width: '52px', height: '52px', borderRadius: '50%', border: '0', cursor: 'pointer',
          background: '#6d6cf5', color: '#fff', fontSize: '22px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        }, document.documentElement);
        btn.id = '__ayd_chat_btn'; btn.textContent = '💬'; btn.title = 'Chat with the agent';
        btn.onclick = () => window.__ayd.chat.show();
      },
      push(msg) {
        this.mount();
        const logEl = document.getElementById('__ayd_chat_log');
        if (!logEl) return;
        const kind = (msg && msg.kind) || 'status';
        let node;
        if (kind === 'action') {
          node = el('div', { alignSelf: 'flex-start', maxWidth: '90%', font: '11px/1.4 ui-monospace,Menlo,monospace', color: '#98a1b3', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '4px 8px' }, logEl);
          node.textContent = '› ' + (msg.tool || '') + (msg.detail ? ' ' + msg.detail : '');
        } else if (kind === 'status') {
          node = el('div', { alignSelf: 'center', fontSize: '11px', color: '#6b7385' }, logEl);
          node.textContent = msg.text || '';
        } else if (kind === 'done') {
          node = el('div', { alignSelf: 'center', width: '100%', textAlign: 'center', fontSize: '11px', color: '#6b7385', borderTop: '1px dashed rgba(255,255,255,0.12)', paddingTop: '6px' }, logEl);
          node.textContent = 'turn complete';
        } else {
          const you = kind === 'you', errk = kind === 'error';
          node = el('div', {
            alignSelf: you ? 'flex-end' : 'flex-start', maxWidth: '86%', padding: '7px 10px', borderRadius: '12px',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            background: you ? '#6d6cf5' : errk ? 'rgba(242,99,99,0.18)' : 'rgba(255,255,255,0.08)',
            color: errk ? '#f26363' : '#fff',
          }, logEl);
          node.textContent = msg.text || '';
        }
        logEl.scrollTop = logEl.scrollHeight;
      },
      show() {
        this.mount();
        const p = document.getElementById('__ayd_chat'), b = document.getElementById('__ayd_chat_btn');
        if (p) p.style.display = 'flex';
        if (b) b.style.display = 'none';
        const i = document.getElementById('__ayd_chat_input');
        if (i) i.focus();
      },
      hide() {
        const p = document.getElementById('__ayd_chat'), b = document.getElementById('__ayd_chat_btn');
        if (p) p.style.display = 'none';
        if (b) b.style.display = 'block';
      },
      setVisible(v) { v ? this.show() : this.hide(); },
    },
  };
})();
`;
