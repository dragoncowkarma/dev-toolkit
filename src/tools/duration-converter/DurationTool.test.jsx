import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DurationTool from './DurationTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DurationTool', () => {
  it('renders parsed values, exact clock output, and a month approximation notice', () => {
    render(<DurationTool />);
    fireEvent.change(screen.getByLabelText('ISO 8601 duration'), {
      target: { value: 'P1M' },
    });

    expect(screen.getByLabelText('Canonical ISO 8601')).toHaveTextContent('P1M');
    expect(screen.getByLabelText('Total seconds')).toHaveTextContent('2592000');
    expect(screen.getByText(/calendar approximations/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('ISO 8601 duration'), {
      target: { value: 'P3DT4H5M6S' },
    });
    expect(screen.getByLabelText('Human-readable breakdown')).toHaveTextContent(
      '3 days, 4 hours, 5 minutes, 6 seconds',
    );
    expect(screen.getByLabelText('Clock form')).toHaveTextContent('76:05:06');
    expect(screen.queryByText(/calendar approximations/i)).not.toBeInTheDocument();
  });

  it('reports invalid ISO input through an accessible alert', () => {
    render(<DurationTool />);
    fireEvent.change(screen.getByLabelText('ISO 8601 duration'), { target: { value: 'PT1M1H' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/canonical order/i);
    expect(screen.getByLabelText('ISO 8601 duration')).toHaveAttribute('aria-invalid', 'true');
  });

  it('builds a duration from seconds and components', () => {
    render(<DurationTool />);
    fireEvent.change(screen.getByLabelText('Convert total seconds'), { target: { value: '5400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Build ISO' }));
    expect(screen.getByLabelText('Canonical ISO 8601')).toHaveTextContent('PT1H30M');

    fireEvent.change(screen.getByLabelText('Days'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Build from components' }));
    expect(screen.getByLabelText('Canonical ISO 8601')).toHaveTextContent('P2DT3H');
  });

  it('announces successful copies in a polite live region', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DurationTool />);
    fireEvent.change(screen.getByLabelText('ISO 8601 duration'), { target: { value: 'PT1H' } });

    await act(async () => fireEvent.click(screen.getByRole('button', {
      name: 'Copy Canonical ISO 8601',
    })));
    expect(writeText).toHaveBeenCalledWith('PT1H');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});
