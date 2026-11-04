import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DnsPacketParserTool from './DnsPacketParserTool.jsx';

afterEach(cleanup);

describe('DnsPacketParserTool', () => {
  it('loads and decodes the standard A response sample', () => {
    render(<DnsPacketParserTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load A response' }));

    expect(screen.getByText('Response')).toBeInTheDocument();
    expect(screen.getByText('Recursion Available')).toBeInTheDocument();
    expect(screen.getByText('93.184.216.34')).toBeInTheDocument();
    expect(screen.getByText('Answers (1)')).toBeInTheDocument();
  });

  it('displays an accessible error for invalid packet input', () => {
    render(<DnsPacketParserTool />);

    fireEvent.change(screen.getByLabelText(/Raw DNS wireformat/), { target: { value: 'not hex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Decode packet' }));

    expect(screen.getByRole('alert')).toHaveTextContent('hex input must contain');
  });

  it('loads the query sample with a Question section and no answers', () => {
    render(<DnsPacketParserTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load A query' }));

    expect(screen.getByText('Query')).toBeInTheDocument();
    expect(screen.getByText('Questions (1)')).toBeInTheDocument();
    expect(screen.getByText('No answer records.')).toBeInTheDocument();
  });
});
