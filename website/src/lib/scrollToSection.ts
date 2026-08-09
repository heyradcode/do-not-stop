/**
 * Landing a section exactly under the floating header.
 *
 * Lives outside the header component because none of it is header UI — it is
 * page navigation, driven by the header but also by a hash in the URL.
 */

/** Frames of stillness treated as "the scroll has stopped", where scrollend is absent. */
const STILL_FRAMES = 3;
/** Below this, the landing is already exact and correcting would only jitter. */
const TOLERANCE_PX = 1;

/**
 * How far `target` is from where it should land, in px.
 *
 * Two cases, because the header is a floating pill and not an opaque bar —
 * nothing hides the strip of viewport around it, so a landing must never leave
 * the previous section visible in that strip:
 *
 * - A section with a full-viewport pinned scene lands flush at the viewport
 *   top. The scene owns the whole screen and pads its own content clear of the
 *   glass.
 * - Any other section lands with its content resting at the anchor offset when
 *   its own top padding is deep enough to reach the border, and at the header's
 *   edge otherwise — never higher, so the heading cannot tuck under the glass,
 *   and never lower than its padding can cover, so the previous section's tail
 *   cannot show above the border.
 *
 * The offset is read back from the resolved `scroll-padding-top`: custom
 * properties do not resolve calc() through getComputedStyle, real properties
 * do, so this is the one place the number exists and JS and CSS cannot drift.
 */
export const landingError = (target: Element): number => {
  const pin = target.querySelector('.pin');
  if (pin && getComputedStyle(pin).position === 'sticky') {
    return Math.round(target.getBoundingClientRect().top);
  }

  const root = getComputedStyle(document.documentElement);
  const offset = parseFloat(root.scrollPaddingTop) || 0;
  const gap = parseFloat(root.getPropertyValue('--anchor-gap')) || 0;
  const headerHeight = offset - gap;

  const padding = parseFloat(getComputedStyle(target).paddingTop) || 0;
  const contentY = Math.max(headerHeight, Math.min(padding, offset));

  return Math.round(target.getBoundingClientRect().top + padding - contentY);
};

/**
 * Once the scroll has come to rest, re-measure and instantly remove whatever
 * error remains. A single scrollTo cannot be pixel-perfect: any layout shift
 * while the animation runs — an image decoding, a font swapping, dvh settling —
 * moves the target by exactly the amount the landing ends up off by.
 *
 * Cancelled the moment the reader scrolls themselves, so the correction can
 * never yank the page away from someone who changed their mind mid-flight.
 */
const settleOnArrival = (target: Element) => {
  let cancelled = false;

  const cleanup = () => {
    window.removeEventListener('wheel', cancel);
    window.removeEventListener('touchstart', cancel);
    window.removeEventListener('keydown', cancel);
    window.removeEventListener('scrollend', onEnd);
  };

  function cancel() {
    cancelled = true;
    cleanup();
  }

  const correct = () => {
    if (cancelled) return;
    const error = landingError(target);
    if (Math.abs(error) > TOLERANCE_PX) window.scrollBy({ top: error, behavior: 'auto' });
  };

  function onEnd() {
    cleanup();
    correct();
  }

  window.addEventListener('wheel', cancel, { passive: true, once: true });
  window.addEventListener('touchstart', cancel, { passive: true, once: true });
  window.addEventListener('keydown', cancel, { once: true });

  if ('onscrollend' in window) {
    window.addEventListener('scrollend', onEnd, { once: true });
    return;
  }

  // Safari has no scrollend: treat a few frames without movement as arrival.
  let last = -1;
  let still = 0;

  const tick = () => {
    if (cancelled) return;

    const y = window.scrollY;
    if (Math.abs(y - last) < 1) {
      if (++still >= STILL_FRAMES) {
        cleanup();
        correct();
        return;
      }
    } else {
      still = 0;
    }

    last = y;
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
};

/** Scrolls `target` to its landing position, then corrects once it settles. */
export const scrollToSection = (target: Element, { smooth = true } = {}): void => {
  const top = window.scrollY + landingError(target);
  window.scrollTo({ top: Math.max(top, 0), behavior: smooth ? 'smooth' : 'auto' });
  settleOnArrival(target);
};

/**
 * Resolves an in-page href to an element, tolerating the tracking hashes some
 * external tools append, which are not valid selectors.
 */
export const findSection = (href: string): Element | null => {
  try {
    return document.querySelector(href);
  } catch {
    return null;
  }
};
