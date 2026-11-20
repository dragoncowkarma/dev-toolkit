import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SedolValidatorTool from './SedolValidatorTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SedolValidatorTool', () => {
  it('reports an invalid character through the input description', () => {
    render(<SedolValidatorTool />);

    const input = screen.getByLabelText('SEDOL');
    fireEvent.change(input, { target: { value: 'A263494' } });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'sedol-error');
    expect(screen.getByRole('alert')).toHaveTextContent('uppercase consonants');
  });

  it('announces a valid SEDOL and copies it', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<SedolValidatorTool />);

    fireEvent.change(screen.getByLabelText('SEDOL'), { target: { value: '0263494' } });
    expect(screen.getByRole('status')).toHaveTextContent('Valid SEDOL.');

    fireEvent.click(screen.getByRole('button', { name: 'Copy SEDOL' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('SEDOL copied to clipboard.')
    );
  });
});
