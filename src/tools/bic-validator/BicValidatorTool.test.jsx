import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BicValidatorTool from './BicValidatorTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BicValidatorTool', () => {
  it('shows a parsed field breakdown for a valid primary-office BIC', () => {
    render(<BicValidatorTool />);

    fireEvent.change(screen.getByLabelText('BIC / SWIFT code'), {
      target: { value: 'DEUTDEFF' },
    });

    expect(screen.getByText('Valid ISO 9362 BIC/SWIFT code')).toBeInTheDocument();
    expect(screen.getByText('DEUT')).toBeInTheDocument();
    expect(screen.getByText('XXX')).toBeInTheDocument();
    expect(screen.getByLabelText('BIC / SWIFT code')).toHaveAttribute('aria-invalid', 'false');
  });

  it('shows an accessible error only for invalid input', () => {
    render(<BicValidatorTool />);
    const input = screen.getByLabelText('BIC / SWIFT code');

    expect(input).not.toHaveAttribute('aria-describedby');
    fireEvent.change(input, { target: { value: 'DEUTZZFF' } });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'bic-error');
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'bic-error');
  });

  it('copies a valid normalized BIC', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<BicValidatorTool />);

    fireEvent.click(screen.getByRole('button', { name: /Deutsche Bank \(branch 500\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('DEUTDEFF500'));
    expect(screen.getByRole('status', { name: /copied/i })).toBeInTheDocument();
  });
});
