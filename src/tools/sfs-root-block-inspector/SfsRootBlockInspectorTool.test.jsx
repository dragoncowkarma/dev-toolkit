import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SfsRootBlockInspectorTool from './SfsRootBlockInspectorTool.jsx';
import { createSfsRootBlockBuffer } from './sfs-root-block.utils.js';

afterEach(() => {
  cleanup();
});

describe('SfsRootBlockInspectorTool', () => {
  it('renders the tool with empty state initially', () => {
    render(<SfsRootBlockInspectorTool />);

    expect(screen.getByText('Amiga SFS Root Block Inspector')).toBeInTheDocument();
    expect(
      screen.getByText(/No SFS image loaded\./i)
    ).toBeInTheDocument();
  });

  it('loads and inspects a sample valid SFS root block', async () => {
    render(<SfsRootBlockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: /Load Sample Valid SFS/i }));

    await waitFor(() => {
      const badge = screen.getByTestId('checksum-badge');
      expect(badge).toHaveTextContent('Valid');
      expect(badge).toHaveClass('status-badge--valid');
    });

    expect(screen.getByTestId('field-id')).toHaveTextContent(/SFS\\0/);
    expect(screen.getByTestId('field-block-size')).toHaveTextContent(/512 B/);
    expect(screen.getByTestId('field-total-blocks')).toHaveTextContent(/8,192/);
    expect(screen.getByTestId('field-version')).toHaveTextContent('1');
    expect(screen.getByTestId('field-seq')).toHaveTextContent('1');
    expect(screen.getByTestId('field-bitmap')).toHaveTextContent('Block #1');
    expect(screen.getByTestId('field-admin')).toHaveTextContent('Block #2');
    expect(screen.getByTestId('field-root-obj')).toHaveTextContent('Block #3');
    expect(screen.getByTestId('field-extent')).toHaveTextContent('Block #4');
  });

  it('displays Invalid status when bad checksum sample is loaded', async () => {
    render(<SfsRootBlockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: /Sample Bad Checksum/i }));

    await waitFor(() => {
      const badge = screen.getByTestId('checksum-badge');
      expect(badge).toHaveTextContent('Invalid');
      expect(badge).toHaveClass('status-badge--invalid');
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/Checksum mismatch/i);
  });

  it('displays Unknown status when wrong magic sample is loaded', async () => {
    render(<SfsRootBlockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: /Sample Wrong Magic/i }));

    await waitFor(() => {
      const badge = screen.getByTestId('checksum-badge');
      expect(badge).toHaveTextContent('Unknown');
      expect(badge).toHaveClass('status-badge--unknown');
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/Unknown magic identifier/i);
  });

  it('displays Unknown status when truncated sample is loaded', async () => {
    render(<SfsRootBlockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: /Sample Truncated/i }));

    await waitFor(() => {
      const badge = screen.getByTestId('checksum-badge');
      expect(badge).toHaveTextContent('Unknown');
      expect(badge).toHaveClass('status-badge--unknown');
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/Truncated input/i);
  });

  it('handles user file upload via file input', async () => {
    render(<SfsRootBlockInspectorTool />);

    const buffer = createSfsRootBlockBuffer({
      blockSize: 512,
      totalBlocks: 2048,
    });
    const file = new File([buffer], 'custom.sfs', { type: 'application/octet-stream' });

    const fileInput = screen.getByLabelText('Select SFS Image');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('checksum-badge')).toHaveTextContent('Valid');
    });

    expect(screen.getByText(/custom\.sfs/)).toBeInTheDocument();
  });

  it('clears inspected data when Clear button is clicked', async () => {
    render(<SfsRootBlockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: /Load Sample Valid SFS/i }));

    await waitFor(() => {
      expect(screen.getByTestId('checksum-badge')).toHaveTextContent('Valid');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.queryByTestId('checksum-badge')).not.toBeInTheDocument();
    expect(
      screen.getByText(/No SFS image loaded\./i)
    ).toBeInTheDocument();
  });
});
