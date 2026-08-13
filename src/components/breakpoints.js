/**
 * Desktop breakpoint, in pixels, at which the mobile navigation drawer
 * transitions into the persistent desktop sidebar.
 *
 * This value MUST stay in sync with the `@media (min-width: 769px)` rules
 * in `Sidebar.css` and `Layout.css`, which drive the corresponding visual
 * layout switch (drawer overlay vs. persistent sidebar column). If the CSS
 * breakpoint ever changes, update this constant to match — the CSS and this
 * module are two expressions of the same single breakpoint and must not
 * drift apart.
 *
 * @type {number}
 */
export const DESKTOP_BREAKPOINT_PX = 769;

/**
 * `window.matchMedia` query string for {@link DESKTOP_BREAKPOINT_PX}.
 * Derived from the constant so every consumer shares one source of truth
 * instead of hardcoding the breakpoint in multiple places.
 *
 * @type {string}
 */
export const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_BREAKPOINT_PX}px)`;

/**
 * Subscribes to viewport transitions across {@link DESKTOP_MEDIA_QUERY} and
 * invokes `onChange` with the current desktop-match state. `onChange` fires
 * once synchronously on subscribe (so callers can react to a viewport that
 * is already desktop-sized) and again on every subsequent transition.
 *
 * Safely no-ops when `window.matchMedia` is unavailable (e.g. some test
 * environments or SSR): `onChange` is never called and the returned
 * unsubscribe function is a no-op.
 *
 * This is the single owner-facing helper for the mobile-drawer breakpoint;
 * components should call it rather than calling `window.matchMedia`
 * directly, so exactly one mounted component ends up registering a
 * listener for a given concern.
 *
 * @param {(matchesDesktop: boolean) => void} onChange Invoked with the
 *   desktop-match state on subscribe and on every subsequent change.
 * @returns {() => void} Unsubscribe function. Always safe to call.
 */
export function subscribeToDesktopBreakpoint(onChange) {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {};
  }

  const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
  const handleChange = (event) => onChange(event.matches);

  onChange(mediaQuery.matches);

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }

  if (mediaQuery.addListener) {
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }

  return () => {};
}
