import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LeiValidatorTool from './LeiValidatorTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function enterValidLei() {
  fireEvent.change(screen.getByLabelText('Legal Entity Identifier'), {
    target: { value: '529900T8BM49AURSDO55' },
  });
}

describe('LeiValidatorTool', () => {
  it('shows valid and invalid inline validation messages', () => {
    render(<LeiValidatorTool />);

    enterValidLei();
    expect(screen.getByRole('status')).toHaveTextContent('Valid LEI');

    fireEvent.change(screen.getByLabelText('Legal Entity Identifier'), {
      target: { value: '529900T8BM49AURSDO56' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('invalid MOD 97-10');
  });

  it('copies the entered LEI and provides feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<LeiValidatorTool />);

    enterValidLei();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy' })));

    expect(writeText).toHaveBeenCalledWith('529900T8BM49AURSDO55');
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();
  });

  it('resets copy feedback when the input is edited, cleared, or a sample is loaded', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<LeiValidatorTool />);

    enterValidLei();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy' })));
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Legal Entity Identifier'), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy' })));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Valid: Deutsche Bank' }));
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('clears copied feedback and reports a clipboard failure', async () => {
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });
    render(<LeiValidatorTool />);

    enterValidLei();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy' })));
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /copied/i })));
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to copy LEI to clipboard.');
  });
});
