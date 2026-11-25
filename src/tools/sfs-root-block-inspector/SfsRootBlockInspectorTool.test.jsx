import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SfsRootBlockInspectorTool from './SfsRootBlockInspectorTool.jsx';
import * as sfsUtils from './sfs-root-block.utils.js';
import { createSfsRootBlockBuffer } from './sfs-root-block.utils.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

    expect(screen.getByTestId('field-id')).toHaveTextContent(/ROOT/);
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

    expect(screen.getByRole('alert')).toHaveTextContent(/Unknown root block identifier/i);
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

  describe('stale file-read handling', () => {
    it('ignores delayed file-read completion after Clear is clicked', async () => {
      let resolveDelayed;
      const delayedPromise = new Promise((resolve) => {
        resolveDelayed = resolve;
      });

      vi.spyOn(sfsUtils, 'readRootBlockFromBlob').mockImplementation(() => delayedPromise);

      render(<SfsRootBlockInspectorTool />);

      const file = new File(['mock content'], 'delayed.img', { type: 'application/octet-stream' });
      const fileInput = screen.getByLabelText('Select SFS Image');
      fireEvent.change(fileInput, { target: { files: [file] } });

      // Processing state active
      expect(screen.getByText('Processing root block...')).toBeInTheDocument();

      // User clicks Clear while file is still being read
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

      expect(screen.getByText(/No SFS image loaded\./i)).toBeInTheDocument();
      expect(screen.queryByText('Processing root block...')).not.toBeInTheDocument();

      // Later, the delayed read finishes
      const mockResult = sfsUtils.parseSfsRootBlock(createSfsRootBlockBuffer());
      resolveDelayed(mockResult);
      await delayedPromise;

      // The cleared state must be preserved and not overwritten
      expect(screen.queryByTestId('checksum-badge')).not.toBeInTheDocument();
      expect(screen.getByText(/No SFS image loaded\./i)).toBeInTheDocument();
    });

    it('ignores delayed file-read completion after a sample is loaded', async () => {
      let resolveDelayed;
      const delayedPromise = new Promise((resolve) => {
        resolveDelayed = resolve;
      });

      vi.spyOn(sfsUtils, 'readRootBlockFromBlob').mockImplementation(() => delayedPromise);

      render(<SfsRootBlockInspectorTool />);

      const file = new File(['mock content'], 'slow.img', { type: 'application/octet-stream' });
      const fileInput = screen.getByLabelText('Select SFS Image');
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByText('Processing root block...')).toBeInTheDocument();

      // User selects sample valid SFS before read finishes
      fireEvent.click(screen.getByRole('button', { name: /Load Sample Valid SFS/i }));

      expect(screen.getByText(/sample_valid_sfs\.img/)).toBeInTheDocument();

      // Later, the delayed file read finishes with a corrupted checksum result
      const mockCorruptResult = sfsUtils.parseSfsRootBlock(
        createSfsRootBlockBuffer({ corruptChecksum: true })
      );
      resolveDelayed(mockCorruptResult);
      await delayedPromise;

      // The sample must still be displayed and not overwritten by the delayed read
      expect(screen.getByText(/sample_valid_sfs\.img/)).toBeInTheDocument();
      expect(screen.getByTestId('checksum-badge')).toHaveTextContent('Valid');
      expect(screen.queryByText(/slow\.img/)).not.toBeInTheDocument();
    });

    it('ignores delayed earlier file-read completion when a second file completes earlier', async () => {
      let resolveFirst;
      const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      const secondResult = sfsUtils.parseSfsRootBlock(
        createSfsRootBlockBuffer({ totalBlocks: 9999 })
      );

      vi.spyOn(sfsUtils, 'readRootBlockFromBlob').mockImplementation((blob) => {
        if (blob.name === 'first_slow.img') {
          return firstPromise;
        }
        return Promise.resolve(secondResult);
      });

      render(<SfsRootBlockInspectorTool />);

      const fileInput = screen.getByLabelText('Select SFS Image');

      // Select first slow file
      const file1 = new File(['1'], 'first_slow.img', { type: 'application/octet-stream' });
      fireEvent.change(fileInput, { target: { files: [file1] } });

      // Immediately select second fast file
      const file2 = new File(['2'], 'second_fast.img', { type: 'application/octet-stream' });
      fireEvent.change(fileInput, { target: { files: [file2] } });

      // Second file resolves immediately
      await waitFor(() => {
        expect(screen.getByText(/second_fast\.img/)).toBeInTheDocument();
        expect(screen.getByTestId('field-total-blocks')).toHaveTextContent('9,999');
      });

      // Now first slow file finishes with a different block count
      const firstResult = sfsUtils.parseSfsRootBlock(
        createSfsRootBlockBuffer({ totalBlocks: 1111 })
      );
      resolveFirst(firstResult);
      await firstPromise;

      // Ensure second file's result remains displayed
      expect(screen.getByText(/second_fast\.img/)).toBeInTheDocument();
      expect(screen.getByTestId('field-total-blocks')).toHaveTextContent('9,999');
      expect(screen.queryByText(/first_slow\.img/)).not.toBeInTheDocument();
    });
  });
});
