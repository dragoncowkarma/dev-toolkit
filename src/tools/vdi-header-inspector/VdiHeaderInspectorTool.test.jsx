import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import VdiHeaderInspectorTool from './VdiHeaderInspectorTool.jsx';
import { createSampleVdiHeader } from './vdi.utils.js';

afterEach(() => {
  cleanup();
});

describe('VdiHeaderInspectorTool component', () => {
  it('renders correctly with initial landmarks and empty state', () => {
    render(<VdiHeaderInspectorTool />);

    expect(screen.getByRole('region', { name: 'VDI Header Inspector' })).toBeInTheDocument();
    expect(screen.getByLabelText('Upload VDI file')).toBeInTheDocument();
    expect(screen.getByLabelText(/Or Paste Hex Bytes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sample Dynamic VDI' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sample Fixed VDI' })).toBeInTheDocument();
  });

  it('loads dynamic sample on button click and renders decoded summary', () => {
    render(<VdiHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Sample Dynamic VDI' }));

    expect(screen.getByRole('main', { name: 'Decoded VDI Header' })).toBeInTheDocument();
    expect(screen.getByText('0xBEDA107F')).toBeInTheDocument();
    expect(screen.getByText('dynamic', { selector: '.field-badge' })).toBeInTheDocument();
    expect(screen.getByText('Raw Header Hex Dump')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('loads fixed sample on button click and renders fixed badge', () => {
    render(<VdiHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Sample Fixed VDI' }));

    expect(screen.getByRole('main', { name: 'Decoded VDI Header' })).toBeInTheDocument();
    expect(screen.getByText('fixed', { selector: '.field-badge' })).toBeInTheDocument();
  });

  it('renders accessible error when invalid hex is provided', () => {
    render(<VdiHeaderInspectorTool />);

    const textarea = screen.getByLabelText(/Or Paste Hex Bytes/i);
    fireEvent.change(textarea, { target: { value: 'not-valid-hex' } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Invalid character/i);
  });

  it('renders accessible error when truncated hex is provided', () => {
    render(<VdiHeaderInspectorTool />);

    const textarea = screen.getByLabelText(/Or Paste Hex Bytes/i);
    // 4 bytes: 7F 10 DA BE
    fireEvent.change(textarea, { target: { value: '7F 10 DA BE' } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/truncated/i);
  });

  it('clears input and parsed results when Clear is clicked', () => {
    render(<VdiHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Sample Dynamic VDI' }));
    expect(screen.getByRole('main', { name: 'Decoded VDI Header' })).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    expect(clearBtn).not.toBeDisabled();
    fireEvent.click(clearBtn);

    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('handles file drop', () => {
    render(<VdiHeaderInspectorTool />);

    const sample = createSampleVdiHeader({ imageType: 1 });
    const file = new File([sample], 'test.vdi', { type: 'application/octet-stream' });

    const dropzone = screen.getByRole('region', { name: 'VDI file drop zone' });
    fireEvent.dragOver(dropzone);
    expect(dropzone).toHaveClass('dragging');

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    });
    expect(dropzone).not.toHaveClass('dragging');
  });
});
