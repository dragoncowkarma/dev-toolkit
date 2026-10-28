import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SyslogParserTool from './SyslogParserTool.jsx';

afterEach(cleanup);

describe('SyslogParserTool', () => {
  it('loads samples and renders parsed message details', () => {
    render(<SyslogParserTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load samples' }));

    expect(screen.getByText('Line 1')).toBeInTheDocument();
    expect(screen.getAllByText(/RFC 5424/).length).toBeGreaterThan(0);
    expect(screen.getByText('Structured Data')).toBeInTheDocument();
    expect(screen.getByText('meta@32473')).toBeInTheDocument();
    expect(screen.getAllByText(/Invalid/).length).toBeGreaterThan(0);
  });

  it('parses text entered by the user and clears it', () => {
    render(<SyslogParserTool />);
    const input = screen.getByLabelText('Syslog messages');
    fireEvent.change(input, { target: { value: '<13>Oct 29 12:31:00 host app[7]: hello' } });

    expect(screen.queryByText('sshd')).not.toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(input).toHaveValue('');
  });
});
