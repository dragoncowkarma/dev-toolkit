import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PasswordTool from './PasswordTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function getResults() {
  return within(screen.getByRole('list', { name: 'Generated passwords' })).getAllByRole('listitem');
}

describe('PasswordTool configuration', () => {
  it('uses a default 16-character password and exposes slider and number inputs', () => {
    render(<PasswordTool />);

    expect(getResults()).toHaveLength(1);
    expect(getResults()[0].querySelector('code').textContent).toHaveLength(16);
    expect(screen.getByLabelText('Password length')).toHaveValue(16);
    expect(screen.getByLabelText('Password length slider')).toHaveValue('16');
  });

  it('clamps length and batch size to supported ranges', () => {
    render(<PasswordTool />);

    fireEvent.change(screen.getByLabelText('Password length'), { target: { value: '500' } });
    expect(screen.getByLabelText('Password length')).toHaveValue(128);
    fireEvent.change(screen.getByLabelText('Password length'), { target: { value: '1' } });
    expect(screen.getByLabelText('Password length')).toHaveValue(4);
    fireEvent.change(screen.getByLabelText('Batch size'), { target: { value: '99' } });
    expect(screen.getByLabelText('Batch size')).toHaveValue(20);
  });

  it('blocks regeneration with no selected character sets', () => {
    render(<PasswordTool />);

    ['Lowercase', 'Uppercase', 'Numbers', 'Symbols'].forEach((label) => {
      fireEvent.click(screen.getByLabelText(label));
    });
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Select at least one character set');
    expect(getResults()).toHaveLength(1);
  });

  it('updates the displayed entropy and strength when the configuration changes', () => {
    render(<PasswordTool />);
    const initialEntropy = screen.getByText(/bits of entropy/).textContent;

    fireEvent.change(screen.getByLabelText('Password length'), { target: { value: '4' } });
    fireEvent.click(screen.getByLabelText('Symbols'));

    expect(screen.getByText(/bits of entropy/)).not.toHaveTextContent(initialEntropy);
    expect(screen.getByText('Weak')).toBeInTheDocument();
  });

  it('generates the requested batch using the current settings', () => {
    render(<PasswordTool />);

    fireEvent.change(screen.getByLabelText('Batch size'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Password length'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));

    expect(getResults()).toHaveLength(3);
    getResults().forEach((row) => {
      expect(row.querySelector('code').textContent).toHaveLength(8);
    });
  });
});

describe('PasswordTool copy feedback', () => {
  it('copies a password and announces success in its live region', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<PasswordTool />);
    const firstPassword = getResults()[0].querySelector('code').textContent;

    await act(async () => {
      fireEvent.click(within(getResults()[0]).getByRole('button', { name: 'Copy password 1' }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(firstPassword);
    expect(screen.getByRole('status')).toHaveTextContent('Password 1 copied to clipboard.');
  });

  it('announces clipboard failures in its live region', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<PasswordTool />);

    await act(async () => {
      fireEvent.click(within(getResults()[0]).getByRole('button', { name: 'Copy password 1' }));
      await Promise.resolve();
    });

    expect(screen.getByRole('status')).toHaveTextContent('could not be copied');
  });
});
