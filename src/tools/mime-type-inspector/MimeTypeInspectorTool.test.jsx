import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MimeTypeInspectorTool from './MimeTypeInspectorTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MimeTypeInspectorTool', () => {
  it('renders correctly and parses default MIME type input', () => {
    render(<MimeTypeInspectorTool />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'MIME Type Inspector' }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Media Type or Content-Type Header Value'),
    ).toHaveValue('text/html; charset=utf-8');
    expect(screen.getAllByText('text/html; charset=utf-8').length).toBeGreaterThan(0);
    expect(screen.getByText('Web Document')).toBeInTheDocument();
    expect(screen.getByText('Known Standard')).toBeInTheDocument();
  });

  it('updates inspection output dynamically when user types', () => {
    render(<MimeTypeInspectorTool />);

    const textarea = screen.getByLabelText('Media Type or Content-Type Header Value');
    fireEvent.change(textarea, { target: { value: 'Content-Type: application/json' } });

    expect(screen.getAllByText('application/json').length).toBeGreaterThan(0);
    expect(screen.getByText('Structured Data')).toBeInTheDocument();
    expect(screen.getByText('Known Standard')).toBeInTheDocument();
  });

  it('displays an accessible role="alert" message when invalid input is entered', () => {
    render(<MimeTypeInspectorTool />);

    const textarea = screen.getByLabelText('Media Type or Content-Type Header Value');
    fireEvent.change(textarea, { target: { value: 'invalid_type_no_slash' } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('missing type/subtype separator "/"');
  });

  it('loads sample presets when clicking preset buttons', () => {
    render(<MimeTypeInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'SVG Image' }));
    expect(screen.getByLabelText('Media Type or Content-Type Header Value')).toHaveValue(
      'image/svg+xml',
    );
    expect(screen.getByText('Vector Image')).toBeInTheDocument();
    expect(screen.getByText('+xml')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Multipart Form' }));
    expect(screen.getAllByText('multipart/form-data').length).toBeGreaterThan(0);
    expect(screen.getByText('---GCB_boundary123')).toBeInTheDocument();
  });

  it('copies canonical value to clipboard with aria-live role="status" feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<MimeTypeInspectorTool />);

    const copyBtn = screen.getByRole('button', { name: 'Copy canonical value' });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeText).toHaveBeenCalledWith('text/html; charset=utf-8');
    expect(screen.getByRole('status')).toHaveTextContent('Copied canonical value to clipboard');
  });

  it('copies JSON representation to clipboard with distinct label and feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<MimeTypeInspectorTool />);

    const copyJsonBtn = screen.getByRole('button', { name: 'Copy JSON representation' });
    await act(async () => {
      fireEvent.click(copyJsonBtn);
    });

    expect(writeText).toHaveBeenCalled();
    const copiedText = writeText.mock.calls[0][0];
    expect(copiedText).toContain('"canonical": "text/html; charset=utf-8"');
    expect(screen.getByRole('status')).toHaveTextContent('Copied JSON representation to clipboard');
  });

  it('clears input when clicking clear button', () => {
    render(<MimeTypeInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear Input' }));
    expect(screen.getByLabelText('Media Type or Content-Type Header Value')).toHaveValue('');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
