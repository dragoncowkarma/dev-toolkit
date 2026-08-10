import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Ipv6SubnetCalculatorTool from './Ipv6SubnetCalculatorTool.jsx';

afterEach(cleanup);

describe('Ipv6SubnetCalculatorTool', () => {
  it('renders the default IPv6 CIDR analysis', () => {
    render(<Ipv6SubnetCalculatorTool />);
    expect(screen.getByText('2001:0db8:0000:0000:0000:0000:0000:0000'))
      .toBeInTheDocument();
    expect(screen.getByText((2n ** 96n).toString())).toBeInTheDocument();
    expect(screen.getAllByText('2001:db8::')).toHaveLength(3);
  });

  it.each([
    '2001:db8:zzzz::/32',
    '2001:db8::/129',
    '2001::db8::1/64',
  ])('shows an inline error for invalid input: %s', (input) => {
    render(<Ipv6SubnetCalculatorTool />);
    fireEvent.change(screen.getByLabelText('IPv6 CIDR notation'), {
      target: { value: input },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('prefix from 0 to 128');
    expect(screen.queryByLabelText('IPv6 subnet results')).not.toBeInTheDocument();
  });
});
