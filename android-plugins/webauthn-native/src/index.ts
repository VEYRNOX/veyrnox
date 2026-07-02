import { registerPlugin, Capacitor } from '@capacitor/core';

interface WebAuthnNativePlugin {
  registerCredential(options: { userId: string }): Promise<any>;
  authenticateCredential(options: { credentialId: string; challenge: string }): Promise<any>;
}

const WebAuthnNative = registerPlugin<WebAuthnNativePlugin>('WebAuthnNative');

/**
 * WebAuthn Polyfill for Capacitor
 * Bridges native WebAuthn to Capacitor's biometric + keystore
 */

interface CredentialCreationOptions {
  publicKey: PublicKeyCredentialCreationOptions;
}

interface CredentialRequestOptions {
  publicKey: PublicKeyCredentialRequestOptions;
}

/**
 * Polyfill PublicKeyCredential.create() for Capacitor
 */
async function polyfillCreate(options: CredentialCreationOptions): Promise<any> {
  if (!Capacitor.isNativePlatform()) {
    // Fall back to native WebAuthn on web
    return navigator.credentials?.create(options);
  }

  try {
    const userId = new TextDecoder().decode(new Uint8Array(options.publicKey.user.id as any));

    const result = await WebAuthnNative.registerCredential({
      userId: userId
    });

    // Transform native response to WebAuthn format
    const decodeBase64 = (str: string): Uint8Array => {
      const chars = atob(str);
      const codes = Array.from(chars).map((c: string) => c.charCodeAt(0));
      return new Uint8Array(codes as any);
    };
    return {
      id: result.credentialId,
      rawId: decodeBase64(result.credentialId),
      response: {
        clientDataJSON: decodeBase64(result.clientDataJSON),
        attestationObject: decodeBase64(result.attestationObject)
      },
      type: 'public-key'
    };
  } catch (error) {
    throw new Error(`WebAuthn registration failed: ${error}`);
  }
}

/**
 * Polyfill PublicKeyCredential.get() for Capacitor
 */
async function polyfillGet(options: CredentialRequestOptions): Promise<any> {
  if (!Capacitor.isNativePlatform()) {
    // Fall back to native WebAuthn on web
    return navigator.credentials?.get(options);
  }

  try {
    const challenge = new TextDecoder().decode(new Uint8Array(options.publicKey.challenge as any));
    const allowCredentials = options.publicKey.allowCredentials || [];
    const credentialId = allowCredentials[0]?.id ?
      btoa(String.fromCharCode(...Array.from(new Uint8Array(allowCredentials[0].id as any)))) :
      'default';

    const result = await WebAuthnNative.authenticateCredential({
      credentialId: credentialId,
      challenge: challenge
    });

    // Transform native response to WebAuthn format
    const decodeBase64 = (str: string): Uint8Array => {
      const chars = atob(str);
      const codes = Array.from(chars).map((c: string) => c.charCodeAt(0));
      return new Uint8Array(codes as any);
    };
    return {
      id: credentialId,
      rawId: decodeBase64(credentialId),
      response: {
        clientDataJSON: decodeBase64(result.clientDataJSON),
        authenticatorData: decodeBase64(result.authenticatorData),
        signature: decodeBase64(result.signature)
      },
      type: 'public-key'
    };
  } catch (error) {
    throw new Error(`WebAuthn authentication failed: ${error}`);
  }
}

/**
 * Install polyfill on Capacitor
 */
export function installWebAuthnPolyfill() {
  if (!Capacitor.isNativePlatform()) {
    return; // Not on native, use real WebAuthn
  }

  // Save original credentials interface
  const originalCredentials = navigator.credentials;

  // Polyfill credentials.create()
  const originalCreate = originalCredentials.create?.bind(originalCredentials);
  if (navigator.credentials && 'create' in navigator.credentials) {
    navigator.credentials.create = async function(options: any) {
      if (options?.publicKey) {
        return polyfillCreate(options);
      }
      return originalCreate?.(options);
    };
  }

  // Polyfill credentials.get()
  const originalGet = originalCredentials.get?.bind(originalCredentials);
  if (navigator.credentials && 'get' in navigator.credentials) {
    navigator.credentials.get = async function(options: any) {
      if (options?.publicKey) {
        return polyfillGet(options);
      }
      return originalGet?.(options);
    };
  }

  console.log('[WebAuthn] Polyfill installed for Capacitor native');
}

export { WebAuthnNative };
