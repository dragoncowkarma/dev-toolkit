import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCopyFeedback } from './useCopyFeedback.js';

function CopyFeedbackHarness() {
  const [feedback, showFeedback] = useCopyFeedback({
    initialValue: 'idle',
    resetValue: 'idle',
    duration: 1500,
  });

  return <button onClick={() => showFeedback('copied')}>{feedback}</button>;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useCopyFeedback', () => {
  it('dismisses feedback after its configured duration', () => {
    vi.useFakeTimers();
    render(<CopyFeedbackHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'idle' }));
    expect(screen.getByRole('button', { name: 'copied' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('button', { name: 'idle' })).toBeInTheDocument();
  });

  it('reschedules feedback without leaving the prior dismissal timer pending', () => {
    vi.useFakeTimers();
    render(<CopyFeedbackHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'idle' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'copied' }));
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole('button', { name: 'copied' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('button', { name: 'idle' })).toBeInTheDocument();
  });

  it('clears a pending dismissal timer on unmount', () => {
    vi.useFakeTimers();
    const { unmount } = render(<CopyFeedbackHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'idle' }));
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
