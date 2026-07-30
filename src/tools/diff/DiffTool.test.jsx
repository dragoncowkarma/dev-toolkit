import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DiffTool from './DiffTool.jsx';

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

// jsdom's Blob shim has no text()/arrayBuffer(), so read it via FileReader instead.
function readBlobAsText(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DiffTool basic diffing', () => {
  it('shows the empty-state prompt before any text is entered', () => {
    render(<DiffTool />);
    expect(screen.getByText('Paste text on both sides to see a diff.')).toBeInTheDocument();
  });

  it('reports no differences for identical text', () => {
    render(<DiffTool />);
    fireEvent.change(screen.getByLabelText('Original'), { target: { value: 'same\ntext' } });
    fireEvent.change(screen.getByLabelText('Modified'), { target: { value: 'same\ntext' } });
    expect(screen.getByText('No differences found.')).toBeInTheDocument();
  });

  it('renders added, removed, and modified line counts', () => {
    render(<DiffTool />);
    fireEvent.change(screen.getByLabelText('Original'), { target: { value: 'a\nb\nc' } });
    fireEvent.change(screen.getByLabelText('Modified'), { target: { value: 'a\nx\nc\nd' } });

    expect(screen.getByLabelText('Diff statistics')).toHaveTextContent('+1');
    expect(screen.getByLabelText('Diff statistics')).toHaveTextContent('-0');
    expect(screen.getByLabelText('Diff statistics')).toHaveTextContent('~1');
  });
});

describe('DiffTool view mode toggle', () => {
  it('switches between side-by-side and unified views', () => {
    render(<DiffTool />);
    fireEvent.change(screen.getByLabelText('Original'), { target: { value: 'a\nb' } });
    fireEvent.change(screen.getByLabelText('Modified'), { target: { value: 'a\nc' } });

    expect(screen.getByLabelText('Side-by-side diff')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unified' }));

    expect(screen.queryByLabelText('Side-by-side diff')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Unified diff')).toBeInTheDocument();
  });

  it('gives every unified-view row at least one owned cell', () => {
    render(<DiffTool />);
    fireEvent.change(screen.getByLabelText('Original'), { target: { value: 'a\nb\nc' } });
    fireEvent.change(screen.getByLabelText('Modified'), { target: { value: 'a\nx\nc\nd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unified' }));

    const table = screen.getByLabelText('Unified diff');
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(within(row).getAllByRole('cell').length).toBeGreaterThan(0);
    }
  });
});

describe('DiffTool swap and clear', () => {
  it('swaps the original and modified text', () => {
    render(<DiffTool />);
    fireEvent.change(screen.getByLabelText('Original'), { target: { value: 'left' } });
    fireEvent.change(screen.getByLabelText('Modified'), { target: { value: 'right' } });

    fireEvent.click(screen.getByRole('button', { name: '⇅ Swap' }));

    expect(screen.getByLabelText('Original')).toHaveValue('right');
    expect(screen.getByLabelText('Modified')).toHaveValue('left');
  });

  it('clears both panels', () => {
    render(<DiffTool />);
    fireEvent.change(screen.getByLabelText('Original'), { target: { value: 'left' } });
    fireEvent.change(screen.getByLabelText('Modified'), { target: { value: 'right' } });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText('Original')).toHaveValue('');
    expect(screen.getByLabelText('Modified')).toHaveValue('');
  });
});

describe('DiffTool file upload', () => {
  it('loads a file into the original panel', async () => {
    render(<DiffTool />);
    const file = new File(['from file'], 'a.txt', { type: 'text/plain' });
    const input = screen.getByLabelText('Upload original file');

    await act(async () => selectFile(input, file));

    await waitFor(() => expect(screen.getByLabelText('Original')).toHaveValue('from file'));
  });

  it('loads a file into the modified panel', async () => {
    render(<DiffTool />);
    const file = new File(['from file'], 'b.txt', { type: 'text/plain' });
    const input = screen.getByLabelText('Upload modified file');

    await act(async () => selectFile(input, file));

    await waitFor(() => expect(screen.getByLabelText('Modified')).toHaveValue('from file'));
  });
});

describe('DiffTool copy and download', () => {
  it('copies the unified diff to the clipboard', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<DiffTool />);
    fireEvent.change(screen.getByLabelText('Original'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Modified'), { target: { value: 'b' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Diff' }));
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('--- original'),
    );
    expect(await screen.findByRole('button', { name: '✓ Copied' })).toBeInTheDocument();
  });

  it('disables copy and download when there are no changes', () => {
    render(<DiffTool />);
    expect(screen.getByRole('button', { name: 'Copy Diff' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
  });

  it('triggers a download of the diff with the expected filename and blob contents', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    let clickedAnchor = null;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function stubClick() {
        // Stand in for the real navigation jsdom can't perform, and capture
        // the anchor so its `download`/`href` can still be asserted on.
        clickedAnchor = this;
      });

    render(<DiffTool />);
    fireEvent.change(screen.getByLabelText('Original'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Modified'), { target: { value: 'b' } });

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('text/plain');
    await expect(readBlobAsText(blob)).resolves.toBe(
      `${[
        '--- original',
        '+++ modified',
        '@@ -1,1 +1,1 @@',
        '-a',
        '\\ No newline at end of file',
        '+b',
        '\\ No newline at end of file',
      ].join('\n')}\n`,
    );
    expect(clickedAnchor.download).toBe('diff.patch');
    expect(clickedAnchor.href).toBe('blob:mock');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');

    clickSpy.mockRestore();
  });
});

describe('DiffTool navigation', () => {
  it('calls onBack when the back button is clicked', () => {
    const onBack = vi.fn();
    render(<DiffTool onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go back to tool dashboard' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
