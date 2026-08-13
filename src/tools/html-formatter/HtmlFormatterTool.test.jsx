import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HtmlFormatterTool from './HtmlFormatterTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HtmlFormatterTool formatting', () => {
  it('formats HTML with 2-space indentation by default', () => {
    render(<HtmlFormatterTool />);
    fireEvent.change(screen.getByLabelText('HTML input'), {
      target: { value: '<div>\n<p>Hi</p>\n</div>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));

    expect(screen.getByLabelText('Output')).toHaveValue('<div>\n  <p>Hi</p>\n</div>');
  });

  it('reformats using 4-space indentation when the option is changed', () => {
    render(<HtmlFormatterTool />);
    fireEvent.change(screen.getByLabelText('Indentation'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('HTML input'), {
      target: { value: '<div>\n<p>Hi</p>\n</div>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));

    expect(screen.getByLabelText('Output')).toHaveValue('<div>\n    <p>Hi</p>\n</div>');
  });

  it('reformats using tab indentation when the option is changed', () => {
    render(<HtmlFormatterTool />);
    fireEvent.change(screen.getByLabelText('Indentation'), { target: { value: 'tab' } });
    fireEvent.change(screen.getByLabelText('HTML input'), {
      target: { value: '<div>\n<p>Hi</p>\n</div>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));

    expect(screen.getByLabelText('Output')).toHaveValue('<div>\n\t<p>Hi</p>\n</div>');
  });

  it('shows a success status after formatting', async () => {
    render(<HtmlFormatterTool />);
    fireEvent.change(screen.getByLabelText('HTML input'), { target: { value: '<p>Hi</p>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Formatted.');
  });
});

describe('HtmlFormatterTool minification', () => {
  it('minifies HTML by removing insignificant whitespace between tags', () => {
    render(<HtmlFormatterTool />);
    fireEvent.change(screen.getByLabelText('HTML input'), {
      target: { value: '<div>\n  <p>Hi</p>\n</div>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Minify' }));

    expect(screen.getByLabelText('Output')).toHaveValue('<div><p>Hi</p></div>');
  });

  it('shows a success status after minifying', async () => {
    render(<HtmlFormatterTool />);
    fireEvent.change(screen.getByLabelText('HTML input'), { target: { value: '<p>Hi</p>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Minify' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Minified.');
  });
});

describe('HtmlFormatterTool sample and clear actions', () => {
  it('loads a sample document into the input', async () => {
    render(<HtmlFormatterTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));

    expect(screen.getByLabelText('HTML input').value).toContain('<!DOCTYPE html>');
    expect(await screen.findByRole('status')).toHaveTextContent('Sample loaded.');
  });

  it('clears both panels and reports feedback', async () => {
    render(<HtmlFormatterTool />);
    fireEvent.change(screen.getByLabelText('HTML input'), { target: { value: '<p>Hi</p>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText('HTML input')).toHaveValue('');
    expect(screen.getByLabelText('Output')).toHaveValue('');
    expect(await screen.findByRole('status')).toHaveTextContent('Cleared.');
  });
});

describe('HtmlFormatterTool copy feedback', () => {
  it('copies output and reports success feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<HtmlFormatterTool />);
    fireEvent.change(screen.getByLabelText('HTML input'), { target: { value: '<p>Hi</p>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy output to clipboard' }));
    });

    expect(writeText).toHaveBeenCalledWith('<p>Hi</p>');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard.');
  });

  it('reports failure feedback when copying fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });
    render(<HtmlFormatterTool />);
    fireEvent.change(screen.getByLabelText('HTML input'), { target: { value: '<p>Hi</p>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy output to clipboard' }));
    });

    expect(await screen.findByRole('status')).toHaveTextContent('Unable to copy to clipboard.');
  });

  it('disables the copy button until there is output', () => {
    render(<HtmlFormatterTool />);
    expect(screen.getByRole('button', { name: 'Copy output to clipboard' })).toBeDisabled();
  });
});

describe('HtmlFormatterTool accessible error region', () => {
  it('reports a structured, accessible error for malformed input', async () => {
    render(<HtmlFormatterTool />);
    fireEvent.change(screen.getByLabelText('HTML input'), {
      target: { value: '<div class="unterminated>text</div>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('HTML input is invalid.');
    expect(alert).toHaveTextContent('Unterminated quoted attribute value for "class"');
  });

  it('clears a previous error once the input changes', async () => {
    render(<HtmlFormatterTool />);
    fireEvent.change(screen.getByLabelText('HTML input'), {
      target: { value: '<!-- unterminated' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    await screen.findByRole('alert');

    fireEvent.change(screen.getByLabelText('HTML input'), { target: { value: '<p>Hi</p>' } });

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

describe('HtmlFormatterTool disabled states', () => {
  it('disables Format and Minify until input is present', () => {
    render(<HtmlFormatterTool />);
    expect(screen.getByRole('button', { name: 'Format' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Minify' })).toBeDisabled();
  });
});
