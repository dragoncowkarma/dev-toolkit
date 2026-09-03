import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Base62Tool from './Base62Tool.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Base62Tool', () => {
  it('converts decimal input to Base62', async () => {
    render(<Base62Tool />);

    fireEvent.change(screen.getByLabelText('Decimal'), { target: { value: '125' } });

    await waitFor(() => expect(screen.getByLabelText('Base62')).toHaveValue('21'));
  });

  it('shows accessible validation feedback for invalid decimal input', async () => {
    render(<Base62Tool />);

    const input = screen.getByLabelText('Decimal');
    fireEvent.change(input, { target: { value: '-2' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Negative numbers');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'base62-error');
  });

  it('swaps a conversion into the opposite direction', async () => {
    render(<Base62Tool />);

    fireEvent.change(screen.getByLabelText('Decimal'), { target: { value: '62' } });
    await waitFor(() => expect(screen.getByLabelText('Base62')).toHaveValue('10'));
    fireEvent.click(screen.getByRole('button', { name: '⇅ Swap' }));

    await waitFor(() => expect(screen.getByLabelText('Base62')).toHaveValue('10'));
    expect(screen.getByLabelText('Decimal')).toHaveValue('62');
  });

  it('announces successful clipboard feedback in a live region', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<Base62Tool />);

    fireEvent.change(screen.getByLabelText('Decimal'), { target: { value: '62' } });
    await waitFor(() => expect(screen.getByLabelText('Base62')).toHaveValue('10'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy' })));

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard.');
  });

  it('clears both representations', async () => {
    render(<Base62Tool />);

    fireEvent.change(screen.getByLabelText('Decimal'), { target: { value: '62' } });
    await waitFor(() => expect(screen.getByLabelText('Base62')).toHaveValue('10'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText('Decimal')).toHaveValue('');
    expect(screen.getByLabelText('Base62')).toHaveValue('');
  });
});
