import { describe, expect, it } from 'vitest';
import { computeFingerprints, decodeOpenSshPublicKey } from './sshKeyInspector.utils.js';

const ED25519 = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKR7HT7Y0OdN11ZKsP5SMfHnsprQOnJlIlkv7Aw7Y4YC '
  + 'fixture@example.com';
const RSA = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCwm3vMmDCTQhLg8EpirEYofnvgDuxhEOUgV4SKuZ8'
  + 'JPbeR4B4YHxjOpxo7N4POmG+FCrZcXz6bNDZryMyMFgTPwYz4dNjnTjcbTu0YP6vCeTZ3wVQ5/9SXV25bkMl'
  + 'YL/lCCUNnvf9/3aJUKm24KTZK/Ui5nny6489gvQ2CyW5MUHHD2nNW/6lDwjZ4pceWSk3F01D+jt61KL06ai0u'
  + 'XVWiSLw1THdP4t4YXkfhqLiNbAJrgsSS5h8SRBygKDk9N1vbWcLXk42ChG76ZFZeg2tznS3N1zLIuf6yKJVLwu'
  + 'XgMSJv8Ezs2J0qvBS2KeBwaNF+djqxlVKm4gnizctuXDnh fixture@example.com';
const ECDSA = 'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBHM+pKmJbesN'
  + 'olpmbUzkMxD1EMQ28ttGklEuxJsYl/uXCtabpvwiayyXM9dbYo8Or8fEn7lkc644K46CyZeKbTg= '
  + 'fixture@example.com';
const DSA = 'ssh-dss AAAAB3NzaC1kc3MAAACBANBuAqdGrt6oE132vijZXa5eIi4rIEVntuLDxEe3pn9uO2h/'
  + 'HSfljRfyQLvIiSILLzXzon+GpOEhhLL9u0DbJOah4Nqt0/4AchAC1exFRo6MEuNGwK4DAdZe/JCQ/ItQ9W0mU'
  + 'IbpUqXfgocK6R8p4rlqTYzpWIkS0Ny1rf7m2B1JAAAAFQD1lJduxWsFLbV5K/t8rRgB6HZKQwAAAIBO2R9pz'
  + 'uc9zPlzqQyI34I9iXcEbBYTj97OaTCZ1hIl8llVmLL/gy7sOR3gPHQAF90sduKbNkbHIe6xZxvVD+Uv6/ifl09'
  + 'RLZICAykYcMDCtWC+8elpPQw/VDwCjdkXyFF86O8SjmPk8cox2vOOG7njsZfDSG+TZgH6XP3DjbRTXwAAAIBer'
  + 'OdCLEBHkOu/on8rtq/i22UdVZ5YwkIokcKwkd07cBtxkRD3o4zoN0ydbYLUGeOL8fv8pH2Q1trC13L+ZJi0yMi'
  + 'm2AMOLJm8n/BL7HRdojvbS1bjW2KIGyxSc213/HtEg9zsR0l6a9BKUxNfiLPoe/9VqGbZyLc7yt91y09A/Q== '
  + 'fixture@example.com';

describe('sshKeyInspector.utils', () => {
  it('decodes an ED25519 key and produces ssh-keygen fingerprints', async () => {
    const decoded = decodeOpenSshPublicKey(ED25519);
    expect(decoded).toMatchObject({
      keyType: 'ssh-ed25519',
      bitSize: 256,
      comment: 'fixture@example.com',
    });
    await expect(computeFingerprints(decoded.blobBytes)).resolves.toEqual({
      sha256: 'SHA256:ebmwR91rih3H6LVzNXdF9Okyiu6-ChYLI4J4q9wtHFU',
      md5: 'MD5:a8:06:5c:38:65:01:c6:e8:4e:cb:da:0e:d3:fb:34:21',
    });
  });

  it('reports the RSA modulus bit size and ssh-keygen fingerprints', async () => {
    const decoded = decodeOpenSshPublicKey(RSA);
    expect(decoded).toMatchObject({ keyType: 'ssh-rsa', bitSize: 2048 });
    await expect(computeFingerprints(decoded.blobBytes)).resolves.toEqual({
      sha256: 'SHA256:bee575mceD-gkMu6PYi-G0W9-l4xP0_EPsM0_FvcFX8',
      md5: 'MD5:6e:f7:02:a7:45:20:b4:5a:af:ca:90:55:6a:6e:6f:32',
    });
  });

  it('decodes ECDSA curves and DSA prime sizes', () => {
    expect(decodeOpenSshPublicKey(ECDSA)).toMatchObject({ curve: 'nistp256', bitSize: 256 });
    expect(decodeOpenSshPublicKey(DSA)).toMatchObject({ keyType: 'ssh-dss', bitSize: 1024 });
  });

  it('returns errors instead of throwing for unsupported and malformed input', () => {
    expect(() => decodeOpenSshPublicKey('ssh-unknown AAAA')).not.toThrow();
    expect(decodeOpenSshPublicKey('ssh-unknown AAAA')).toHaveProperty('error');
    expect(() => decodeOpenSshPublicKey('ssh-ed25519 AAAA')).not.toThrow();
    expect(decodeOpenSshPublicKey('ssh-ed25519 AAAA')).toHaveProperty('error');
  });

  it('refuses private-key markers', () => {
    expect(decodeOpenSshPublicKey('-----BEGIN OPENSSH PRIVATE KEY-----')).toEqual({
      error: 'Private keys are not supported. Paste a public key line.',
    });
  });
});
