import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SshKeyInspectorTool from './SshKeyInspectorTool.jsx';

const ED25519 = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKR7HT7Y0OdN11ZKsP5SMfHnsprQOnJlIlkv7Aw7Y4YC '
  + 'fixture@example.com';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SshKeyInspectorTool', () => {
  it('renders a decoded key with both fingerprint formats', async () => {
    render(<SshKeyInspectorTool />);
    fireEvent.change(screen.getByLabelText('OpenSSH public keys'), {
      target: { value: ED25519 },
    });
    expect(await screen.findByRole('heading', { name: 'ED25519' })).toBeInTheDocument();
    expect(screen.getByText('256-bit')).toBeInTheDocument();
    expect(screen.getByText('fixture@example.com')).toBeInTheDocument();
    expect(screen.getByText(/SHA256:ebmwR91/)).toBeInTheDocument();
    expect(screen.getByText(/MD5:a8:06:5c/)).toBeInTheDocument();
  });

  it('copies an individual fingerprint and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<SshKeyInspectorTool />);
    fireEvent.change(screen.getByLabelText('OpenSSH public keys'), { target: { value: ED25519 } });
    await screen.findByRole('heading', { name: 'ED25519' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy SHA-256' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^SHA256:/)));
    expect(screen.getByRole('status')).toHaveTextContent('Copied SHA-256 fingerprint.');
  });

  it('reports a clipboard failure without removing decoded results', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<SshKeyInspectorTool />);
    fireEvent.change(screen.getByLabelText('OpenSSH public keys'), { target: { value: ED25519 } });
    await screen.findByRole('heading', { name: 'ED25519' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy MD5' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
    expect(screen.getByRole('heading', { name: 'ED25519' })).toBeInTheDocument();
  });

  it('refuses a private-key block without attempting public-key parsing', async () => {
    render(<SshKeyInspectorTool />);
    fireEvent.change(screen.getByLabelText('OpenSSH public keys'), {
      target: { value: '-----BEGIN RSA PRIVATE KEY-----\nsecret\n-----END RSA PRIVATE KEY-----' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Private keys are not supported.');
    expect(screen.queryByRole('heading', { name: 'RSA' })).not.toBeInTheDocument();
  });

  it('keeps valid and malformed lines in original order while skipping comments', async () => {
    render(<SshKeyInspectorTool />);
    fireEvent.change(screen.getByLabelText('OpenSSH public keys'), {
      target: { value: `${ED25519}\nssh-ed25519 AAAA\n# ignored\n` },
    });
    await screen.findByRole('heading', { name: 'ED25519' });
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
