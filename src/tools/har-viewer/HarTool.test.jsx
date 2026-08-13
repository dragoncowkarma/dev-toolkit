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

  it('shows entry details when selecting a table row', () => {
    render(<HarTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    // Click second request row (/v1/auth/login)
    const loginRow = screen.getByText('/v1/auth/login').closest('tr');
    fireEvent.click(loginRow);

    // Detail panel should be displayed with tabs
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
