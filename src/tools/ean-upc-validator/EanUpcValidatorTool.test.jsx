import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EanUpcValidatorTool from './EanUpcValidatorTool.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('EanUpcValidatorTool', () => {
  it('renders an accessible barcode input and disabled copy button', () => {
    render(<EanUpcValidatorTool />);

    expect(screen.getByLabelText('Barcode number')).toBeInTheDocument();
    expect(screen.getByLabelText('Interpret as')).toHaveValue('auto');
    expect(screen.getByRole('button', { name: 'Copy GTIN' })).toBeDisabled();
  });

  it('shows a role=alert validation error for malformed input', () => {
    render(<EanUpcValidatorTool />);

    fireEvent.change(screen.getByLabelText('Barcode number'), { target: { value: '4006abcd' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Use digits only');
  });

  it('shows UPC-A validation and its zero-prefixed EAN-13 representation', () => {
    render(<EanUpcValidatorTool />);

    fireEvent.change(screen.getByLabelText('Barcode number'), {
      target: { value: '036000291452' },
    });

    expect(screen.getByText('Check digit is valid.')).toBeInTheDocument();
    expect(screen.getByText(/0036000291452/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy GTIN' })).toBeEnabled();
  });

  it('calculates a missing EAN-13 check digit when explicitly selected', () => {
    render(<EanUpcValidatorTool />);

    fireEvent.change(screen.getByLabelText('Interpret as'), { target: { value: 'ean13' } });
    fireEvent.change(screen.getByLabelText('Barcode number'), {
      target: { value: '400638133393' },
    });

    expect(screen.getByText('Calculated check digit: 1.')).toBeInTheDocument();
    expect(screen.getByText('4006381333931')).toBeInTheDocument();
  });

  it('announces copy confirmation through a polite status region', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<EanUpcValidatorTool />);

    fireEvent.change(screen.getByLabelText('Barcode number'), {
      target: { value: '036000291452' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy GTIN' }));
    });

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveTextContent('GTIN copied to clipboard');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('0036000291452');
  });
});
