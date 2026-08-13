import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CookieTool from './CookieTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function inspect(value, mode = 'auto') {
  if (mode !== 'auto') {
    fireEvent.change(screen.getByLabelText('Cookie input type'), {
      target: { value: mode },
    });
  }
  fireEvent.change(screen.getByLabelText('Raw cookie header input'), {
    target: { value },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Inspect cookies' }));
}

describe('CookieTool', () => {
  it('renders its parser controls and parsed attribute table', () => {
    render(<CookieTool />);
    expect(screen.getByRole('heading', { name: 'Cookie Inspector' })).toBeInTheDocument();

    inspect('Set-Cookie: session=abc; Path=/; Secure; HttpOnly; SameSite=Lax');

    expect(screen.getByRole('table', { name: 'Parsed cookie attributes' }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit cookie session' })).toBeInTheDocument();
    expect(screen.getByLabelText('Set-Cookie header')).toHaveValue(
      'Set-Cookie: session=abc; Path=/; SameSite=Lax; Secure; HttpOnly',
    );
  });

  it('parses request Cookie strings and toggles URI decoding', () => {
    render(<CookieTool />);
    inspect('Cookie: greeting=hello%20world; theme=dark', 'cookie');
    expect(screen.getByRole('button', { name: 'Edit cookie greeting' }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Decode URI-encoded cookie values'));

    expect(screen.getByLabelText('Cookie value')).toHaveValue('hello world');
  });

  it('updates serialized outputs through interactive editor controls', () => {
    render(<CookieTool />);
    inspect('Set-Cookie: session=abc; Path=/; SameSite=Lax');

    fireEvent.change(screen.getByLabelText('Cookie name'), {
      target: { value: '__Secure-token' },
    });
    fireEvent.change(screen.getByLabelText('Cookie value'), {
      target: { value: 'updated' },
    });
    fireEvent.click(screen.getByLabelText('Cookie Secure'));
    fireEvent.click(screen.getByLabelText('Cookie HttpOnly'));
    fireEvent.change(screen.getByLabelText('Cookie Max-Age'), {
      target: { value: '120' },
    });

    expect(screen.getByLabelText('Set-Cookie header').value).toContain(
      '__Secure-token=updated; Path=/; Max-Age=120; SameSite=Lax; Secure; HttpOnly',
    );
    expect(screen.getByLabelText('document.cookie snippet').value).not.toContain('HttpOnly');
  });

  it('displays actionable warning badges for prefix and SameSite violations', () => {
    render(<CookieTool />);
    inspect('Set-Cookie: __Host-session=abc; Domain=.example.com; Path=/app; SameSite=None');

    expect(screen.getAllByText('__Host- cookies must include Secure.')).toHaveLength(2);
    expect(screen.getAllByText('__Host- cookies must not include Domain.')).toHaveLength(2);
    expect(screen.getAllByText('__Host- cookies must use Path=/.')).toHaveLength(2);
    expect(screen.getAllByText(/SameSite=None cookies must include Secure/)).toHaveLength(2);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(1);
  });

  it('shows parse and serialization failures as alerts', () => {
    render(<CookieTool />);
    inspect('Set-Cookie: malformed');
    expect(screen.getByRole('alert')).toHaveTextContent('name=value');

    inspect('Set-Cookie: valid=1; Path=/');
    fireEvent.change(screen.getByLabelText('Cookie name'), { target: { value: 'bad name' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Cookie name is required');
  });

  it('copies both outputs and announces clipboard feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CookieTool />);
    inspect('Set-Cookie: session=abc; Path=/; Secure');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Set-Cookie header' }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith('Set-Cookie: session=abc; Path=/; Secure');
    expect(screen.getByText('Set-Cookie header copied to clipboard.')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy document.cookie snippet' }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenLastCalledWith(
      'document.cookie = "session=abc; Path=/; Secure";',
    );
  });
});
