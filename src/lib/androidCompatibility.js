// @ts-nocheck
// Android compatibility classifier for vendor-specific security behavior.
//
// Purpose: turn the raw native diagnostics snapshot into a stable UI/policy shape
// so OEM-specific differences (Pixel StrongBox vs OnePlus TEE vs device-credential-
// only) are explicit and can drive honest copy and flow decisions.

export const ANDROID_COMPAT_CLASS = Object.freeze({
  STRONGBOX: 'strongbox',
  TEE: 'tee',
  DEVICE_CREDENTIAL_ONLY: 'device-credential-only',
  UNSUPPORTED: 'unsupported',
  UNKNOWN: 'unknown',
});

export function classifyAndroidCompatibility(snapshot) {
  if (!snapshot || snapshot.platform !== 'android') {
    return {
      className: ANDROID_COMPAT_CLASS.UNKNOWN,
      canAttemptEnrollment: false,
      showPreEnrollNotice: true,
      summary: null,
    };
  }

  if (snapshot.hardwareBacking === 'strongBox' && snapshot.biometryEnrolled) {
    return {
      className: ANDROID_COMPAT_CLASS.STRONGBOX,
      canAttemptEnrollment: true,
      showPreEnrollNotice: true,
      summary: 'This Android build reports StrongBox-backed hardware protection, which is closest to the Pixel reference path.',
    };
  }

  if (snapshot.hardwareBacking === 'tee' && snapshot.biometryEnrolled) {
    return {
      className: ANDROID_COMPAT_CLASS.TEE,
      canAttemptEnrollment: true,
      showPreEnrollNotice: true,
      summary: 'This Android build reports TEE-backed protection rather than StrongBox. That is supported, but vendor prompts and recovery behavior can differ from Pixel.',
    };
  }

  if (snapshot.deviceIsSecure && !snapshot.biometricAvailable) {
    return {
      className: ANDROID_COMPAT_CLASS.DEVICE_CREDENTIAL_ONLY,
      canAttemptEnrollment: false,
      showPreEnrollNotice: false,
      summary: 'This Android build has device credential security but no enrolled biometrics, so Veyrnox cannot enable hardware protection until biometrics are enrolled.',
    };
  }

  if (!snapshot.secureHardwareAvailable) {
    return {
      className: ANDROID_COMPAT_CLASS.UNSUPPORTED,
      canAttemptEnrollment: false,
      showPreEnrollNotice: false,
      summary: 'This Android build does not currently report a hardware-backed biometric path that Veyrnox can rely on, so behavior will differ from a Pixel-style secure-hardware flow.',
    };
  }

  return {
    className: ANDROID_COMPAT_CLASS.UNKNOWN,
    canAttemptEnrollment: false,
    showPreEnrollNotice: true,
    summary: 'This Android build reported an incomplete security profile. You can retry after an OS update or use password-only protection for now.',
  };
}
