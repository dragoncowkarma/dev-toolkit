import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JwtTool from './JwtTool.jsx';

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

// Header: {"alg":"HS256","typ":"JWT"}
// Base64URL: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
const HEADER_B64 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';

// Payload: {"sub":"user123","name":"Valid User","iat":1767222000,"exp":1767229200}
// exp: 2026-01-01 01:00:00 UTC (+1 hour relative to FIXED_NOW)
const VALID_PAYLOAD_B64 =
  'eyJzdWIiOiJ1c2VyMTIzIiwibmFtZSI6IlZhbGlkIFVzZXIiLCJpYXQiOjE3NjcyMjIwMDAsImV4cCI6MTc2NzIyOTIwMH0';
const VALID_JWT = `${HEADER_B64}.${VALID_PAYLOAD_B64}.test-signature`;

// Payload: {"sub":"user123","exp":1767223800}
// exp: 2026-01-01 23:30:00 UTC previous day (-30 min relative to FIXED_NOW)
const EXPIRED_PAYLOAD_B64 = 'eyJzdWIiOiJ1c2VyMTIzIiwiZXhwIjoxNzY3MjIzODAwfQ';
const EXPIRED_JWT = `${HEADER_B64}.${EXPIRED_PAYLOAD_B64}.test-signature`;

// Payload: {"sub":"user123","nbf":1767227400,"exp":1767232800}
// nbf: +30 min relative to FIXED_NOW
const NOT_ACTIVE_PAYLOAD_B64 =
  'eyJzdWIiOiJ1c2VyMTIzIiwibmJmIjoxNzY3MjI3NDAwLCJleHAiOjE3NjcyMzI4MDB9';
const NOT_ACTIVE_JWT = `${HEADER_B64}.${NOT_ACTIVE_PAYLOAD_B64}.test-signature`;

// Payload: {"sub":"user123","exp":1767225605}
// exp: +5 seconds relative to FIXED_NOW
const COUNTDOWN_PAYLOAD_B64 = 'eyJzdWIiOiJ1c2VyMTIzIiwiZXhwIjoxNzY3MjI1NjA1fQ';
const COUNTDOWN_JWT = `${HEADER_B64}.${COUNTDOWN_PAYLOAD_B64}.test-signature`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('JwtTool decoding and rendering', () => {
  it('renders Header, Payload, algorithm, and signature when a valid JWT is entered', () => {
    render(<JwtTool />);

    fireEvent.change(screen.getByLabelText('JWT token'), {
      target: { value: VALID_JWT },
    });

    expect(screen.getByText('Algorithm: HS256')).toBeInTheDocument();
    expect(screen.getByText('test-signature')).toBeInTheDocument();

    const jsonBlocks = screen.getAllByText((_, element) => element?.tagName.toLowerCase() === 'pre');
    expect(jsonBlocks[0]).toHaveTextContent('"alg": "HS256"');
    expect(jsonBlocks[1]).toHaveTextContent('"name": "Valid User"');
  });

  it('displays role="alert" error message and Invalid Format badge for invalid token', () => {
    render(<JwtTool />);

    fireEvent.change(screen.getByLabelText('JWT token'), {
      target: { value: 'invalid.jwt.token!' },
    });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('Invalid Format');
    expect(alert).toHaveTextContent('Invalid JWT format');
  });
});

describe('JwtTool time claim status badges', () => {
  it('displays Valid badge and remaining time for future expiration', () => {
    render(<JwtTool />);

    fireEvent.change(screen.getByLabelText('JWT token'), {
      target: { value: VALID_JWT },
    });

    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(screen.getByText(/1 hour remaining/)).toBeInTheDocument();
  });

  it('displays Expired badge for past expiration', () => {
    render(<JwtTool />);

    fireEvent.change(screen.getByLabelText('JWT token'), {
      target: { value: EXPIRED_JWT },
    });

    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('displays Not Active badge for future not-before time', () => {
    render(<JwtTool />);

    fireEvent.change(screen.getByLabelText('JWT token'), {
      target: { value: NOT_ACTIVE_JWT },
    });

    expect(screen.getByText('Not Active')).toBeInTheDocument();
  });
});

describe('JwtTool timer behavior', () => {
  it('updates countdown timer every second and transitions status when expired', () => {
    render(<JwtTool />);

    fireEvent.change(screen.getByLabelText('JWT token'), {
      target: { value: COUNTDOWN_JWT },
    });

    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(screen.getByText(/5 seconds remaining/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/4 seconds remaining/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('cleans up interval on unmount without warnings or extra state updates', () => {
    const { unmount } = render(<JwtTool />);

    fireEvent.change(screen.getByLabelText('JWT token'), {
      target: { value: COUNTDOWN_JWT },
    });

    unmount();

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(5000);
      });
    }).not.toThrow();
  });
});

describe('JwtTool additional features', () => {
  it('loads sample JWT and decodes it immediately when clicking Sample JWT button', () => {
    render(<JwtTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load sample JWT' }));

    const textarea = screen.getByLabelText('JWT token');
    expect(textarea.value).toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');

    expect(screen.getByText('Algorithm: HS256')).toBeInTheDocument();
    expect(screen.getByText('Header')).toBeInTheDocument();
    expect(screen.getByText('Payload')).toBeInTheDocument();
  });

  it('copies Header and Payload to clipboard as formatted JSON', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<JwtTool />);

    fireEvent.change(screen.getByLabelText('JWT token'), {
      target: { value: VALID_JWT },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Header' }));
    });

    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }, null, 2)
    );
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Payload' }));
    });

    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify(
        { sub: 'user123', name: 'Valid User', iat: 1767222000, exp: 1767229200 },
        null,
        2
      )
    );
  });

  it('displays copy error message with role="alert" when clipboard copy fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<JwtTool />);

    fireEvent.change(screen.getByLabelText('JWT token'), {
      target: { value: VALID_JWT },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Header' }));
    });

    const alert = screen.getByText('Could not copy JSON to the clipboard.');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('role', 'alert');
  });
});

describe('JwtTool accessibility', () => {
  it('has a section with aria-label "JWT Decoder Tool"', () => {
    render(<JwtTool />);

    const section = screen.getByRole('region', { name: 'JWT Decoder Tool' });
    expect(section).toBeInTheDocument();
  });
});
