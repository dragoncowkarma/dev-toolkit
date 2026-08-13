import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PunycodeTool from './PunycodeTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PunycodeTool conversion', () => {
  it('encodes Unicode domain to ASCII Punycode in real-time by default', async () => {
    render(<PunycodeTool />);

    const inputArea = screen.getByLabelText('Unicode Domain (IDN)');
    fireEvent.change(inputArea, { target: { value: 'münchen.example.com' } });

    await waitFor(() => {
      expect(screen.getByLabelText('ASCII Domain (Punycode / ACE)')).toHaveValue(
        'xn--mnchen-3ya.example.com',
      );
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('decodes ASCII Punycode domain to Unicode after switching mode', async () => {
    render(<PunycodeTool />);

    fireEvent.click(screen.getByRole('button', { name: /ASCII → Unicode/i }));
    const inputArea = screen.getByLabelText('ASCII Domain (Punycode / ACE)');
    fireEvent.change(inputArea, { target: { value: 'xn--mnchen-3ya.example.com' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Unicode Domain (IDN)')).toHaveValue('münchen.example.com');
    });
  });

  it('displays a non-blocking warning when homograph risk is detected', async () => {
    render(<PunycodeTool />);

    const inputArea = screen.getByLabelText('Unicode Domain (IDN)');
    // 'аpple.com' with Cyrillic 'а'
    fireEvent.change(inputArea, { target: { value: '\u0430pple.com' } });

    await waitFor(() => {
      expect(screen.getByLabelText('ASCII Domain (Punycode / ACE)')).toHaveValue(
        'xn--pple-43d.com',
      );
    });

    const statusAlert = await screen.findByRole('status');
    expect(statusAlert).toHaveTextContent(/Cyrillic, Latin/);
    expect(screen.getByText('⚠ Homograph Risk')).toBeInTheDocument();
  });

  it('displays an error alert for malformed ACE payload', async () => {
    render(<PunycodeTool />);

    fireEvent.click(screen.getByRole('button', { name: /ASCII → Unicode/i }));
    const inputArea = screen.getByLabelText('ASCII Domain (Punycode / ACE)');
    fireEvent.change(inputArea, { target: { value: 'xn--invalid_payload!.com' } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Failed to decode ACE label/i);
    expect(screen.getByLabelText('Unicode Domain (IDN)')).toHaveValue('');
  });
});

describe('PunycodeTool actions', () => {
  it('swaps input and output when Swap button is clicked', async () => {
    render(<PunycodeTool />);

    const inputArea = screen.getByLabelText('Unicode Domain (IDN)');
    fireEvent.change(inputArea, { target: { value: 'münchen.de' } });

    await waitFor(() => {
      expect(screen.getByLabelText('ASCII Domain (Punycode / ACE)')).toHaveValue(
        'xn--mnchen-3ya.de',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /Swap/i }));

    expect(screen.getByLabelText('ASCII Domain (Punycode / ACE)')).toHaveValue(
      'xn--mnchen-3ya.de',
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Unicode Domain (IDN)')).toHaveValue('münchen.de');
    });
  });

  it('resets state when Clear button is clicked', async () => {
    render(<PunycodeTool />);

    const inputArea = screen.getByLabelText('Unicode Domain (IDN)');
    fireEvent.change(inputArea, { target: { value: 'example.com' } });

    await waitFor(() => {
      expect(screen.getByLabelText('ASCII Domain (Punycode / ACE)')).toHaveValue('example.com');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText('Unicode Domain (IDN)')).toHaveValue('');
    expect(screen.getByLabelText('ASCII Domain (Punycode / ACE)')).toHaveValue('');
    expect(screen.queryByText(/Label Breakdown/i)).not.toBeInTheDocument();
  });

  it('copies result to clipboard and shows feedback indicator', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<PunycodeTool />);

    const inputArea = screen.getByLabelText('Unicode Domain (IDN)');
    fireEvent.change(inputArea, { target: { value: 'münchen.de' } });

    await waitFor(() => {
      expect(screen.getByLabelText('ASCII Domain (Punycode / ACE)')).toHaveValue(
        'xn--mnchen-3ya.de',
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(writeText).toHaveBeenCalledWith('xn--mnchen-3ya.de');
    expect(await screen.findByRole('button', { name: '✓ Copied' })).toBeInTheDocument();
  });
});

describe('PunycodeTool label breakdown table', () => {
  it('renders breakdown table with details for each domain label', async () => {
    render(<PunycodeTool />);

    const inputArea = screen.getByLabelText('Unicode Domain (IDN)');
    fireEvent.change(inputArea, { target: { value: 'münchen.example.com' } });

    await waitFor(() => {
      expect(screen.getByText('Label Breakdown & Security Diagnostics')).toBeInTheDocument();
    });

    expect(screen.getAllByText('münchen')[0]).toBeInTheDocument();
    expect(screen.getByText('xn--mnchen-3ya')).toBeInTheDocument();
    expect(screen.getByText('ACE Encoded')).toBeInTheDocument();
    expect(screen.getAllByText('✓ ASCII').length).toBeGreaterThan(0);
  });
});
