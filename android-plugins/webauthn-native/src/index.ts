import { registerPlugin } from '@capacitor/core';

const WebAuthnNative = registerPlugin('WebAuthnNative');

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
  if (!window.Capacitor?.isNativePlatform?.()) {
    // Fall back to native WebAuthn on web
    return navigator.credentials?.create(options);
  }

  try {
    const userId = new TextDecoder().decode(options.publicKey.user.id);

    const result = await WebAuthnNative.registerCredential({
      userId: userId
    });

    // Transform native response to WebAuthn format
    return {
      id: result.credentialId,
      rawId: new Uint8Array(atob(result.credentialId).split('').map(c => c.charCodeAt(0))),
      response: {
        clientDataJSON: new Uint8Array(atob(result.clientDataJSON).split('').map(c => c.charCodeAt(0))),
        attestationObject: new Uint8Array(atob(result.attestationObject).split('').map(c => c.charCodeAt(0)))
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
  if (!window.Capacitor?.isNativePlatform?.()) {
    // Fall back to native WebAuthn on web
    return navigator.credentials?.get(options);
  }

  try {
    const challenge = new TextDecoder().decode(options.publicKey.challenge);
    const allowCredentials = options.publicKey.allowCredentials || [];
    const credentialId = allowCredentials[0]?.id ?
      btoa(String.fromCharCode(...new Uint8Array(allowCredentials[0].id))) :
      'default';

    const result = await WebAuthnNative.authenticateCredential({
      credentialId: credentialId,
      challenge: challenge
    });

    // Transform native response to WebAuthn format
    return {
      id: credentialId,
      rawId: new Uint8Array(atob(credentialId).split('').map(c => c.charCodeAt(0))),
      response: {
        clientDataJSON: new Uint8Array(atob(result.clientDataJSON).split('').map(c => c.charCodeAt(0))),
        authenticatorData: new Uint8Array(atob(result.authenticatorData).split('').map(c => c.charCodeAt(0))),
        signature: new Uint8Array(atob(result.signature).split('').map(c => c.charCodeAt(0)))
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
  if (!window.Capacitor?.isNativePlatform?.()) {
    return; // Not on native, use real WebAuthn
  }

  // Save original credentials interface
  const originalCredentials = navigator.credentials;

  // Polyfill credentials.create()
  const originalCreate = originalCredentials.create.bind(originalCredentials);
  navigator.credentials.create = async function(options: any) {
    if (options?.publicKey) {
      return polyfillCreate(options);
    }
    return originalCreate(options);
  };

  // Polyfill credentials.get()
  const originalGet = originalCredentials.get.bind(originalCredentials);
  navigator.credentials.get = async function(options: any) {
    if (options?.publicKey) {
      return polyfillGet(options);
    }
    return originalGet(options);
  };

  console.log('[WebAuthn] Polyfill installed for Capacitor native');
}

export { WebAuthnNative };
