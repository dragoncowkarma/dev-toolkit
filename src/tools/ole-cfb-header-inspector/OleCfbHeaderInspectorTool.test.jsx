import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import OleCfbHeaderInspectorTool from './OleCfbHeaderInspectorTool.jsx';
import { createMinimalCfbBuffer } from './oleCfb.utils.js';

afterEach(() => {
  cleanup();
});

describe('OleCfbHeaderInspectorTool', () => {
  it('renders initial toolbar and dropzone elements', () => {
    render(<OleCfbHeaderInspectorTool />);

    expect(screen.getByRole('button', { name: /load sample/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /drop ole cfb file here or click to select/i }),
    ).toBeInTheDocument();
  });

  it('loads sample CFB header when clicking Load Sample', async () => {
    render(<OleCfbHeaderInspectorTool />);

    const sampleButton = screen.getByRole('button', { name: /load sample/i });
    fireEvent.click(sampleButton);

    expect(screen.getByText(/container overview/i)).toBeInTheDocument();
    expect(screen.getByText(/version & sector geometry/i)).toBeInTheDocument();
    expect(screen.getByText(/stream & allocation table pointers/i)).toBeInTheDocument();
    expect(screen.getByText('D0 CF 11 E0 A1 B1 1A E1')).toBeInTheDocument();
    expect(screen.getByText('{00000000-0000-0000-0000-000000000000}')).toBeInTheDocument();
  });

  it('displays an error alert with role="alert" when an invalid file is loaded', async () => {
    render(<OleCfbHeaderInspectorTool />);

    const fileInput = screen.getByLabelText(/upload ole cfb file/i);
    const invalidFile = new File(['invalid binary data'], 'test.doc', {
      type: 'application/msword',
    });

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/truncated file/i);
  });

  it('displays an error alert when magic signature is mismatched', async () => {
    render(<OleCfbHeaderInspectorTool />);

    const fileInput = screen.getByLabelText(/upload ole cfb file/i);
    const dummyBytes = new Uint8Array(512);
    const badFile = new File([dummyBytes.buffer], 'bad-magic.doc', {
      type: 'application/msword',
    });

    fireEvent.change(fileInput, { target: { files: [badFile] } });

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/invalid ole cfb file signature/i);
  });

  it('clears state when Clear button is clicked', () => {
    render(<OleCfbHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: /load sample/i }));
    expect(screen.getByText(/container overview/i)).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: /clear/i });
    expect(clearBtn).not.toBeDisabled();

    fireEvent.click(clearBtn);
    expect(screen.queryByText(/container overview/i)).not.toBeInTheDocument();
    expect(clearBtn).toBeDisabled();
  });

  it('handles valid file upload via file input', async () => {
    render(<OleCfbHeaderInspectorTool />);

    const validBuffer = createMinimalCfbBuffer();
    const validFile = new File([validBuffer], 'real.doc', {
      type: 'application/msword',
    });

    const fileInput = screen.getByLabelText(/upload ole cfb file/i);
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    expect(await screen.findByText(/container overview/i)).toBeInTheDocument();
    expect(screen.getByText('real.doc')).toBeInTheDocument();
  });

  it('handles file drop via drag and drop', async () => {
    render(<OleCfbHeaderInspectorTool />);

    const dropzone = screen.getByRole('button', {
      name: /drop ole cfb file here or click to select/i,
    });

    const validBuffer = createMinimalCfbBuffer();
    const droppedFile = new File([validBuffer], 'dropped.msi', {
      type: 'application/x-msi',
    });

    fireEvent.dragOver(dropzone);
    expect(dropzone).toHaveClass('drag-active');

    fireEvent.dragLeave(dropzone);
    expect(dropzone).not.toHaveClass('drag-active');

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [droppedFile],
      },
    });

    expect(await screen.findByText(/container overview/i)).toBeInTheDocument();
    expect(screen.getByText('dropped.msi')).toBeInTheDocument();
  });
});
