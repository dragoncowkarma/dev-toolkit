import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TimezoneTool from './TimezoneTool.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TimezoneTool Component Tests', () => {
  it('renders default preset target timezones on initial load', () => {
    render(<TimezoneTool />);

    expect(screen.getByRole('heading', { name: 'Target Comparison Board' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'UTC' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'America/New_York' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Europe/London' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Asia/Seoul' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Asia/Tokyo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Australia/Sydney' })).toBeInTheDocument();
  });

  it('allows adding a new target timezone to the comparison list', async () => {
    render(<TimezoneTool />);

    const selectEl = screen.getByLabelText('Select target timezone to add');
    fireEvent.change(selectEl, { target: { value: 'America/Chicago' } });

    const addBtn = screen.getByRole('button', {
      name: 'Add selected timezone to comparison list',
    });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'America/Chicago' })).toBeInTheDocument();
    });
  });

  it('allows removing a target timezone from the comparison list', async () => {
    render(<TimezoneTool />);

    expect(screen.getByRole('heading', { name: 'Asia/Tokyo' })).toBeInTheDocument();

    const removeBtn = screen.getByRole('button', { name: 'Remove Asia/Tokyo' });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Asia/Tokyo' })).not.toBeInTheDocument();
    });
  });

  it('resets source date and time when clicking "Now" button', async () => {
    render(<TimezoneTool />);

    const sourceInput = screen.getByLabelText('Source date and time input');
    fireEvent.change(sourceInput, { target: { value: '2020-01-01T00:00' } });
    expect(sourceInput).toHaveValue('2020-01-01T00:00');

    const nowBtn = screen.getByRole('button', {
      name: 'Reset to current time in source timezone',
    });
    fireEvent.click(nowBtn);

    await waitFor(() => {
      expect(sourceInput.value).not.toBe('2020-01-01T00:00');
    });
  });

  it('shows success feedback on copying a target timezone local time to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<TimezoneTool />);

    const copyBtn = screen.getByRole('button', { name: 'Copy America/New_York local time' });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeText).toHaveBeenCalled();
    expect(
      await screen.findByRole('button', { name: 'America/New_York time copied' }),
    ).toBeInTheDocument();
  });

  it('dismisses copied feedback and toast after their original durations', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<TimezoneTool />);
    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy America/New_York local time' }));
    });
    expect(
      screen.getByRole('button', { name: 'America/New_York time copied' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Copied America\/New_York time/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(
      screen.getByRole('button', { name: 'Copy America/New_York local time' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Copied America\/New_York time/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByText(/Copied America\/New_York time/)).not.toBeInTheDocument();
  });

  it('resets copied feedback and toast dismissal timers for consecutive copies', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<TimezoneTool />);
    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy America/New_York local time' }));
    });
    expect(vi.getTimerCount()).toBe(2);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'America/New_York time copied' }));
    });
    expect(vi.getTimerCount()).toBe(2);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      screen.getByRole('button', { name: 'America/New_York time copied' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Copied America\/New_York time/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      screen.getByRole('button', { name: 'Copy America/New_York local time' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Copied America\/New_York time/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByText(/Copied America\/New_York time/)).not.toBeInTheDocument();
  });

  it('resets the toast dismissal timer for consecutive toasts', () => {
    render(<TimezoneTool />);
    vi.useFakeTimers();

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset to current time in source timezone' }),
    );
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset to current time in source timezone' }),
    );
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText('Reset to current local time.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('Reset to current local time.')).not.toBeInTheDocument();
  });

  it('clears pending copied feedback and toast timeouts on unmount', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<TimezoneTool />);
    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy America/New_York local time' }));
    });
    expect(vi.getTimerCount()).toBe(2);

    unmount();
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows error toast message when clipboard copy fails', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Permission denied')) },
    });

    render(<TimezoneTool />);

    const copyBtn = screen.getByRole('button', { name: 'Copy Asia/Seoul local time' });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
  });

  it('restores default preset timezones when clicking "Reset Presets"', async () => {
    render(<TimezoneTool />);

    const removeBtn = screen.getByRole('button', { name: 'Remove Asia/Seoul' });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Asia/Seoul' })).not.toBeInTheDocument();
    });

    const resetBtn = screen.getByRole('button', {
      name: 'Reset target timezones to default presets',
    });
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Asia/Seoul' })).toBeInTheDocument();
    });
  });
});