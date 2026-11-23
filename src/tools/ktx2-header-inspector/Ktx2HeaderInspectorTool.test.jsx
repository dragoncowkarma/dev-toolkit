import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Ktx2HeaderInspectorTool from './Ktx2HeaderInspectorTool.jsx';
import meta from './meta.js';
import { createKtx2Buffer } from './ktx2.utils.js';

afterEach(() => {
  cleanup();
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
});
