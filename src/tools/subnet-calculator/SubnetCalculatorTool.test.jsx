import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SubnetCalculatorTool from './SubnetCalculatorTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SubnetCalculatorTool', () => {
  it('renders the default calculation and synchronizes CIDR input', () => {
    render(<SubnetCalculatorTool />);
    expect(screen.getByText('192.168.1.0')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('CIDR notation'), { target: { value: '10.1.2.3/16' } });
    expect(screen.getByLabelText('IP address')).toHaveValue('10.1.2.3');
    expect(screen.getByLabelText('Subnet mask')).toHaveValue('255.255.0.0');
    expect(screen.getByText('10.1.0.0')).toBeInTheDocument();
  });

  it('synchronizes a separate subnet mask input and applies a prefix preset', () => {
    render(<SubnetCalculatorTool />);
    fireEvent.change(screen.getByLabelText('Subnet mask'), { target: { value: '255.255.0.0' } });
    expect(screen.getByLabelText('CIDR notation')).toHaveValue('192.168.1.10/16');
    fireEvent.click(screen.getByRole('button', { name: '/30' }));
    expect(screen.getByLabelText('CIDR notation')).toHaveValue('192.168.1.10/30');
    expect(screen.getByText('192.168.1.8')).toBeInTheDocument();
  });

  it('shows a clear error for invalid IP input', () => {
    render(<SubnetCalculatorTool />);
    fireEvent.change(screen.getByLabelText('IP address'), { target: { value: '300.1.1.1' } });
    expect(screen.getByRole('alert')).toHaveTextContent('four octets from 0 to 255');
  });

  it('copies a result and announces the toast feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<SubnetCalculatorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Network Address' }));
    expect(writeText).toHaveBeenCalledWith('192.168.1.0');
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Network Address copied');
    });
  });
});
