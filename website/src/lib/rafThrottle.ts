export interface RafThrottled {
  (): void;
  /** Drops any frame already booked. Call from effect cleanup. */
  cancel(): void;
}

/**
 * Collapses a burst of calls into one call per animation frame.
 *
 * The pattern every scroll and pointer listener here needs: events fire far
 * faster than the screen refreshes, so running the handler per event is work
 * thrown away before anything is painted.
 */
export const rafThrottle = (fn: () => void): RafThrottled => {
  let frame = 0;

  const run = () => {
    frame = 0;
    fn();
  };

  const throttled = (() => {
    if (!frame) frame = requestAnimationFrame(run);
  }) as RafThrottled;

  throttled.cancel = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  return throttled;
};
