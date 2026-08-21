import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TimestampTool from './TimestampTool.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TimestampTool real-time conversion', () => {
  it('converts Unix timestamp in seconds to ISO, UTC, Local, and Relative time', async () => {
    render(<TimestampTool />);

    const inputEl = screen.getByLabelText('Unix Timestamp or Date String');
    fireEvent.change(inputEl, { target: { value: '1785412800' } }); // 2026-07-30T12:00:00.000Z

    await waitFor(() => {
      expect(screen.getByLabelText('ISO 8601')).toHaveValue('2026-07-30T12:00:00.000Z');
      expect(screen.getByLabelText('UTC Time')).toHaveValue('Thu, 30 Jul 2026 12:00:00 GMT');
      expect(screen.getByLabelText('Unix Timestamp (Seconds)')).toHaveValue('1785412800');
      expect(screen.getByLabelText('Unix Timestamp (Milliseconds)')).toHaveValue('1785412800000');
    });

    expect(screen.getByRole('status')).toHaveTextContent('Detected: Unix Timestamp (seconds)');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('converts Unix timestamp in milliseconds auto-detected', async () => {
    render(<TimestampTool />);

    const inputEl = screen.getByLabelText('Unix Timestamp or Date String');
    fireEvent.change(inputEl, { target: { value: '1785412800000' } });

    await waitFor(() => {
      expect(screen.getByLabelText('ISO 8601')).toHaveValue('2026-07-30T12:00:00.000Z');
      expect(screen.getByLabelText('Unix Timestamp (Seconds)')).toHaveValue('1785412800');
    });

    expect(screen.getByRole('status')).toHaveTextContent('Detected: Unix Timestamp (milliseconds)');
  });

  it('converts Date/Time string to Unix timestamps and ISO/UTC formats', async () => {
    render(<TimestampTool />);

    const inputEl = screen.getByLabelText('Unix Timestamp or Date String');
    fireEvent.change(inputEl, { target: { value: '2026-07-30T12:00:00.000Z' } });

    await waitFor(() => {
      expect(screen.getByLabelText('ISO 8601')).toHaveValue('2026-07-30T12:00:00.000Z');
      expect(screen.getByLabelText('Unix Timestamp (Seconds)')).toHaveValue('1785412800');
      expect(screen.getByLabelText('Unix Timestamp (Milliseconds)')).toHaveValue('1785412800000');
    });

    expect(screen.getByRole('status')).toHaveTextContent('Detected: Date String');
  });

  it('displays user-friendly error message on invalid input', async () => {
    render(<TimestampTool />);

    const inputEl = screen.getByLabelText('Unix Timestamp or Date String');
    fireEvent.change(inputEl, { target: { value: 'invalid-date-string' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/Invalid/);
  });
});

describe('TimestampTool actions', () => {
  it('populates current timestamp when clicking "Now"', async () => {
    const mockNow = 1785412800000;
    vi.spyOn(Date, 'now').mockReturnValue(mockNow);

    render(<TimestampTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Now' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Unix Timestamp or Date String')).toHaveValue('1785412800');
      expect(screen.getByLabelText('Unix Timestamp (Seconds)')).toHaveValue('1785412800');
    });
  });

  it('populates current timestamp in milliseconds when unitMode is forced ' +
    'to Milliseconds', async () => {
    const mockNow = 1785412800000;
    vi.spyOn(Date, 'now').mockReturnValue(mockNow);

    render(<TimestampTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Milliseconds (ms)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Now' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Unix Timestamp or Date String')).toHaveValue('1785412800000');
      expect(screen.getByLabelText('ISO 8601')).toHaveValue('2026-07-30T12:00:00.000Z');
      expect(screen.getByLabelText('Unix Timestamp (Milliseconds)')).toHaveValue('1785412800000');
    });
  });

  it('clears input and output fields when clicking "Clear"', async () => {
    render(<TimestampTool />);

    const inputEl = screen.getByLabelText('Unix Timestamp or Date String');
    fireEvent.change(inputEl, { target: { value: '1785412800' } });

    await waitFor(() => {
      expect(screen.getByLabelText('ISO 8601')).toHaveValue('2026-07-30T12:00:00.000Z');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(inputEl).toHaveValue('');
    expect(screen.getByLabelText('ISO 8601')).toHaveValue('');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('allows forced unit mode switching', async () => {
    render(<TimestampTool />);

    const inputEl = screen.getByLabelText('Unix Timestamp or Date String');
    fireEvent.change(inputEl, { target: { value: '1785412800' } });

    fireEvent.click(screen.getByRole('button', { name: 'Milliseconds (ms)' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Unix Timestamp (Milliseconds)')).toHaveValue('1785412800');
    });
  });
});

describe('TimestampTool clipboard copy', () => {
  it('copies individual field to clipboard on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<TimestampTool />);

    fireEvent.change(screen.getByLabelText('Unix Timestamp or Date String'), {
      target: { value: '1785412800' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('ISO 8601')).toHaveValue('2026-07-30T12:00:00.000Z');
    });

    const copyBtn = screen.getByRole('button', { name: 'Copy ISO 8601' });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeText).toHaveBeenCalledWith('2026-07-30T12:00:00.000Z');
    expect(await screen.findByRole('button', { name: 'ISO 8601 copied' })).toBeInTheDocument();
  });

  it('dismisses copied feedback after 1500 ms while mounted', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<TimestampTool />);
    fireEvent.change(screen.getByLabelText('Unix Timestamp or Date String'), {
      target: { value: '1785412800' },
    });
    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy ISO 8601' }));
    });
    expect(screen.getByRole('button', { name: 'ISO 8601 copied' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('button', { name: 'Copy ISO 8601' })).toBeInTheDocument();
  });

  it('resets the copied feedback dismissal timer for consecutive copies', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<TimestampTool />);
    fireEvent.change(screen.getByLabelText('Unix Timestamp or Date String'), {
      target: { value: '1785412800' },
    });
    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy ISO 8601' }));
    });
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'ISO 8601 copied' }));
    });
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole('button', { name: 'ISO 8601 copied' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('button', { name: 'Copy ISO 8601' })).toBeInTheDocument();
  });

  it('clears the pending copied feedback timeout on unmount', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<TimestampTool />);
    fireEvent.change(screen.getByLabelText('Unix Timestamp or Date String'), {
      target: { value: '1785412800' },
    });
    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy ISO 8601' }));
    });
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('reports copy failure in alert box when clipboard access is rejected', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<TimestampTool />);

    fireEvent.change(screen.getByLabelText('Unix Timestamp or Date String'), {
      target: { value: '1785412800' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('ISO 8601')).toHaveValue('2026-07-30T12:00:00.000Z');
    });

    const copyBtn = screen.getByRole('button', { name: 'Copy ISO 8601' });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
  });
});