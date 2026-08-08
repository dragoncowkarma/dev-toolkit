import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CurlConverterTool from './CurlConverterTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CurlConverterTool', () => {
  it('renders generated fetch code for the default sample command', () => {
    render(<CurlConverterTool />);
    expect(screen.getByLabelText('Generated code output').textContent)
      .toContain('await fetch(');
    expect(screen.getByLabelText('Generated code output').textContent)
      .toContain('POST');
  });

  it('updates the generated code as the cURL input changes', () => {
    render(<CurlConverterTool />);
    fireEvent.change(screen.getByLabelText('cURL command'), {
      target: { value: 'curl https://example.com/ping' },
    });
    const output = screen.getByLabelText('Generated code output').textContent;
    expect(output).toContain('https://example.com/ping');
    expect(output).toContain('GET');
  });

  it('shows an alert with a validation message for unparseable input', () => {
    render(<CurlConverterTool />);
    fireEvent.change(screen.getByLabelText('cURL command'), {
      target: { value: 'wget https://example.com' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('must start with "curl"');
  });

  it('shows an empty-state hint when the input is cleared', () => {
    render(<CurlConverterTool />);
    fireEvent.change(screen.getByLabelText('cURL command'), { target: { value: '' } });
    expect(screen.getByText('Paste a cURL command to generate request code.'))
      .toBeInTheDocument();
  });

  it('switches target language when a language tab is clicked', () => {
    render(<CurlConverterTool />);

    fireEvent.click(screen.getByRole('tab', { name: 'Axios' }));
    expect(screen.getByLabelText('Generated code output').textContent)
      .toContain('axios.request(');
    expect(screen.getByRole('tab', { name: 'Axios' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Node.js' }));
    expect(screen.getByLabelText('Generated code output').textContent)
      .toContain('require("https")');
  });

  it('loads a preset sample command from the sample selector', () => {
    render(<CurlConverterTool />);
    fireEvent.change(screen.getByLabelText('Load sample cURL command'), {
      target: { value: 'Bearer token auth' },
    });
    expect(screen.getByLabelText('cURL command').value).toContain('Authorization: Bearer');
  });

  it('copies the generated code and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CurlConverterTool />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy generated code to clipboard' }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('await fetch(');
    expect(screen.getByRole('status')).toHaveTextContent('Copied code to clipboard.');
  });

  it('reports clipboard failures as alerts', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<CurlConverterTool />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy generated code to clipboard' }));
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to copy code to clipboard.');
  });

  it('disables the copy button while input is invalid', () => {
    render(<CurlConverterTool />);
    fireEvent.change(screen.getByLabelText('cURL command'), {
      target: { value: 'wget https://example.com' },
    });
    expect(screen.getByRole('button', { name: 'Copy generated code to clipboard' })).toBeDisabled();
  });
});
