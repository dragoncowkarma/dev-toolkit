import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CronTool from './CronTool.jsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('CronTool', () => {
  it('shows a default explanation and five future executions', () => {
    render(<CronTool />);
    expect(screen.getByText('Every 5 minutes')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Next cron executions' })).getAllByRole('listitem')).toHaveLength(5);
  });

  it('updates the explanation when a preset is selected', () => {
    render(<CronTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Monday 9 AM' }));
    expect(screen.getByLabelText('Cron expression')).toHaveValue('0 9 * * 1');
    expect(screen.getByText('Every Monday at 09:00')).toBeInTheDocument();
  });

  it('reports validation errors for invalid input', () => {
    render(<CronTool />);
    fireEvent.change(screen.getByLabelText('Cron expression'), { target: { value: '60 * * * *' } });
    expect(screen.getByRole('alert')).toHaveTextContent('between 0 and 59');
  });

  it('copies an expression', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CronTool />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy expression' })); await Promise.resolve(); });
    expect(writeText).toHaveBeenCalledWith('*/5 * * * *');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard.');
  });

  it('reports clipboard failures', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<CronTool />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy description' })); await Promise.resolve(); });
    expect(screen.getByRole('status')).toHaveTextContent('Failed to copy');
  });
});
