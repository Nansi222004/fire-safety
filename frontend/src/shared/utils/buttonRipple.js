// Tap/click ripple for buttons inside the user panel (.sf-user-ui). Installed once, one listener.
// The ripple lives in its own clipped layer, so buttons are never given overflow:hidden
// (badges / counters positioned outside a button stay visible). Opt out with data-no-anim.

const BUTTON_SELECTOR = 'button, [role="button"], a[class*="rounded"][class*="bg-"]';
const LIGHT_RIPPLE_HINT = /bg-\[#E31E24\]|bg-\[#e31e24\]|bg-primary-(5|6|7)00|from-\[#E31E24\]|from-primary-|bg-red-6|bg-slate-9|bg-gray-9|bg-black/;

let installed = false;

const spawnRipple = (event) => {
  if (event.button !== undefined && event.button !== 0) return;
  const target = event.target instanceof Element ? event.target.closest(BUTTON_SELECTOR) : null;
  if (!target || !target.closest('.sf-user-ui')) return;
  if (target.hasAttribute('data-no-anim') || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  if (getComputedStyle(target).position === 'static') target.style.position = 'relative';

  let layer = target.querySelector(':scope > .sf-ripple-layer');
  if (!layer) {
    layer = document.createElement('span');
    layer.className = 'sf-ripple-layer';
    layer.setAttribute('aria-hidden', 'true');
    target.appendChild(layer);
  }

  const size = Math.max(rect.width, rect.height) * 2.2;
  const ripple = document.createElement('span');
  ripple.className = `sf-ripple${LIGHT_RIPPLE_HINT.test(target.className || '') ? ' sf-ripple--light' : ''}`;
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
  layer.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  setTimeout(() => ripple.remove(), 1000); // safety cleanup
};

export const installButtonRipple = () => {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('pointerdown', spawnRipple, { passive: true });
};

export default installButtonRipple;
