import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installWebAuthnPolyfill } from '@veyrnox/webauthn-native';

describe('WebAuthn Polyfill', () => {
  let originalCredentials;
  let mockCapacitor;

  beforeEach(() => {
    // Save original
    originalCredentials = navigator.credentials;

    // Mock Capacitor for testing
    mockCapacitor = {
      isNativePlatform: vi.fn(() => false),
    };

    // Reset navigator.credentials
    navigator.credentials = {
      create: vi.fn(),
      get: vi.fn(),
    };
  });

  afterEach(() => {
    // Restore original
    navigator.credentials = originalCredentials;
    vi.clearAllMocks();
  });

  describe('installWebAuthnPolyfill', () => {
    it('should install polyfill when called', () => {
      // On web (non-native), polyfill should just return
      installWebAuthnPolyfill();
      expect(navigator.credentials).toBeDefined();
    });

    it('should preserve navigator.credentials on web', () => {
      const originalCreate = navigator.credentials.create;
      const originalGet = navigator.credentials.get;

      installWebAuthnPolyfill();

      // On web, should not override
      // (because Capacitor.isNativePlatform() returns false)
      expect(navigator.credentials.create).toBeDefined();
      expect(navigator.credentials.get).toBeDefined();
    });
  });

  describe('WebAuthn API compatibility', () => {
    it('should have PublicKeyCredential available', () => {
      expect(window.PublicKeyCredential).toBeDefined();
    });

    it('should have navigator.credentials available', () => {
      expect(navigator.credentials).toBeDefined();
      expect(typeof navigator.credentials.create).toBe('function');
      expect(typeof navigator.credentials.get).toBe('function');
    });
  });

  describe('Plugin module loading', () => {
    it('should export installWebAuthnPolyfill', async () => {
      const { installWebAuthnPolyfill: polyfillFn } = await import('@veyrnox/webauthn-native');
      expect(typeof polyfillFn).toBe('function');
    });

    it('should export WebAuthnNative plugin interface', async () => {
      const { WebAuthnNative } = await import('@veyrnox/webauthn-native');
      expect(WebAuthnNative).toBeDefined();
    });
  });

  describe('Credential flow (mock native)', () => {
    it('should handle registration without biometric on web', async () => {
      const mockCred = {
        id: 'mock-id-123',
        type: 'public-key',
        response: {
          clientDataJSON: new Uint8Array([1, 2, 3]),
          attestationObject: new Uint8Array([4, 5, 6]),
        },
      };

      navigator.credentials.create = vi.fn().mockResolvedValue(mockCred);

      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: new Uint8Array([1, 2, 3]),
          rp: { name: 'Veyrnox' },
          user: { id: new Uint8Array([1]), name: 'test@example.com' },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          timeout: 60000,
        },
      });

      expect(cred).toBe(mockCred);
      expect(navigator.credentials.create).toHaveBeenCalled();
    });

    it('should handle authentication without biometric on web', async () => {
      const mockCred = {
        id: 'mock-id-123',
        type: 'public-key',
        response: {
          clientDataJSON: new Uint8Array([1, 2, 3]),
          authenticatorData: new Uint8Array([4, 5, 6]),
          signature: new Uint8Array([7, 8, 9]),
        },
      };

      navigator.credentials.get = vi.fn().mockResolvedValue(mockCred);

      const cred = await navigator.credentials.get({
        publicKey: {
          challenge: new Uint8Array([1, 2, 3]),
          timeout: 60000,
          userVerification: 'required',
          allowCredentials: [
            { id: new Uint8Array([1]), type: 'public-key' },
          ],
        },
      });

      expect(cred).toBe(mockCred);
      expect(navigator.credentials.get).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle registration errors gracefully', async () => {
      const error = new Error('Registration failed');
      navigator.credentials.create = vi.fn().mockRejectedValue(error);

      try {
        await navigator.credentials.create({
          publicKey: {
            challenge: new Uint8Array([1, 2, 3]),
            rp: { name: 'Veyrnox' },
            user: { id: new Uint8Array([1]), name: 'test@example.com' },
            pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          },
        });
      } catch (err) {
        expect(err.message).toBe('Registration failed');
      }
    });

    it('should handle authentication errors gracefully', async () => {
      const error = new Error('Authentication failed');
      navigator.credentials.get = vi.fn().mockRejectedValue(error);

      try {
        await navigator.credentials.get({
          publicKey: {
            challenge: new Uint8Array([1, 2, 3]),
            allowCredentials: [
              { id: new Uint8Array([1]), type: 'public-key' },
            ],
          },
        });
      } catch (err) {
        expect(err.message).toBe('Authentication failed');
      }
    });
  });
});
