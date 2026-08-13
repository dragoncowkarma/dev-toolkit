import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import HarTool from './HarTool.jsx';

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
