import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CusipValidatorTool from './CusipValidatorTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CusipValidatorTool', () => {
  it('reports a valid CUSIP in a status region and enables copying', () => {
    render(<CusipValidatorTool />);

    fireEvent.change(screen.getByLabelText('CUSIP'), { target: { value: '037833100' } });

    expect(screen.getByRole('status')).toHaveTextContent('Valid CUSIP.');
    expect(screen.getByRole('button', { name: 'Copy' })).not.toBeDisabled();
    expect(screen.getByLabelText('CUSIP')).toHaveAttribute('aria-invalid', 'false');
  });

  it('connects classified errors to the input', () => {
    render(<CusipValidatorTool />);

    fireEvent.change(screen.getByLabelText('CUSIP'), { target: { value: '037833101' } });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('checksum digit does not match');
    expect(screen.getByLabelText('CUSIP')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('CUSIP')).toHaveAttribute('aria-describedby', alert.id);
  });

  it('does not mark a valid input invalid when copying fails', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<CusipValidatorTool />);
    fireEvent.change(screen.getByLabelText('CUSIP'), { target: { value: '037833100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await screen.findByRole('alert');
    expect(screen.getByLabelText('CUSIP')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('CUSIP')).not.toHaveAttribute('aria-describedby');
  });

  it('announces a successful copy', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<CusipValidatorTool />);
    fireEvent.change(screen.getByLabelText('CUSIP'), { target: { value: '037833100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByRole('status')).toHaveTextContent('CUSIP copied to clipboard.');
  });
});
