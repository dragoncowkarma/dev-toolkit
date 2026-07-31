import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChmodTool from './ChmodTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ChmodTool', () => {
  it('renders a synchronized default permission matrix', () => {
    render(<ChmodTool />);
    expect(screen.getByLabelText('Octal permission')).toHaveValue('755');
    expect(screen.getByLabelText('Symbolic permission')).toHaveValue('-rwxr-xr-x');
    expect(screen.getByLabelText('Owner (User) Write')).toBeChecked();
    expect(screen.getByLabelText('Group Write')).not.toBeChecked();
  });

  it('updates representations when a permission checkbox is toggled', () => {
    render(<ChmodTool />);
    fireEvent.click(screen.getByLabelText('Others Write'));
    expect(screen.getByLabelText('Octal permission')).toHaveValue('757');
    expect(screen.getByLabelText('Symbolic permission')).toHaveValue('-rwxr-xrwx');
  });

  it('applies presets and accepts symbolic input', () => {
    render(<ChmodTool />);
    fireEvent.click(screen.getByRole('button', { name: '644 File' }));
    expect(screen.getByLabelText('Octal permission')).toHaveValue('644');
    fireEvent.change(screen.getByLabelText('Symbolic permission'), {
      target: { value: '-rwsr-xr-x' },
    });
    expect(screen.getByLabelText('Octal permission')).toHaveValue('4755');
    expect(screen.getByLabelText('SetUID')).toBeChecked();
  });

  it('copies individual values and reports a toast message', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ChmodTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy command' }));
    expect(writeText).toHaveBeenCalledWith('chmod 755 filename');
    expect(await screen.findByRole('status')).toHaveTextContent('chmod command copied');
  });
});
