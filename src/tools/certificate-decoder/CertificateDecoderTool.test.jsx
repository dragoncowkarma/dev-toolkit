import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CertificateDecoderTool from './CertificateDecoderTool.jsx';
import {
  EC_CERTIFICATE,
  EXPIRED_CERTIFICATE,
  NOT_YET_VALID_CERTIFICATE,
  SAMPLE_CERTIFICATE,
} from './certificateDecoder.samples.js';

const SAMPLE_DN =
  'C=KR, ST=Seoul, L=Gangnam, O=Dev Toolkit, OU=Engineering, CN=devtoolkit.example';

const CORRUPT_BLOCK = '-----BEGIN CERTIFICATE-----\nMAUCAQEFAA==\n-----END CERTIFICATE-----';

/** The sample fixture's validity window, read straight from its PEM text. */
const SAMPLE_NOT_BEFORE = Date.parse('2026-08-12T04:08:20Z');
const SAMPLE_NOT_AFTER = Date.parse('2036-08-09T04:08:20Z');

/**
 * Every test runs at a fixed instant inside the sample fixture's window, so the
 * `Valid` assertions below describe the fixture rather than today's date and do
 * not start failing once 2036-08-09 passes.
 */
const FIXED_NOW = Date.parse('2030-01-01T00:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED_NOW });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function pasteCertificate(value) {
  fireEvent.change(screen.getByLabelText('PEM certificate'), { target: { value } });
}

describe('CertificateDecoderTool', () => {
  it('starts empty and states that parsing is local', () => {
    render(<CertificateDecoderTool />);
    expect(screen.getByLabelText('PEM certificate')).toHaveValue('');
    expect(screen.getByText(/Paste one or more PEM certificate blocks/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is uploaded/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('decodes the sample certificate loaded from the toolbar', () => {
    render(<CertificateDecoderTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load sample certificate' }));

    expect(screen.getByLabelText('PEM certificate')).toHaveValue(SAMPLE_CERTIFICATE);
    // Subject and issuer are identical because the fixture is self-issued.
    expect(screen.getAllByText(SAMPLE_DN)).toHaveLength(2);
    expect(
      screen.getByText('18:FA:A9:45:B4:DD:E0:AC:19:6A:16:67:F1:65:B8:5D:69:8F:C5:F7'),
    ).toBeInTheDocument();
    expect(screen.getByText('2026-08-12T04:08:20Z')).toBeInTheDocument();
    expect(screen.getByText('2036-08-09T04:08:20Z')).toBeInTheDocument();
    expect(screen.getByText('sha256WithRSAEncryption')).toBeInTheDocument();
    expect(screen.getByText('RSA · 2048 bit')).toBeInTheDocument();
    expect(screen.getByText('CA: true')).toBeInTheDocument();
    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 of 1 certificate block(s) decoded.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lists every subject alternative name of the sample certificate', () => {
    render(<CertificateDecoderTool />);
    pasteCertificate(SAMPLE_CERTIFICATE);

    const sanList = screen.getByLabelText('Subject alternative names 1');
    expect(sanList).toBeInTheDocument();
    expect(screen.getByText('www.devtoolkit.example')).toBeInTheDocument();
    expect(screen.getByText('127.0.0.1')).toBeInTheDocument();
    expect(screen.getByText('dev@devtoolkit.example')).toBeInTheDocument();
    expect(sanList.querySelectorAll('li')).toHaveLength(4);
  });

  it('flags an expired certificate', () => {
    render(<CertificateDecoderTool />);
    pasteCertificate(EXPIRED_CERTIFICATE);

    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText(/^Expired .+ ago\.$/)).toBeInTheDocument();
    expect(
      screen.getAllByText(
        'C=US, ST=California, L=San Francisco, O=Expired Corp, CN=expired.example',
      ),
    ).toHaveLength(2);
    expect(screen.getByText('CA: false')).toBeInTheDocument();
  });

  it('flags a not-yet-valid certificate', () => {
    render(<CertificateDecoderTool />);
    pasteCertificate(NOT_YET_VALID_CERTIFICATE);

    expect(screen.getByText('Not yet valid')).toBeInTheDocument();
    expect(screen.getByText(/^Becomes valid in .+\.$/)).toBeInTheDocument();
    expect(screen.getByText('2090-01-01T00:00:00Z')).toBeInTheDocument();
  });

  it('shows the derived curve for an EC certificate', () => {
    render(<CertificateDecoderTool />);
    pasteCertificate(EC_CERTIFICATE);

    expect(screen.getByText('ecdsa-with-SHA256')).toBeInTheDocument();
    expect(screen.getByText('EC · 256 bit · prime256v1 (P-256)')).toBeInTheDocument();
  });

  it('renders one card per certificate in a concatenated chain', () => {
    render(<CertificateDecoderTool />);
    pasteCertificate(`${SAMPLE_CERTIFICATE}\n${EC_CERTIFICATE}`);

    expect(screen.getByRole('heading', { name: /Certificate 1 — devtoolkit\.example/ }))
      .toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Certificate 2 — ec\.example/ }))
      .toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 of 2 certificate block(s) decoded.');
  });

  it('shows an inline error for text without PEM armour', () => {
    render(<CertificateDecoderTool />);
    pasteCertificate('this is definitely not a certificate');

    expect(screen.getByRole('alert')).toHaveTextContent(/No PEM certificate found/);
    expect(screen.queryByRole('heading', { name: /Certificate 1/ })).not.toBeInTheDocument();
  });

  it('shows an inline error for truncated Base64 without crashing', () => {
    render(<CertificateDecoderTool />);
    const body = SAMPLE_CERTIFICATE.split('\n').slice(1, -1).join('').slice(0, 199);
    pasteCertificate(`-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`);

    expect(screen.getByRole('alert')).toHaveTextContent(/not valid Base64 data/);
  });

  it('isolates a corrupt block so the rest of the chain still renders', () => {
    render(<CertificateDecoderTool />);
    pasteCertificate(`${CORRUPT_BLOCK}\n${SAMPLE_CERTIFICATE}`);

    expect(screen.getByRole('alert')).toHaveTextContent(/missing its signature fields/);
    expect(screen.getByRole('heading', { name: /Certificate 2 — devtoolkit\.example/ }))
      .toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 certificate block(s) decoded.');
  });

  it('crosses the validity boundaries while the card stays open', () => {
    vi.setSystemTime(SAMPLE_NOT_BEFORE - 1000);
    render(<CertificateDecoderTool />);
    pasteCertificate(SAMPLE_CERTIFICATE);
    expect(screen.getByText('Not yet valid')).toBeInTheDocument();

    // No further input: only the decoded-state timer moves the badge along.
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(screen.queryByText('Not yet valid')).not.toBeInTheDocument();

    vi.setSystemTime(SAMPLE_NOT_AFTER - 1000);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('Valid')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText(/^Expired .+ ago\.$/)).toBeInTheDocument();
  });

  it('keeps every card in a chain on one shared instant', () => {
    render(<CertificateDecoderTool />);
    pasteCertificate(`${SAMPLE_CERTIFICATE}\n${EC_CERTIFICATE}`);
    act(() => vi.advanceTimersByTime(5000));

    expect(screen.getAllByText('Valid')).toHaveLength(2);
  });

  it('stops the validity timer once the decoded state ends', () => {
    const clearInterval = vi.spyOn(globalThis, 'clearInterval');
    render(<CertificateDecoderTool />);
    pasteCertificate(SAMPLE_CERTIFICATE);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    pasteCertificate('');
    expect(clearInterval).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    clearInterval.mockRestore();
  });

  it('clears the previous result when the input is emptied', () => {
    render(<CertificateDecoderTool />);
    pasteCertificate(SAMPLE_CERTIFICATE);
    expect(screen.getByText('Valid')).toBeInTheDocument();

    pasteCertificate('');
    expect(screen.queryByText('Valid')).not.toBeInTheDocument();
    expect(screen.getByText(/Paste one or more PEM certificate blocks/)).toBeInTheDocument();
  });
});
