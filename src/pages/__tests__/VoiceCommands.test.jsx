// @ts-nocheck
// src/pages/__tests__/VoiceCommands.test.jsx
//
// Tests the VoiceCommands page (now driven by VoiceProvider/useVoice) plus the
// two security invariants the page/provider must hold:
//   - I2 (no silent data egress): an off-device egress disclosure is visible
//     BEFORE the user can enable voice — audio leaves the device to the OS/
//     cloud speech service. We assert a stable testid, not prose copy.
//   - I3 (deniability): when the vault is locked OR deniability (decoy/hidden)
//     mode is active, VoiceProvider stops listening and forces listening=false.
//
// The Capacitor speech plugin is mocked (jsdom can't load it). useWallet is
// mocked so tests can drive lock / decoy / hidden state directly.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// react-router-dom's useNavigate — intercept the navigate call.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { .../** @type {object} */(actual), useNavigate: () => mockNavigate };
});

// Capacitor native speech plugin — unavailable in jsdom.
vi.mock('@capacitor-community/speech-recognition', () => ({
  SpeechRecognition: {
    available: vi.fn().mockResolvedValue({ available: true }),
    requestPermissions: vi.fn().mockResolvedValue({}),
    start: vi.fn(),
    stop: vi.fn(),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
    removeAllListeners: vi.fn(),
  },
}));

// useWallet — drive lock / deniability state per test.
let walletState = { isUnlocked: true, isDecoy: false, isHidden: false };
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => walletState,
}));

import VoiceCommands from '@/pages/VoiceCommands';
import { VoiceProvider, useVoice } from '@/context/VoiceContext';

// ---------- helpers ----------

// Wrap the page in VoiceProvider + MemoryRouter; async act flushes the mount
// useEffect that sets `supported`.
async function renderPage() {
  let utils;
  await act(async () => {
    utils = render(
      <MemoryRouter>
        <VoiceProvider>
          <VoiceCommands />
        </VoiceProvider>
      </MemoryRouter>
    );
  });
  return utils;
}

// Minimal Web Speech API stub exposing event callbacks for synchronous firing.
function makeSRStub() {
  const instance = {
    continuous: undefined,
    interimResults: undefined,
    lang: undefined,
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
    start: vi.fn(() => { instance.onstart?.(); }),
    stop: vi.fn(() => { instance.onend?.(); }),
  };
  const Ctor = vi.fn(function() { return instance; });
  return { Ctor, instance };
}

// Build a fake SpeechRecognitionEvent result list.
function makeResult(transcript) {
  const alt = { transcript, confidence: 1 };
  const result = Object.assign([alt], { isFinal: true });
  const results = Object.assign([result], {
    length: 1,
    item: (i) => [result][i],
    [Symbol.iterator]: [][Symbol.iterator],
  });
  return { results };
}

function resetWallet() {
  walletState = { isUnlocked: true, isDecoy: false, isHidden: false };
}

beforeEach(() => {
  resetWallet();
  // Web path (not native) under jsdom — provide getUserMedia.
  // navigator.mediaDevices is read-only; use defineProperty.
  Object.defineProperty(global.navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
    writable: true,
    configurable: true,
  });
});
afterEach(() => {
  cleanup();
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
});

// ---------- support detection ----------

describe('VoiceCommands — support detection', () => {
  it('shows unsupported banner when neither SR API exists', async () => {
    await renderPage();
    expect(screen.getByText(/not supported on this device/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /voice commands/i })).toBeNull();
  });

  it('shows the toggle button when window.SpeechRecognition is available', async () => {
    window.SpeechRecognition = makeSRStub().Ctor;
    await renderPage();
    expect(screen.queryByText(/not supported on this device/i)).toBeNull();
    expect(screen.getByRole('button', { name: /start voice commands/i })).toBeTruthy();
  });
});

// ---------- I2: off-device egress disclosure ----------

describe('VoiceCommands — I2 off-device egress disclosure', () => {
  it('renders the egress disclosure callout before enabling voice', async () => {
    window.SpeechRecognition = makeSRStub().Ctor;
    await renderPage();
    // Stable contract: a testid, not prose copy.
    expect(screen.getByTestId('voice-egress-disclosure')).toBeTruthy();
  });
});

// ---------- start / stop lifecycle ----------

describe('VoiceCommands — start / stop lifecycle', () => {
  let stub;
  beforeEach(() => {
    stub = makeSRStub();
    window.SpeechRecognition = stub.Ctor;
    mockNavigate.mockReset();
    global.SpeechSynthesisUtterance = vi.fn();
    global.speechSynthesis = /** @type {SpeechSynthesis} */ (/** @type {unknown} */ ({ speak: vi.fn() }));
  });
  afterEach(() => {
    delete global.SpeechSynthesisUtterance;
    delete global.speechSynthesis;
  });

  it('starts recognition when the toggle is tapped', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start voice commands/i })); });
    expect(stub.instance.start).toHaveBeenCalled();
  });

  it('toggle label flips to "Stop voice commands" once listening', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start voice commands/i })); });
    expect(screen.getByRole('button', { name: /stop voice commands/i })).toBeTruthy();
  });

  it('stops recognition when tapped while listening', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start voice commands/i })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: /stop voice commands/i })); });
    expect(stub.instance.stop).toHaveBeenCalled();
  });
});

// ---------- command matching ----------

describe('VoiceCommands — command matching', () => {
  let stub;
  beforeEach(() => {
    stub = makeSRStub();
    window.SpeechRecognition = stub.Ctor;
    mockNavigate.mockReset();
    global.SpeechSynthesisUtterance = vi.fn().mockImplementation(function(text) { this.text = text; });
    global.speechSynthesis = /** @type {SpeechSynthesis} */ (/** @type {unknown} */ ({ speak: vi.fn() }));
  });
  afterEach(() => {
    delete global.SpeechSynthesisUtterance;
    delete global.speechSynthesis;
  });

  it('navigates to / for "go to dashboard"', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start voice commands/i })); });
    act(() => { stub.instance.onresult?.(makeResult('go to dashboard')); });
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('navigates to /send for "open send"', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start voice commands/i })); });
    act(() => { stub.instance.onresult?.(makeResult('open send')); });
    expect(mockNavigate).toHaveBeenCalledWith('/send');
  });

  it('shows "not recognized" state for an unknown phrase', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start voice commands/i })); });
    act(() => { stub.instance.onresult?.(makeResult('do something weird')); });
    expect(screen.getByText(/not recognized/i)).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ---------- I3: deniability / lock gating ----------

describe('VoiceProvider — I3 lock / deniability gating', () => {
  let stub;
  beforeEach(() => {
    stub = makeSRStub();
    window.SpeechRecognition = stub.Ctor;
  });

  // Probe component to read the provider's `listening` state.
  function Probe() {
    const { listening } = useVoice();
    return <div data-testid="listening">{String(listening)}</div>;
  }

  async function renderProbe() {
    /** @type {ReturnType<typeof render>} */
    let utils = /** @type {any} */ (undefined);
    await act(async () => {
      utils = render(
        <MemoryRouter>
          <VoiceProvider>
            <VoiceCommands />
            <Probe />
          </VoiceProvider>
        </MemoryRouter>
      );
    });
    return utils;
  }

  it('stops listening and forces listening=false when the vault locks', async () => {
    const { rerender } = await renderProbe();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start voice commands/i })); });
    expect(screen.getByTestId('listening').textContent).toBe('true');

    // Vault locks.
    walletState = { isUnlocked: false, isDecoy: false, isHidden: false };
    await act(async () => {
      rerender(
        <MemoryRouter>
          <VoiceProvider>
            <VoiceCommands />
            <Probe />
          </VoiceProvider>
        </MemoryRouter>
      );
    });
    expect(stub.instance.stop).toHaveBeenCalled();
    expect(screen.getByTestId('listening').textContent).toBe('false');
  });

  it('stops listening when a decoy (deniability) session becomes active', async () => {
    const { rerender } = await renderProbe();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start voice commands/i })); });
    expect(screen.getByTestId('listening').textContent).toBe('true');

    walletState = { isUnlocked: true, isDecoy: true, isHidden: false };
    await act(async () => {
      rerender(
        <MemoryRouter>
          <VoiceProvider>
            <VoiceCommands />
            <Probe />
          </VoiceProvider>
        </MemoryRouter>
      );
    });
    expect(screen.getByTestId('listening').textContent).toBe('false');
  });
});
