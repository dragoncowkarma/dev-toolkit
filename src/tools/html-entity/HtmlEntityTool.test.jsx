import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HtmlEntityTool from './HtmlEntityTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HtmlEntityTool conversion', () => {
  it('encodes reserved characters in real time with named entities', async () => {
    render(<HtmlEntityTool />);
    fireEvent.change(screen.getByLabelText('Plain text'), { target: { value: '<&🚀' } });

    await waitFor(() =>
      expect(screen.getByLabelText('HTML entities')).toHaveValue('&lt;&amp;🚀')
    );
  });

  it('encodes every character in the selected numeric format', async () => {
    render(<HtmlEntityTool />);
    fireEvent.change(screen.getByLabelText('Entity format'), {
      target: { value: 'hex' },
    });
    fireEvent.change(screen.getByLabelText('Character scope'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Plain text'), { target: { value: 'A🚀' } });

    await waitFor(() =>
      expect(screen.getByLabelText('HTML entities')).toHaveValue('&#x41;&#x1f680;')
    );
  });

  it('decodes entities after switching direction', async () => {
    render(<HtmlEntityTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.change(screen.getByLabelText('HTML entities'), {
      target: { value: '&lt;안녕&#x1f680;' },
    });

    await waitFor(() => expect(screen.getByLabelText('Plain text')).toHaveValue('<안녕🚀'));
  });
});

describe('HtmlEntityTool actions', () => {
  it('clears both panels and reports feedback', async () => {
    render(<HtmlEntityTool />);
    fireEvent.change(screen.getByLabelText('Plain text'), { target: { value: '<' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText('Plain text')).toHaveValue('');
    expect(screen.getByLabelText('HTML entities')).toHaveValue('');
    expect(await screen.findByRole('status')).toHaveTextContent('Cleared.');
  });

  it('copies output and reports success feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<HtmlEntityTool />);
    fireEvent.change(screen.getByLabelText('Plain text'), { target: { value: '<' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(writeText).toHaveBeenCalledWith('&lt;');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard.');
  });
});
