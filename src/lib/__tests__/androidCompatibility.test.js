import { describe, it, expect } from 'vitest';
import { classifyAndroidCompatibility, ANDROID_COMPAT_CLASS } from '@/lib/androidCompatibility';

describe('classifyAndroidCompatibility', () => {
  it('classifies StrongBox devices as full enrollment-capable', () => {
    const result = classifyAndroidCompatibility({
      platform: 'android',
      hardwareBacking: 'strongBox',
      biometryEnrolled: true,
      biometricAvailable: true,
      deviceIsSecure: true,
      secureHardwareAvailable: true,
    });
    expect(result.className).toBe(ANDROID_COMPAT_CLASS.STRONGBOX);
    expect(result.canAttemptEnrollment).toBe(true);
  });

  it('classifies TEE devices as supported enrollment-capable', () => {
    const result = classifyAndroidCompatibility({
      platform: 'android',
      hardwareBacking: 'tee',
      biometryEnrolled: true,
      biometricAvailable: true,
      deviceIsSecure: true,
      secureHardwareAvailable: true,
    });
    expect(result.className).toBe(ANDROID_COMPAT_CLASS.TEE);
    expect(result.canAttemptEnrollment).toBe(true);
  });

  it('classifies device-credential-only devices as non-enrollable', () => {
    const result = classifyAndroidCompatibility({
      platform: 'android',
      hardwareBacking: 'none',
      biometryEnrolled: false,
      biometricAvailable: false,
      deviceIsSecure: true,
      secureHardwareAvailable: false,
    });
    expect(result.className).toBe(ANDROID_COMPAT_CLASS.DEVICE_CREDENTIAL_ONLY);
    expect(result.canAttemptEnrollment).toBe(false);
  });

  it('classifies unsupported devices as fallback-only', () => {
    const result = classifyAndroidCompatibility({
      platform: 'android',
      hardwareBacking: 'none',
      biometryEnrolled: false,
      biometricAvailable: false,
      deviceIsSecure: false,
      secureHardwareAvailable: false,
    });
    expect(result.className).toBe(ANDROID_COMPAT_CLASS.UNSUPPORTED);
    expect(result.canAttemptEnrollment).toBe(false);
  });
});
