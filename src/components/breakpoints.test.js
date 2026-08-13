import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DESKTOP_BREAKPOINT_PX,
  DESKTOP_MEDIA_QUERY,
  subscribeToDesktopBreakpoint,
} from './breakpoints.js';

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  if (originalMatchMedia) {
    window.matchMedia = originalMatchMedia;
  } else {
    delete window.matchMedia;
  }
});

function installMatchMediaMock({ initialMatches = false } = {}) {
  const listeners = [];
  const mediaQueryList = {
    matches: initialMatches,
    media: DESKTOP_MEDIA_QUERY,
    onchange: null,
    addListener: (listener) => listeners.push(listener),
    removeListener: (listener) => {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    },
    addEventListener: (type, listener) => {
      if (type === 'change') listeners.push(listener);
    },
    removeEventListener: (type, listener) => {
      if (type === 'change') {
        const idx = listeners.indexOf(listener);
        if (idx !== -1) listeners.splice(idx, 1);
      }
    },
    dispatchEvent: vi.fn(),
  };

  const matchMediaSpy = vi.fn().mockImplementation(() => mediaQueryList);
  window.matchMedia = matchMediaSpy;

  return {
    matchMediaSpy,
    fireChange: (matches) => {
      mediaQueryList.matches = matches;
      listeners.slice().forEach((listener) => listener({ matches }));
    },
  };
}

describe('breakpoints constants', () => {
  it('derives the media query string from the pixel breakpoint', () => {
    expect(DESKTOP_BREAKPOINT_PX).toBe(769);
    expect(DESKTOP_MEDIA_QUERY).toBe(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`);
  });
});

describe('subscribeToDesktopBreakpoint', () => {
  it('queries the shared media query string', () => {
    const { matchMediaSpy } = installMatchMediaMock();

    subscribeToDesktopBreakpoint(() => {});

    expect(matchMediaSpy).toHaveBeenCalledWith(DESKTOP_MEDIA_QUERY);
  });

  it('invokes the callback once synchronously with the current match state', () => {
    installMatchMediaMock({ initialMatches: true });
    const onChange = vi.fn();

    subscribeToDesktopBreakpoint(onChange);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('invokes the callback again on every subsequent viewport change', () => {
    const { fireChange } = installMatchMediaMock({ initialMatches: false });
    const onChange = vi.fn();

    subscribeToDesktopBreakpoint(onChange);
    expect(onChange).toHaveBeenCalledTimes(1);

    fireChange(true);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(true);

    fireChange(false);
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('stops invoking the callback after unsubscribing', () => {
    const { fireChange } = installMatchMediaMock({ initialMatches: false });
    const onChange = vi.fn();

    const unsubscribe = subscribeToDesktopBreakpoint(onChange);
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    fireChange(true);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('safely no-ops when window.matchMedia is unavailable', () => {
    delete window.matchMedia;
    const onChange = vi.fn();

    const unsubscribe = subscribeToDesktopBreakpoint(onChange);

    expect(onChange).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });
});
