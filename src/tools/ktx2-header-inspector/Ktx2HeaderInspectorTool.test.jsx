import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Ktx2HeaderInspectorTool from './Ktx2HeaderInspectorTool.jsx';
import meta from './meta.js';
import * as ktx2Utils from './ktx2.utils.js';
import { createKtx2Buffer } from './ktx2.utils.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Ktx2HeaderInspectorTool Component', () => {
  it('renders initial state with title, toolbar, and dropzone', () => {
    render(<Ktx2HeaderInspectorTool />);

    expect(screen.getByRole('heading', { level: 2, name: /KTX2 Header Inspector/i })).toBeDefined();
    expect(screen.getByText(/Choose KTX2 File/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Load Sample/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Clear/i })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Drop KTX2 file here or click to browse/i }),
    ).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('loads and displays sample texture data when clicking Load Sample', async () => {
    render(<Ktx2HeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: /Load Sample/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeDefined();
    });

    expect(screen.getByText(/Loaded and parsed sample_texture\.ktx2/i)).toBeDefined();
    expect(screen.getByText(/Header Overview & Format/i)).toBeDefined();
    expect(screen.getByText(/1024 × 1024 × 1/i)).toBeDefined();
    expect(screen.getByText(/R8G8B8A8_UNORM/i)).toBeDefined();
    expect(screen.getByText(/BasisLZ/i)).toBeDefined();
    expect(screen.getByText(/Mipmap Level Index/i)).toBeDefined();

    const clearBtn = screen.getByRole('button', { name: /Clear/i });
    expect(clearBtn).not.toBeDisabled();

    fireEvent.click(clearBtn);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/Header Overview & Format/i)).toBeNull();
    expect(clearBtn).toBeDisabled();
  });

  it('parses an uploaded valid KTX2 file from file input', async () => {
    render(<Ktx2HeaderInspectorTool />);

    const buffer = createKtx2Buffer({
      pixelWidth: 256,
      pixelHeight: 256,
      faceCount: 6,
      levelCount: 1,
    });
    const file = new File([buffer], 'cubemap.ktx2', { type: 'image/ktx2' });

    const input = screen.getByLabelText(/Upload KTX2 file/i);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Loaded and parsed cubemap\.ktx2/i)).toBeDefined();
    });

    expect(screen.getByText(/Yes \(6 faces\)/i)).toBeDefined();
    expect(screen.getAllByText(/Cube Map/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows an alert when an invalid or corrupted file is selected', async () => {
    render(<Ktx2HeaderInspectorTool />);

    const smallBuffer = new ArrayBuffer(20);
    const file = new File([smallBuffer], 'corrupted.ktx2', { type: 'image/ktx2' });

    const input = screen.getByLabelText(/Upload KTX2 file/i);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });

    expect(screen.getByText(/File is shorter than 80 bytes/i)).toBeDefined();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows an alert when a file with bad identifier is selected', async () => {
    render(<Ktx2HeaderInspectorTool />);

    const buffer = createKtx2Buffer({ corruptIdentifier: true });
    const file = new File([buffer], 'bad_sig.ktx2', { type: 'image/ktx2' });

    const input = screen.getByLabelText(/Upload KTX2 file/i);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });

    expect(screen.getByText(/Bad identifier/i)).toBeDefined();
  });

  it('handles drag and drop events properly', async () => {
    render(<Ktx2HeaderInspectorTool />);

    const dropzone = screen.getByRole('button', {
      name: /Drop KTX2 file here or click to browse/i,
    });

    fireEvent.dragOver(dropzone);
    expect(dropzone.classList.contains('active')).toBe(true);

    fireEvent.dragLeave(dropzone);
    expect(dropzone.classList.contains('active')).toBe(false);

    const buffer = createKtx2Buffer({
      pixelWidth: 512,
      pixelHeight: 512,
      layerCount: 2,
    });
    const file = new File([buffer], 'array.ktx2', { type: 'image/ktx2' });

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByText(/Loaded and parsed array\.ktx2/i)).toBeDefined();
    });

    expect(screen.getByText(/Yes \(2 layers\)/i)).toBeDefined();
  });

  it('has valid metadata conforming to tool catalog contracts', () => {
    expect(meta.id).toBe('ktx2-header-inspector');
    expect(meta.name).toBe('KTX2 Header Inspector');
    expect(meta.category).toBe('Inspector');
    expect(meta.description).toMatch(/KTX2/i);
    expect(meta.icon).toBeDefined();
  });

  it('prevents stale out-of-order file reads from replacing newer selections', async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    let resolveSecond;
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    vi.spyOn(ktx2Utils, 'readFileAsArrayBuffer')
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    render(<Ktx2HeaderInspectorTool />);

    const firstBuffer = createKtx2Buffer({ pixelWidth: 128, pixelHeight: 128 });
    const firstFile = new File([firstBuffer], 'first.ktx2', { type: 'image/ktx2' });

    const secondBuffer = createKtx2Buffer({ pixelWidth: 512, pixelHeight: 512 });
    const secondFile = new File([secondBuffer], 'second.ktx2', { type: 'image/ktx2' });

    const input = screen.getByLabelText(/Upload KTX2 file/i);

    // Select first file (slow read)
    fireEvent.change(input, { target: { files: [firstFile] } });

    // Select second file (fast read)
    fireEvent.change(input, { target: { files: [secondFile] } });

    // Resolve second file first
    await act(async () => {
      resolveSecond(secondBuffer);
    });

    await waitFor(() => {
      expect(screen.getByText(/Loaded and parsed second\.ktx2/i)).toBeDefined();
      expect(screen.getByText(/512 × 512 × 1/i)).toBeDefined();
    });

    // Now resolve first file (which was initiated earlier)
    await act(async () => {
      resolveFirst(firstBuffer);
    });

    // Verify second file results are still displayed, first file did not replace it
    expect(screen.getByText(/Loaded and parsed second\.ktx2/i)).toBeDefined();
    expect(screen.getByText(/512 × 512 × 1/i)).toBeDefined();
    expect(screen.queryByText(/Loaded and parsed first\.ktx2/i)).toBeNull();
    expect(screen.queryByText(/128 × 128 × 1/i)).toBeNull();
  });

  it('prevents stale rejected file read from clearing newer successful selection', async () => {
    let rejectFirst;
    const firstPromise = new Promise((_, reject) => {
      rejectFirst = reject;
    });

    let resolveSecond;
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    vi.spyOn(ktx2Utils, 'readFileAsArrayBuffer')
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    render(<Ktx2HeaderInspectorTool />);

    const firstFile = new File(['corrupted'], 'first.ktx2', { type: 'image/ktx2' });
    const secondBuffer = createKtx2Buffer({ pixelWidth: 256, pixelHeight: 256 });
    const secondFile = new File([secondBuffer], 'second.ktx2', { type: 'image/ktx2' });

    const input = screen.getByLabelText(/Upload KTX2 file/i);

    fireEvent.change(input, { target: { files: [firstFile] } });
    fireEvent.change(input, { target: { files: [secondFile] } });

    // Resolve second file
    await act(async () => {
      resolveSecond(secondBuffer);
    });

    await waitFor(() => {
      expect(screen.getByText(/Loaded and parsed second\.ktx2/i)).toBeDefined();
    });

    // Reject first file
    await act(async () => {
      rejectFirst(new Error('Failed to read first file'));
    });

    // Should still show second file and no alert
    expect(screen.getByText(/Loaded and parsed second\.ktx2/i)).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores file read resolving after Clear is clicked', async () => {
    let resolveRead;
    const deferredPromise = new Promise((resolve) => {
      resolveRead = resolve;
    });

    vi.spyOn(ktx2Utils, 'readFileAsArrayBuffer').mockReturnValueOnce(deferredPromise);

    render(<Ktx2HeaderInspectorTool />);

    const buffer = createKtx2Buffer({ pixelWidth: 1024, pixelHeight: 1024 });
    const file = new File([buffer], 'delayed.ktx2', { type: 'image/ktx2' });

    const input = screen.getByLabelText(/Upload KTX2 file/i);
    fireEvent.change(input, { target: { files: [file] } });

    // Clear is clicked while read is pending
    const clearBtn = screen.getByRole('button', { name: /Clear/i });
    expect(clearBtn).not.toBeDisabled();
    fireEvent.click(clearBtn);

    // Now resolve the read
    await act(async () => {
      resolveRead(buffer);
    });

    // Should remain cleared
    expect(screen.queryByText(/delayed\.ktx2/i)).toBeNull();
    expect(screen.queryByText(/Header Overview & Format/i)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: /Clear/i })).toBeDisabled();
  });

  it('ignores replacement read resolving after clearing already displayed result', async () => {
    render(<Ktx2HeaderInspectorTool />);

    // Load sample first so results are already displayed
    fireEvent.click(screen.getByRole('button', { name: /Load Sample/i }));
    await waitFor(() => {
      expect(screen.getByText(/Header Overview & Format/i)).toBeDefined();
    });

    let resolveReplacement;
    const replacementPromise = new Promise((resolve) => {
      resolveReplacement = resolve;
    });

    vi.spyOn(ktx2Utils, 'readFileAsArrayBuffer').mockReturnValueOnce(replacementPromise);

    const replacementBuffer = createKtx2Buffer({ pixelWidth: 64, pixelHeight: 64 });
    const replacementFile = new File([replacementBuffer], 'replacement.ktx2', {
      type: 'image/ktx2',
    });

    const input = screen.getByLabelText(/Upload KTX2 file/i);
    fireEvent.change(input, { target: { files: [replacementFile] } });

    // Clear while replacement read is in progress
    const clearBtn = screen.getByRole('button', { name: /Clear/i });
    fireEvent.click(clearBtn);

    expect(screen.queryByText(/Header Overview & Format/i)).toBeNull();

    // Now resolve replacement read
    await act(async () => {
      resolveReplacement(replacementBuffer);
    });

    // UI should still remain cleared
    expect(screen.queryByText(/Header Overview & Format/i)).toBeNull();
    expect(screen.queryByText(/replacement\.ktx2/i)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: /Clear/i })).toBeDisabled();
  });
});
