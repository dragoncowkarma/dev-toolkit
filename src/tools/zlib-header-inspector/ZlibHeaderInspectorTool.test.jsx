import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ZlibHeaderInspectorTool from './ZlibHeaderInspectorTool.jsx';

afterEach(() => {
  cleanup();
});

describe('ZlibHeaderInspectorTool component', () => {
  it('renders initial default header (78 9C) inspection results', () => {
    render(<ZlibHeaderInspectorTool />);

    expect(screen.getByRole('heading', { name: /Zlib Header Inspector/i })).toBeInTheDocument();
    expect(screen.getByText('deflate')).toBeInTheDocument();
    expect(screen.getByText(/32,768 B \(32 KB\)/)).toBeInTheDocument();
    expect(screen.getByText('default')).toBeInTheDocument();
    expect(screen.getByText(/Valid \(✓\)/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('updates inspection when user selects a sample button', () => {
    render(<ZlibHeaderInspectorTool />);

    const maxCompBtn = screen.getByRole('button', { name: /Maximum Compression/i });
    fireEvent.click(maxCompBtn);

    expect(screen.getByText('maximum')).toBeInTheDocument();
    expect(screen.getByText('deflate')).toBeInTheDocument();
  });

  it('displays alert on bad FCHECK', () => {
    render(<ZlibHeaderInspectorTool />);

    const textarea = screen.getByLabelText(/Zlib Stream Hex Bytes/i);
    fireEvent.change(textarea, { target: { value: '78 9D' } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Invalid FCHECK/i);
  });

  it('displays alert on invalid hex characters', () => {
    render(<ZlibHeaderInspectorTool />);

    const textarea = screen.getByLabelText(/Zlib Stream Hex Bytes/i);
    fireEvent.change(textarea, { target: { value: '78 ZZ' } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/invalid hexadecimal/i);
  });

  it('displays alert on truncated buffer', () => {
    render(<ZlibHeaderInspectorTool />);

    const textarea = screen.getByLabelText(/Zlib Stream Hex Bytes/i);
    fireEvent.change(textarea, { target: { value: '78' } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Truncated buffer/i);
  });

  it('renders hex dump with copy button for parsed stream', () => {
    render(<ZlibHeaderInspectorTool />);

    expect(screen.getByRole('region', { name: /Raw Hex Dump View/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Hex Dump/i })).toBeInTheDocument();
  });
});
