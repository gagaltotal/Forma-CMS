import { h, icon } from './dom.js';

export function modal(opts: { title: string; body: Node; footer?: Node; wide?: boolean }): { close: () => void; el: HTMLElement } {
  const prev = document.activeElement as HTMLElement | null;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      const f = [...dlg.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => !(x as HTMLButtonElement).disabled);
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  const dlg = h('div', { class: `dialog${opts.wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
    h('header', null, h('h2', null, opts.title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x'))),
    h('div', { class: 'dialog-body' }, opts.body),
    opts.footer ? h('footer', null, opts.footer) : null);
  const overlay = h('div', { class: 'overlay', onmousedown: (e: MouseEvent) => { if (e.target === overlay) close(); } }, dlg);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  (dlg.querySelector<HTMLElement>('input,select,textarea') ?? dlg.querySelector<HTMLElement>('.dialog-body button') ?? dlg).focus();
  return { close, el: dlg };
}

export function confirmBox(o: { title: string; message: string; confirm: string; danger?: boolean; typeToConfirm?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => { if (!done) { done = true; m.close(); resolve(v); } };
    const input = o.typeToConfirm ? h('input', { class: 'input', placeholder: o.typeToConfirm, 'aria-label': `Type ${o.typeToConfirm} to confirm`, oninput: () => { ok.disabled = input!.value !== o.typeToConfirm; } }) : null;
    const ok = h('button', { class: `btn ${o.danger ? 'danger' : 'primary'}`, disabled: !!o.typeToConfirm, onclick: () => finish(true) }, o.confirm);
    const m = modal({
      title: o.title,
      body: h('div', { class: 'stack' }, h('p', null, o.message), o.typeToConfirm ? h('p', { class: 'muted' }, 'Type ', h('code', null, o.typeToConfirm), ' to confirm.') : null, input),
      footer: h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => finish(false) }, 'Cancel'), ok),
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); finish(false); } });
    obs.observe(document.body, { childList: true });
  });
}
