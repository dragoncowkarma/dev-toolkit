import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IMEIValidatorTool from './IMEIValidatorTool.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('IMEIValidatorTool', () => {
  it('renders decoded fields and the calculated full IMEI for 14 digits', () => {
    render(<IMEIValidatorTool />);

    fireEvent.change(screen.getByLabelText('IMEI or IMEISV'), {
      target: { value: '49015420-323751' },
    });

    expect(
      screen.getByRole('heading', { name: 'IMEI check digit calculated' })
    ).toBeInTheDocument();
    expect(screen.getByText('49015420')).toBeInTheDocument();
    expect(screen.getByText('323751')).toBeInTheDocument();
    expect(screen.getByText('Full valid IMEI:')).toBeInTheDocument();
    expect(screen.getByText('490154203237518')).toBeInTheDocument();
  });

  it('shows an accessible inline error for an invalid IMEI check digit', () => {
    render(<IMEIValidatorTool />);

    fireEvent.change(screen.getByLabelText('IMEI or IMEISV'), {
      target: { value: '490154203237519' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('The IMEI check digit is invalid');
    expect(screen.queryByText('Full valid IMEI:')).not.toBeInTheDocument();
  });

  it('renders the IMEISV software version number without a check digit', () => {
    render(<IMEIValidatorTool />);

    fireEvent.change(screen.getByLabelText('IMEI or IMEISV'), {
      target: { value: '49015420 323751 01' },
    });

    expect(screen.getByRole('heading', { name: 'Valid IMEISV' })).toBeInTheDocument();
    expect(screen.getByText('Software Version Number')).toBeInTheDocument();
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.queryByText('Check Digit')).not.toBeInTheDocument();
  });

  it('announces copy feedback in a polite live region', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<IMEIValidatorTool />);

    fireEvent.change(screen.getByLabelText('IMEI or IMEISV'), {
      target: { value: '490154203237518' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy IMEI' }));
    });

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('490154203237518 copied to clipboard');
  });
});
