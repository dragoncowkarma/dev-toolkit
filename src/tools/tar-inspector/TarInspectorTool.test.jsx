import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import TarInspectorTool from './TarInspectorTool.jsx';
import { createMockTarArchive } from './tar-inspector.utils.js';

afterEach(() => {
  cleanup();
});

describe('TarInspectorTool', () => {
  it('renders initial dropzone and sample action buttons', () => {
    render(<TarInspectorTool />);

    expect(screen.getByText(/Drop a TAR archive here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Load Sample TAR/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Load Corrupted Sample/i })).toBeInTheDocument();
  });

  it('loads and displays a valid sample TAR archive', () => {
    render(<TarInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: /Load Sample TAR/i }));

    // Archive summary bar
    expect(screen.getByText('sample-archive.tar')).toBeInTheDocument();
    expect(screen.getByText('POSIX ustar')).toBeInTheDocument();

    // Table rows
    const table = screen.getByRole('table', { name: /archive entries/i });
    expect(within(table).getByText('README.md')).toBeInTheDocument();
    expect(within(table).getByText('src/main.js')).toBeInTheDocument();
    expect(within(table).getByText('docs/')).toBeInTheDocument();

    // Details panel for default selected entry
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('README.md');
    expect(screen.getByText(/✓ Valid/i)).toBeInTheDocument();
  });

  it('updates selected entry when clicking table rows and closes detail view', () => {
    render(<TarInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: /Load Sample TAR/i }));

    const table = screen.getByRole('table', { name: /archive entries/i });
    const dirRow = within(table).getByText('docs/').closest('tr');
    fireEvent.click(dirRow);

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('docs/');
    const details = document.querySelector('.tar-details-panel');
    expect(within(details).getByText(/Directory/i)).toBeInTheDocument();

    // Close detail panel
    fireEvent.click(screen.getByRole('button', { name: /Close entry details/i }));
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('filters table entries by search query and type filter', () => {
    render(<TarInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: /Load Sample TAR/i }));
    const table = screen.getByRole('table', { name: /archive entries/i });

    const searchInput = screen.getByPlaceholderText(/Filter entries by path or type…/i);
    fireEvent.change(searchInput, { target: { value: 'main.js' } });

    expect(within(table).getByText('src/main.js')).toBeInTheDocument();
    expect(within(table).queryByText('README.md')).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(within(table).getByText('README.md')).toBeInTheDocument();

    // Filter by type
    const typeSelect = screen.getByLabelText(/Filter by entry type/i);
    fireEvent.change(typeSelect, { target: { value: 'DIRECTORY' } });

    expect(within(table).getByText('docs/')).toBeInTheDocument();
    expect(within(table).queryByText('README.md')).not.toBeInTheDocument();
  });

  it('displays descriptive error alert when loading corrupted sample', () => {
    render(<TarInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: /Load Corrupted Sample/i }));

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/checksum mismatch/i);

    // Dismiss error
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/Drop a TAR archive here/i)).toBeInTheDocument();
  });

  it('handles user-selected file via file input', async () => {
    render(<TarInspectorTool />);

    const validBytes = createMockTarArchive([
      { name: 'uploaded.txt', content: 'uploaded file contents' },
    ]);
    const file = new File([validBytes], 'custom.tar', { type: 'application/x-tar' });

    // Mock FileReader
    const OriginalFileReader = global.FileReader;
    class MockFileReader {
      readAsArrayBuffer() {
        setTimeout(() => {
          this.onload({ target: { result: validBytes.buffer } });
        }, 0);
      }
    }
    global.FileReader = MockFileReader;

    const fileInput = screen.getByLabelText(/Select TAR archive file/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    await screen.findByText('custom.tar');
    const table = screen.getByRole('table', { name: /archive entries/i });
    expect(within(table).getByText('uploaded.txt')).toBeInTheDocument();

    global.FileReader = OriginalFileReader;
  });

  it('resets state when Clear button is clicked', () => {
    render(<TarInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: /Load Sample TAR/i }));
    expect(screen.getByText('sample-archive.tar')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('sample-archive.tar')).not.toBeInTheDocument();
    expect(screen.getByText(/Drop a TAR archive here/i)).toBeInTheDocument();
  });
});
