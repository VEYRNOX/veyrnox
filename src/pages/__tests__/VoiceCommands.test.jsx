// src/pages/__tests__/VoiceCommands.test.jsx
//
// Tests four properties of the VoiceCommands page:
//   1. Browser-support detection — renders unsupported banner when the Web
//      Speech API is absent; renders mic button when it is present.
//   2. Start/stop lifecycle — recognition.start() called on tap; stop() called
//      on second tap; listening state reflects onstart / onend callbacks.
//   3. Command matching — a recognised phrase triggers navigate() with the
//      correct path; an unrecognised phrase shows the "not recognized" state.
//   4. Error handling — recognition.onerror surfaces the error string.
//
// We stub window.SpeechRecognition rather than the module so the component's
// own feature-detection logic (`window.SpeechRecognition || webkitSpeechRecognition`)
// is exercised, not bypassed.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// react-router-dom's useNavigate — intercept the navigate call.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

import VoiceCommands from '@/pages/VoiceCommands';

// ---------- helpers ----------

// Wrap in MemoryRouter; async act flushes the useEffect that sets `supported`.
async function renderPage() {
  let utils;
  await act(async () => {
    utils = render(
      <MemoryRouter>
        <VoiceCommands />
      </MemoryRouter>
    );
  });
  return utils;
}

// Minimal SpeechRecognition stub that exposes the event callbacks so tests can
// fire them synchronously.
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
function makeResult(transcript, isFinal = true) {
  const alt = { transcript, confidence: 1 };
  const result = Object.assign([alt], { isFinal });
  const results = Object.assign([result], {
    length: 1,
    item: (i) => [result][i],
    [Symbol.iterator]: [][Symbol.iterator],
  });
  return { results };
}

// ---------- tests ----------

describe('VoiceCommands — browser support detection', () => {
  afterEach(() => {
    cleanup();
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });

  it('shows unsupported banner when neither SR API exists', async () => {
    await renderPage();
    expect(screen.getByText(/not supported in this browser/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start listening/i })).toBeNull();
  });

  it('shows mic button when window.SpeechRecognition is available', async () => {
    const { Ctor } = makeSRStub();
    window.SpeechRecognition = Ctor;
    await renderPage();
    expect(screen.queryByText(/not supported in this browser/i)).toBeNull();
    expect(screen.getByRole('button', { name: /start listening/i })).toBeTruthy();
  });

  it('shows mic button when window.webkitSpeechRecognition is available', async () => {
    const { Ctor } = makeSRStub();
    window.webkitSpeechRecognition = Ctor;
    await renderPage();
    expect(screen.queryByText(/not supported in this browser/i)).toBeNull();
    expect(screen.getByRole('button', { name: /start listening/i })).toBeTruthy();
  });
});

describe('VoiceCommands — start / stop lifecycle', () => {
  let stub;
  beforeEach(() => {
    stub = makeSRStub();
    window.SpeechRecognition = stub.Ctor;
    mockNavigate.mockReset();
    global.SpeechSynthesisUtterance = vi.fn();
    global.speechSynthesis = { speak: vi.fn() };
  });
  afterEach(() => {
    cleanup();
    delete window.SpeechRecognition;
    delete global.SpeechSynthesisUtterance;
    delete global.speechSynthesis;
  });

  it('calls recognition.start() when the mic button is tapped', async () => {
    await renderPage();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /start listening/i })); });
    expect(stub.instance.start).toHaveBeenCalledTimes(1);
  });

  it('button label flips to "Stop listening" after recognition starts', async () => {
    await renderPage();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /start listening/i })); });
    expect(screen.getByRole('button', { name: /stop listening/i })).toBeTruthy();
  });

  it('calls recognition.stop() when tapped while listening', async () => {
    await renderPage();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /start listening/i })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: /stop listening/i })); });
    expect(stub.instance.stop).toHaveBeenCalledTimes(1);
  });

  it('button label returns to "Start listening" after onend fires', async () => {
    await renderPage();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /start listening/i })); });
    act(() => { stub.instance.onend?.(); });
    expect(screen.getByRole('button', { name: /start listening/i })).toBeTruthy();
  });
});

describe('VoiceCommands — command matching', () => {
  let stub;
  beforeEach(() => {
    stub = makeSRStub();
    window.SpeechRecognition = stub.Ctor;
    mockNavigate.mockReset();
    global.SpeechSynthesisUtterance = vi.fn().mockImplementation(function(text) { this.text = text; });
    global.speechSynthesis = { speak: vi.fn() };
  });
  afterEach(() => {
    cleanup();
    delete window.SpeechRecognition;
    delete global.SpeechSynthesisUtterance;
    delete global.speechSynthesis;
  });

  it('navigates to / for "go to dashboard"', async () => {
    await renderPage();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /start listening/i })); });
    act(() => { stub.instance.onresult?.(makeResult('go to dashboard')); });
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('navigates to /send for "open send"', async () => {
    await renderPage();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /start listening/i })); });
    act(() => { stub.instance.onresult?.(makeResult('open send')); });
    expect(mockNavigate).toHaveBeenCalledWith('/send');
  });

  it('navigates to /settings for "open settings"', async () => {
    await renderPage();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /start listening/i })); });
    act(() => { stub.instance.onresult?.(makeResult('open settings')); });
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });

  it('speaks a confirmation after a matched command', async () => {
    await renderPage();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /start listening/i })); });
    act(() => { stub.instance.onresult?.(makeResult('open receive')); });
    expect(global.speechSynthesis.speak).toHaveBeenCalledTimes(1);
  });

  it('shows "not recognized" state for an unknown phrase', async () => {
    await renderPage();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /start listening/i })); });
    act(() => { stub.instance.onresult?.(makeResult('do something weird')); });
    expect(screen.getByText(/command not recognized/i)).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('never navigates for non-final interim results', async () => {
    await renderPage();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /start listening/i })); });
    act(() => { stub.instance.onresult?.(makeResult('open send', false)); });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('VoiceCommands — error handling', () => {
  let stub;
  beforeEach(() => {
    stub = makeSRStub();
    window.SpeechRecognition = stub.Ctor;
    global.SpeechSynthesisUtterance = vi.fn();
    global.speechSynthesis = { speak: vi.fn() };
  });
  afterEach(() => {
    cleanup();
    delete window.SpeechRecognition;
    delete global.SpeechSynthesisUtterance;
    delete global.speechSynthesis;
  });

  it('displays the error string when recognition.onerror fires', async () => {
    await renderPage();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /start listening/i })); });
    act(() => { stub.instance.onerror?.({ error: 'not-allowed' }); });
    expect(screen.getByText(/not-allowed/i)).toBeTruthy();
  });

  it('resets listening state on error', async () => {
    await renderPage();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /start listening/i })); });
    act(() => { stub.instance.onerror?.({ error: 'aborted' }); });
    expect(screen.getByRole('button', { name: /start listening/i })).toBeTruthy();
  });
});
