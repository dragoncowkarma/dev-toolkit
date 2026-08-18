import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import HarTool from './HarTool.jsx';

/** A second archive that shares no method, status class, MIME or URL text with the sample. */
const OTHER_HAR = {
  log: {
    version: '1.2',
    creator: { name: 'HarTool test fixture', version: '1.0' },
    entries: [
      {
        startedDateTime: '2024-03-01T10:00:00.000Z',
        time: 42,
        request: {
          method: 'GET',
          url: 'https://cdn.example.org/dashboard/index.html',
          httpVersion: 'HTTP/1.1',
          headers: [],
          cookies: [],
          queryString: [],
        },
        response: {
          status: 200,
          statusText: 'OK',
          httpVersion: 'HTTP/1.1',
          headers: [],
          cookies: [],
          content: { size: 512, mimeType: 'text/html' },
          redirectURL: '',
          headersSize: 120,
          bodySize: 512,
        },
        timings: { blocked: 1, dns: 2, connect: 3, ssl: 0, send: 1, wait: 30, receive: 5 },
        cache: {},
      },
    ],
  },
};

const OTHER_HAR_TEXT = JSON.stringify(OTHER_HAR, null, 2);
const OTHER_HAR_PATH = '/dashboard/index.html';
const SAMPLE_FIRST_PATH = '/v1/users?page=1&limit=10';

/**
 * Filter controls that must not leak across archives, with a value that keeps
 * the sample's first entry hidden and excludes every OTHER_HAR entry.
 */
const STALE_FILTER_CASES = [
  {
    name: 'search text',
    label: /Filter network requests by text query/i,
    value: 'logo.svg',
    resetValue: '',
  },
  {
    name: 'status class',
    label: /Filter by status code class/i,
    value: '4xx',
    resetValue: 'all',
  },
  {
    name: 'HTTP method',
    label: /Filter by HTTP method/i,
    value: 'DELETE',
    resetValue: 'all',
  },
  {
    name: 'MIME category',
    label: /Filter by MIME type category/i,
    value: 'image',
    resetValue: 'all',
  },
];

function selectFile(input, file) {
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  fireEvent.change(input);
}

describe('HarTool.jsx Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders initial dropzone and controls', () => {
    render(<HarTool />);
    expect(screen.getByRole('button', { name: /Load sample/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload HAR file/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Drag & drop a browser DevTools \.har file here/i)
    ).toBeInTheDocument();
  });

  it('loads sample HAR data when clicking "Load sample"', () => {
    render(<HarTool />);
    const sampleBtn = screen.getByRole('button', { name: /Load sample/i });
    fireEvent.click(sampleBtn);

    // Summary metrics should be visible
    expect(screen.getByText('Total Requests')).toBeInTheDocument();
    expect(screen.getByText('Transferred')).toBeInTheDocument();

    // Table entries rendered
    const table = screen.getByRole('table', { name: /HAR network entries table/i });
    expect(table).toBeInTheDocument();
    expect(screen.getByText('/v1/users?page=1&limit=10')).toBeInTheDocument();
  });

  it('displays actionable error alert on invalid JSON input', () => {
    render(<HarTool />);
    const sampleBtn = screen.getByRole('button', { name: /Load sample/i });
    fireEvent.click(sampleBtn);

    const textarea = screen.getByLabelText(/Raw HAR JSON input/i);
    fireEvent.change(textarea, { target: { value: '{ invalid JSON payload ' } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Invalid JSON syntax/i);
  });

  it('shows entry details when selecting a table row button', () => {
    render(<HarTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    // Click row select button for entry #2 (/v1/auth/login)
    const selectBtn = screen.getByRole('button', { name: /Select entry #2/i });
    fireEvent.click(selectBtn);

    // Detail panel section should be displayed with tabs
    expect(screen.getByRole('tab', { name: /Timing & Overview/i })).toBeInTheDocument();

    // Switch to Request Headers tab
    const reqHeadersTab = screen.getByRole('tab', { name: /Request Headers/i });
    fireEvent.click(reqHeadersTab);
    expect(screen.getByText('Origin')).toBeInTheDocument();

    // Switch to Response Headers tab
    const resHeadersTab = screen.getByRole('tab', { name: /Response Headers/i });
    fireEvent.click(resHeadersTab);
    expect(screen.getByText('Location')).toBeInTheDocument();
  });

  it('resets tab selection when selecting an entry without params/body', () => {
    render(<HarTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    // Entry #1 is selected by handleLoadSample. Click Params & Body tab
    const paramsTab = screen.getByRole('tab', { name: /Params & Body/i });
    fireEvent.click(paramsTab);
    expect(screen.getByText('Query Parameters')).toBeInTheDocument();

    // Now select entry 4 (/v1/missing-resource) which has NO params or post body
    const btnEntry4 = screen.getByRole('button', { name: /Select entry #4/i });
    fireEvent.click(btnEntry4);

    // Tabpanel should fall back to overview without rendering an empty blank panel
    const timingLegend = screen.getByText(/Blocked \(/i);
    expect(timingLegend).toBeInTheDocument();
    const activeTab = screen.getByRole('tab', { name: /Timing & Overview/i });
    expect(activeTab).toHaveAttribute('aria-selected', 'true');
  });

  it('sorts entries via dropdown select control', () => {
    render(<HarTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    const sortSelect = screen.getByLabelText(/Sort entries by column/i);
    // Sort by duration slowest first
    fireEvent.change(sortSelect, { target: { value: 'time-desc' } });

    const rows = screen.getAllByRole('button', { name: /Select entry #/i });
    // Entry #5 (210ms) should be first
    expect(rows[0]).toHaveTextContent('5');
  });

  it('sorts entries via column header click and keyboard events', () => {
    render(<HarTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    const methodHeader = screen.getByRole('columnheader', { name: /Sort by Method/i });
    expect(methodHeader).toHaveAttribute('aria-sort', 'none');

    // Click header to sort by method ASC
    fireEvent.click(methodHeader);
    expect(methodHeader).toHaveAttribute('aria-sort', 'ascending');

    const sortSelect = screen.getByLabelText(/Sort entries by column/i);
    expect(sortSelect.value).toBe('method-asc');

    // Keydown Enter on Method header to toggle to DESC
    fireEvent.keyDown(methodHeader, { key: 'Enter' });
    expect(methodHeader).toHaveAttribute('aria-sort', 'descending');
    expect(sortSelect.value).toBe('method-desc');
  });

  it('filters entries when search query is typed', () => {
    render(<HarTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    const searchInput = screen.getByLabelText(/Filter network requests by text query/i);
    fireEvent.change(searchInput, { target: { value: 'logo.svg' } });

    expect(screen.getByText('/assets/logo.svg')).toBeInTheDocument();
    expect(screen.queryByText('/v1/users?page=1&limit=10')).not.toBeInTheDocument();
  });

  it('filters entries by status class dropdown', () => {
    render(<HarTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    const statusSelect = screen.getByLabelText(/Filter by status code class/i);
    fireEvent.change(statusSelect, { target: { value: '4xx' } });

    expect(screen.getByText('/v1/missing-resource')).toBeInTheDocument();
    expect(screen.queryByText('/v1/users?page=1&limit=10')).not.toBeInTheDocument();
  });

  it('derives HTTP methods dynamically for the method filter dropdown', () => {
    render(<HarTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    const methodSelect = screen.getByLabelText(/Filter by HTTP method/i);
    fireEvent.change(methodSelect, { target: { value: 'DELETE' } });

    expect(screen.getByText('/v1/items/99')).toBeInTheDocument();
    expect(screen.queryByText('/v1/users?page=1&limit=10')).not.toBeInTheDocument();
  });

  it('clears data when clicking Clear button', () => {
    render(<HarTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));
    expect(screen.getByText('Total Requests')).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: /Clear HAR data/i });
    fireEvent.click(clearBtn);

    expect(screen.queryByText('Total Requests')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Drag & drop a browser DevTools \.har file here/i)
    ).toBeInTheDocument();
  });
});

describe('HarTool.jsx Archive Transitions', () => {
  afterEach(() => {
    cleanup();
  });

  it('resets stale filters when a new archive arrives through the file input', async () => {
    render(<HarTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    const methodSelect = screen.getByLabelText(/Filter by HTTP method/i);
    fireEvent.change(methodSelect, { target: { value: 'DELETE' } });
    expect(screen.queryByText(SAMPLE_FIRST_PATH)).not.toBeInTheDocument();

    const file = new File([OTHER_HAR_TEXT], 'other.har', { type: 'application/json' });
    selectFile(screen.getByLabelText(/Choose HAR file/i), file);

    await waitFor(() => {
      expect(screen.getByText(OTHER_HAR_PATH)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Filter by HTTP method/i)).toHaveValue('all');
  });

  it('resets stale filters when a new archive is dropped on the dropzone', async () => {
    render(<HarTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    const searchInput = screen.getByLabelText(/Filter network requests by text query/i);
    fireEvent.change(searchInput, { target: { value: 'logo.svg' } });

    // Emptying the textarea brings the dropzone back while the search filter is
    // still set, because an unparseable source must not discard the filters.
    fireEvent.change(screen.getByLabelText(/Raw HAR JSON input/i), { target: { value: '' } });
    const dropzone = screen.getByRole('button', { name: /Drag and drop a HAR file here/i });
    const file = new File([OTHER_HAR_TEXT], 'other.har', { type: 'application/json' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(OTHER_HAR_PATH)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Filter network requests by text query/i)).toHaveValue('');
  });

  it.each(STALE_FILTER_CASES)(
    'resets the $name filter when raw JSON is replaced with another archive',
    ({ label, value, resetValue }) => {
      render(<HarTool />);
      fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      expect(screen.queryByText(SAMPLE_FIRST_PATH)).not.toBeInTheDocument();

      const textarea = screen.getByLabelText(/Raw HAR JSON input/i);
      fireEvent.change(textarea, { target: { value: OTHER_HAR_TEXT } });

      expect(screen.getByText(OTHER_HAR_PATH)).toBeInTheDocument();
      expect(screen.getByLabelText(label)).toHaveValue(resetValue);
    }
  );

  it('keeps the sort order across archives because sorting is never stale', () => {
    render(<HarTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    const sortSelect = screen.getByLabelText(/Sort entries by column/i);
    fireEvent.change(sortSelect, { target: { value: 'time-desc' } });

    const textarea = screen.getByLabelText(/Raw HAR JSON input/i);
    fireEvent.change(textarea, { target: { value: OTHER_HAR_TEXT } });

    expect(screen.getByText(OTHER_HAR_PATH)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sort entries by column/i)).toHaveValue('time-desc');
  });

  it('reports incomplete JSON without swapping in a new archive', () => {
    render(<HarTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    fireEvent.change(screen.getByLabelText(/Filter network requests by text query/i), {
      target: { value: 'logo.svg' },
    });

    const textarea = screen.getByLabelText(/Raw HAR JSON input/i);
    fireEvent.change(textarea, { target: { value: '{ "log": { "entries": [' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/Invalid JSON syntax/i);
    // No archive was accepted, so no entry table replaces the previous view.
    expect(screen.queryByRole('table', { name: /HAR network entries table/i })).toBeNull();
    expect(screen.queryByText(OTHER_HAR_PATH)).not.toBeInTheDocument();
  });

  it('reports a structurally invalid HAR without swapping in a new archive', () => {
    render(<HarTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    fireEvent.change(screen.getByLabelText(/Filter by status code class/i), {
      target: { value: '4xx' },
    });

    const textarea = screen.getByLabelText(/Raw HAR JSON input/i);
    fireEvent.change(textarea, { target: { value: '{ "log": {} }' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/"log.entries"/i);
    expect(screen.queryByRole('table', { name: /HAR network entries table/i })).toBeNull();
  });

  it('resets filters and restores the dropzone when clearing a filtered archive', () => {
    render(<HarTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    fireEvent.change(screen.getByLabelText(/Filter by HTTP method/i), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Clear HAR data/i }));

    expect(
      screen.getByText(/Drag & drop a browser DevTools \.har file here/i)
    ).toBeInTheDocument();

    // Re-loading the sample must show every entry, not just the DELETE request.
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));
    expect(screen.getByLabelText(/Filter by HTTP method/i)).toHaveValue('all');
    expect(screen.getByText(SAMPLE_FIRST_PATH)).toBeInTheDocument();
  });
});
