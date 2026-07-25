import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/analytics', () => ({
  emit: vi.fn(),
  hasConsent: vi.fn(() => true),
  FunnelEvent: {
    FIRST_OPEN: 'first_open',
    ONBOARDING_START: 'onboarding_start',
    CUSTODY_PATH_CHOSEN: 'custody_path_chosen',
    SEED_GENERATED: 'seed_generated',
    SEED_REVEALED: 'seed_revealed',
    SEED_BACKUP_ACKNOWLEDGED: 'seed_backup_acknowledged',
    SEED_VERIFY_STARTED: 'seed_verify_started',
    SEED_VERIFY_ATTEMPT: 'seed_verify_attempt',
    SEED_VERIFY_PASSED: 'seed_verify_passed',
    SEED_VERIFY_FAILED: 'seed_verify_failed',
    SEED_VERIFY_DEFERRED: 'seed_verify_deferred',
    LOCK_METHOD_SET: 'lock_method_set',
    WALLET_READY: 'wallet_ready',
    FIRST_INBOUND_DETECTED: 'first_inbound_detected',
    SEND_FLOW_STARTED: 'send_flow_started',
    SEND_STEP_REACHED: 'send_step_reached',
    SEND_ABANDONED: 'send_abandoned',
    FIRST_SEND: 'first_send',
    UNLOCK_ATTEMPT: 'unlock_attempt',
    UNLOCK_RESULT: 'unlock_result',
    CRYPTO_DIAGNOSTICS: 'crypto_diagnostics',
    TAMPER_SIGNAL: 'tamper_signal',
    SECURITY_MODAL_SHOWN: 'security_modal_shown',
    KEK_UNWRAP_FAILED: 'kek_unwrap_failed',
    DAPP_CONNECT_START: 'dapp_connect_start',
    DAPP_CONNECT_RESULT: 'dapp_connect_result',
  },
}));

vi.mock('@/lib/holdout', () => ({
  assignHoldout: vi.fn(),
  isInHoldout: vi.fn(() => false),
}));

const scheduleMock = vi.fn(() => Promise.resolve());
const cancelMock = vi.fn(() => Promise.resolve());
let isNative = true;

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNative,
  },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    schedule: (...args) => scheduleMock(...args),
    cancel: (...args) => cancelMock(...args),
  },
}));

import { emit } from '@/lib/analytics';
import { assignHoldout } from '@/lib/holdout';

describe('tracking-integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    isNative = true;
  });

  it('useFirstOpen fires only once', async () => {
    const { useFirstOpen } = await import('@/lib/tracking-integration');
    renderHook(() => useFirstOpen());
    expect(emit).toHaveBeenCalledWith('first_open');
    vi.clearAllMocks();
    renderHook(() => useFirstOpen());
    expect(emit).not.toHaveBeenCalled();
  });

  it('useWalletReady assigns holdout', async () => {
    const { useWalletReady } = await import('@/lib/tracking-integration');
    renderHook(() => useWalletReady());
    expect(assignHoldout).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('wallet_ready');
  });

  it('useWalletReady only fires once per install', async () => {
    const { useWalletReady } = await import('@/lib/tracking-integration');
    renderHook(() => useWalletReady());
    vi.clearAllMocks();
    renderHook(() => useWalletReady());
    expect(assignHoldout).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('useFirstInbound fires on first non-zero balance', async () => {
    const { useFirstInbound } = await import('@/lib/tracking-integration');
    const { rerender } = renderHook(({ b }) => useFirstInbound(b), { initialProps: { b: 0 } });
    expect(emit).not.toHaveBeenCalledWith('first_inbound_detected', expect.anything());
    rerender({ b: 0.5 });
    expect(emit).toHaveBeenCalledWith('first_inbound_detected', { balance: 0.5 });
  });

  it('useFirstInbound does not fire twice', async () => {
    const { useFirstInbound } = await import('@/lib/tracking-integration');
    const { rerender } = renderHook(({ b }) => useFirstInbound(b), { initialProps: { b: 0.5 } });
    expect(emit).toHaveBeenCalledTimes(1);
    rerender({ b: 1.5 });
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('useFirstSend returns a callback that fires once', async () => {
    const { useFirstSend } = await import('@/lib/tracking-integration');
    const { result } = renderHook(() => useFirstSend());
    act(() => result.current());
    expect(emit).toHaveBeenCalledWith('first_send');
    vi.clearAllMocks();
    act(() => result.current());
    expect(emit).not.toHaveBeenCalled();
  });

  it('useOnboardingStart fires on mount', async () => {
    const { useOnboardingStart } = await import('@/lib/tracking-integration');
    renderHook(() => useOnboardingStart());
    expect(emit).toHaveBeenCalledWith('onboarding_start');
  });

  it('useCryptoDiagnostics fires when crypto.subtle is missing', async () => {
    const original = window.crypto;
    Object.defineProperty(window, 'crypto', { value: {}, configurable: true });
    const { useCryptoDiagnostics } = await import('@/lib/tracking-integration');
    renderHook(() => useCryptoDiagnostics());
    expect(emit).toHaveBeenCalledWith('crypto_diagnostics', expect.objectContaining({ hasSubtleCrypto: false }));
    Object.defineProperty(window, 'crypto', { value: original, configurable: true });
  });

  it('useCryptoDiagnostics does not fire when environment is healthy', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    const { useCryptoDiagnostics } = await import('@/lib/tracking-integration');
    renderHook(() => useCryptoDiagnostics());
    expect(emit).not.toHaveBeenCalled();
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
  });

  it('useCustodyPathChosen emits with path', async () => {
    const { useCustodyPathChosen } = await import('@/lib/tracking-integration');
    const { result } = renderHook(() => useCustodyPathChosen());
    act(() => result.current('create'));
    expect(emit).toHaveBeenCalledWith('custody_path_chosen', { path: 'create' });
  });

  it('useSeedGenerated fires when ready flips true', async () => {
    const { useSeedGenerated } = await import('@/lib/tracking-integration');
    const { rerender } = renderHook(({ ready }) => useSeedGenerated(ready), { initialProps: { ready: false } });
    expect(emit).not.toHaveBeenCalled();
    rerender({ ready: true });
    expect(emit).toHaveBeenCalledWith('seed_generated');
    vi.clearAllMocks();
    rerender({ ready: true });
    expect(emit).not.toHaveBeenCalled();
  });

  it('useSeedRevealed / useSeedBackupAcknowledged return callbacks', async () => {
    const { useSeedRevealed, useSeedBackupAcknowledged } = await import('@/lib/tracking-integration');
    const { result: r1 } = renderHook(() => useSeedRevealed());
    const { result: r2 } = renderHook(() => useSeedBackupAcknowledged());
    act(() => r1.current());
    act(() => r2.current());
    expect(emit).toHaveBeenCalledWith('seed_revealed');
    expect(emit).toHaveBeenCalledWith('seed_backup_acknowledged');
  });

  it('useSeedVerification returns all callbacks', async () => {
    const { useSeedVerification } = await import('@/lib/tracking-integration');
    const { result } = renderHook(() => useSeedVerification());
    act(() => result.current.started());
    act(() => result.current.attempt());
    act(() => result.current.passed());
    act(() => result.current.failed());
    act(() => result.current.deferred());
    expect(emit).toHaveBeenCalledWith('seed_verify_started');
    expect(emit).toHaveBeenCalledWith('seed_verify_attempt');
    expect(emit).toHaveBeenCalledWith('seed_verify_passed');
    expect(emit).toHaveBeenCalledWith('seed_verify_failed');
    expect(emit).toHaveBeenCalledWith('seed_verify_deferred');
  });

  it('useLockMethodSet emits with method', async () => {
    const { useLockMethodSet } = await import('@/lib/tracking-integration');
    const { result } = renderHook(() => useLockMethodSet());
    act(() => result.current('biometric'));
    expect(emit).toHaveBeenCalledWith('lock_method_set', { method: 'biometric' });
  });

  it('useSendFlowTracking returns start/stepReached/abandon/confirm', async () => {
    const { useSendFlowTracking } = await import('@/lib/tracking-integration');
    const { result } = renderHook(() => useSendFlowTracking());
    act(() => result.current.start());
    act(() => result.current.stepReached('amount'));
    act(() => result.current.abandon('amount'));
    act(() => result.current.confirm());
    expect(emit).toHaveBeenCalledWith('send_flow_started');
    expect(emit).toHaveBeenCalledWith('send_step_reached', { step: 'amount' });
    expect(emit).toHaveBeenCalledWith('send_abandoned', { step: 'amount' });
    expect(emit).toHaveBeenCalledWith('first_send');
  });

  it('useUnlockTracking returns attempt/result', async () => {
    const { useUnlockTracking } = await import('@/lib/tracking-integration');
    const { result } = renderHook(() => useUnlockTracking());
    act(() => result.current.attempt('pin'));
    act(() => result.current.result('pin', true));
    expect(emit).toHaveBeenCalledWith('unlock_attempt', { method: 'pin' });
    expect(emit).toHaveBeenCalledWith('unlock_result', { method: 'pin', success: true });
  });

  it('useDappConnectTracking returns start/result', async () => {
    const { useDappConnectTracking } = await import('@/lib/tracking-integration');
    const { result } = renderHook(() => useDappConnectTracking());
    act(() => result.current.start('example.com'));
    act(() => result.current.result('example.com', false));
    expect(emit).toHaveBeenCalledWith('dapp_connect_start', { origin: 'example.com' });
    expect(emit).toHaveBeenCalledWith('dapp_connect_result', { origin: 'example.com', success: false });
  });

  it('standalone emitters fire the right events', async () => {
    const { emitTamperSignal, emitSecurityModal, emitKekUnwrapFailed } = await import('@/lib/tracking-integration');
    emitTamperSignal('frida-detected');
    emitSecurityModal('unlock-screen');
    emitKekUnwrapFailed();
    expect(emit).toHaveBeenCalledWith('tamper_signal', { signal: 'frida-detected' });
    expect(emit).toHaveBeenCalledWith('security_modal_shown', { source: 'unlock-screen' });
    expect(emit).toHaveBeenCalledWith('kek_unwrap_failed');
  });

  it('scheduleFundingReminders schedules notifications 9001/9002 on native', async () => {
    const { scheduleFundingReminders } = await import('@/lib/tracking-integration');
    await scheduleFundingReminders();
    expect(scheduleMock).toHaveBeenCalledTimes(1);
    const arg = scheduleMock.mock.calls[0][0];
    const ids = arg.notifications.map((n) => n.id);
    expect(ids).toEqual([9001, 9002]);
    for (const n of arg.notifications) {
      expect(n.body.toLowerCase()).not.toMatch(/verify|confirm|action required|suspended|at risk/);
      expect(n.body).not.toMatch(/https?:\/\//);
    }
  });

  it('cancelFundingReminders cancels 9001/9002', async () => {
    const { cancelFundingReminders } = await import('@/lib/tracking-integration');
    await cancelFundingReminders();
    expect(cancelMock).toHaveBeenCalledWith({ notifications: [{ id: 9001 }, { id: 9002 }] });
  });

  it('scheduleVerificationReminders schedules notifications 9003/9004', async () => {
    const { scheduleVerificationReminders } = await import('@/lib/tracking-integration');
    await scheduleVerificationReminders();
    const arg = scheduleMock.mock.calls[0][0];
    const ids = arg.notifications.map((n) => n.id);
    expect(ids).toEqual([9003, 9004]);
  });

  it('cancelVerificationReminders cancels 9003/9004', async () => {
    const { cancelVerificationReminders } = await import('@/lib/tracking-integration');
    await cancelVerificationReminders();
    expect(cancelMock).toHaveBeenCalledWith({ notifications: [{ id: 9003 }, { id: 9004 }] });
  });

  it('notification schedulers no-op on web (non-native)', async () => {
    isNative = false;
    const { scheduleFundingReminders, cancelFundingReminders } = await import('@/lib/tracking-integration');
    await scheduleFundingReminders();
    await cancelFundingReminders();
    expect(scheduleMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
  });
});
