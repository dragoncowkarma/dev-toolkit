import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AbaRoutingValidatorTool from './AbaRoutingValidatorTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AbaRoutingValidatorTool', () => {
  it('shows live accessible validation feedback', () => {
    render(<AbaRoutingValidatorTool />);

    const input = screen.getByLabelText('ABA routing number');
    expect(input).not.toHaveAttribute('aria-describedby');
    fireEvent.change(input, { target: { value: '021000022' } });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'aba-routing-feedback');
    expect(screen.getByRole('alert')).toHaveTextContent('checksum is invalid');

    fireEvent.change(input, { target: { value: '021000021' } });

    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(screen.getByRole('status')).toHaveTextContent('valid ABA routing number');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
  });

  it('copies a valid routing number and announces the result', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AbaRoutingValidatorTool />);

    fireEvent.change(screen.getByLabelText('ABA routing number'), {
      target: { value: '021000021' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('021000021'));
    expect(await screen.findByText('Routing number copied to clipboard.')).toHaveAttribute(
      'role',
      'status'
    );
  });
});
