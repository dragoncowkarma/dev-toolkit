import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import GptPartitionTableInspectorTool from './GptPartitionTableInspectorTool.jsx';
import { createSampleGptBytes } from './gpt.utils.js';

afterEach(() => {
  cleanup();
});

describe('GptPartitionTableInspectorTool UI', () => {
  it('renders initial file upload dropzone', () => {
    render(<GptPartitionTableInspectorTool />);

    expect(screen.getByRole('radio', { name: 'File Upload' })).toHaveClass('active');
    expect(screen.getByText('Select or drop disk image file')).toBeInTheDocument();
  });

  it('switches to Paste Hex mode and parses sample GPT on click', async () => {
    render(<GptPartitionTableInspectorTool />);

    const sampleBtn = screen.getByRole('button', { name: 'Load Sample GPT' });
    fireEvent.click(sampleBtn);

    expect(screen.getByRole('radio', { name: 'Paste Hex' })).toHaveClass('active');
    await waitFor(() => {
      expect(screen.getByText('GPT Header (LBA 1)')).toBeInTheDocument();
      expect(screen.getByText('EFI PART - Valid Header')).toBeInTheDocument();
      expect(screen.getByText('#1 EFI System')).toBeInTheDocument();
      expect(screen.getByText('#2 Basic Data')).toBeInTheDocument();
    });
  });

  it('displays error on invalid hex input', async () => {
    render(<GptPartitionTableInspectorTool />);

    fireEvent.click(screen.getByRole('radio', { name: 'Paste Hex' }));
    const textarea = screen.getByPlaceholderText(/Paste raw hex data/);

    fireEvent.change(textarea, { target: { value: '1234567890abcdef' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Truncated input/)).toBeInTheDocument();
    });
  });

  it('handles valid file upload', async () => {
    render(<GptPartitionTableInspectorTool />);

    const sampleBytes = createSampleGptBytes();
    const file = new File([sampleBytes], 'disk.img', { type: 'application/octet-stream' });
    const input = screen.getByLabelText('Upload disk image file');

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.getByText('GPT Header (LBA 1)')).toBeInTheDocument();
      expect(screen.getByText('#1 EFI System')).toBeInTheDocument();
      expect(screen.getByText(/disk\.img/)).toBeInTheDocument();
    });
  });

  it('clears state when Clear button is clicked', async () => {
    render(<GptPartitionTableInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample GPT' }));
    await waitFor(() => {
      expect(screen.getByText('GPT Header (LBA 1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.queryByText('GPT Header (LBA 1)')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste raw hex data/)).toHaveValue('');
  });
});
