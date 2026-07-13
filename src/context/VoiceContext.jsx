// @ts-nocheck
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useWallet } from "@/lib/WalletProvider";

const COMMANDS = [
  { phrase: "go to dashboard",      action: "/",                description: "Navigate to Dashboard" },
  { phrase: "open send",            action: "/send",            description: "Open Send Crypto" },
  { phrase: "open receive",         action: "/receive",         description: "Open Receive" },
  { phrase: "show portfolio",       action: "/",                description: "Go to Portfolio" },
  { phrase: "open settings",        action: "/settings",        description: "Open Settings" },
  { phrase: "open analytics",       action: "/analytics",       description: "Open Analytics" },
  { phrase: "check alerts",         action: "/alerts",          description: "Open Price Alerts" },
  { phrase: "show history",         action: "/tx-history",      description: "Open Transaction History" },
  { phrase: "open history",         action: "/tx-history",      description: "Open Transaction History" },
  { phrase: "open address book",    action: "/address-book",    description: "Open Address Book" },
  { phrase: "open security",        action: "/security",        description: "Open Security Centre" },
  { phrase: "show watchlist",       action: "/watchlist",       description: "Open Watchlist" },
  { phrase: "open watchlist",       action: "/watchlist",       description: "Open Watchlist" },
  { phrase: "open calculator",      action: "/calculator",      description: "Open Calculator" },
  { phrase: "show price charts",    action: "/price-charts",    description: "Open Price Charts" },
  { phrase: "open charts",          action: "/price-charts",    description: "Open Price Charts" },
  { phrase: "open walletconnect",   action: "/walletconnect",   description: "Open WalletConnect" },
  { phrase: "connect wallet",       action: "/walletconnect",   description: "Open WalletConnect" },
  { phrase: "show notifications",   action: "/notifications",   description: "Open Notifications" },
  { phrase: "open notifications",   action: "/notifications",   description: "Open Notifications" },
];

export { COMMANDS };

const VoiceContext = createContext(null);

export function VoiceProvider({ children }) {
  const navigate = useNavigate();
  // I3 — deniability/lock awareness. An always-on mic must never run while the
  // vault is locked or while a deniability (decoy/hidden) session is active, or
  // it leaks audio to the platform speech service. Fail closed.
  const { isUnlocked, isDecoy, isHidden } = useWallet();
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [lastCommand, setLastCommand] = useState(null);
  const [error, setError] = useState(null);
  const [isNative, setIsNative] = useState(false);
  const pluginRef = useRef(null);
  const recognitionRef = useRef(null);
  const keepListeningRef = useRef(false);

  // Detect platform + load plugin once on mount.
  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    setIsNative(native);
    if (native) {
      (async () => {
        try {
          const { SpeechRecognition } = await import("@capacitor-community/speech-recognition");
          pluginRef.current = SpeechRecognition;
          const { available } = await SpeechRecognition.available();
          setSupported(available);
        } catch {
          setSupported(false);
        }
      })();
    } else {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      setSupported(!!SR);
    }
  }, []);

  const processTranscript = useCallback((text) => {
    const lower = text.toLowerCase();
    const matched = COMMANDS.find(c => lower.includes(c.phrase));
    if (matched) {
      setLastCommand({ ...matched, text });
      navigate(matched.action);
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(`Navigating to ${matched.description}`);
        u.rate = 1.2;
        window.speechSynthesis.speak(u);
      }
    } else {
      setLastCommand({ unrecognized: true, text });
    }
  }, [navigate]);

  // ── Native continuous loop ─────────────────────────────────────────────────

  const startNative = useCallback(async () => {
    const plugin = pluginRef.current;
    if (!plugin) { setError("Speech plugin not ready"); return; }
    setError(null);

    // Graceful degradation: re-verify the engine is actually available on this
    // device/OS before touching any privacy API. On iOS a device with no speech
    // recognizer (or a build missing the NSSpeechRecognition/NSMicrophone usage
    // descriptions) must fail honest here, not push forward into start() and
    // crash. available() itself never requests permission, so it is safe to call.
    try {
      const { available } = await plugin.available();
      if (!available) {
        setSupported(false);
        setError("Voice recognition isn't available on this device.");
        return;
      }
    } catch {
      setSupported(false);
      setError("Voice recognition isn't available on this device.");
      return;
    }

    // Request mic + speech-recognition permission. Unlike the Android-only "already
    // granted" fast-path, a rejection or a non-granted status must stop us before
    // start() — otherwise a denied/restricted device falls through and errors mid-loop.
    try {
      const status = await plugin.requestPermissions();
      if (status?.speechRecognition !== "granted") {
        setError("Microphone or speech-recognition permission denied. Enable it in Settings → Veyrnox → Microphone & Speech Recognition.");
        return;
      }
    } catch (e) {
      setError(e?.message || "Couldn't obtain microphone permission.");
      return;
    }

    keepListeningRef.current = true;
    setListening(true);
    let consecutiveErrors = 0;

    while (keepListeningRef.current) {
      try {
        const result = await plugin.start({ language: "en-US", maxResults: 1, popup: false });
        if (!keepListeningRef.current) break;
        consecutiveErrors = 0;
        const text = result?.matches?.[0] ?? "";
        if (text) {
          processTranscript(text);
          // Wait for navigation animation before starting next listen cycle.
          await new Promise(r => setTimeout(r, 1200));
        }
      } catch {
        if (!keepListeningRef.current) break;
        consecutiveErrors++;
        // Stop only after 5 back-to-back failures — transient engine errors
        // (busy, canceled, no-speech) should not kill the session.
        if (consecutiveErrors >= 5) {
          setError("Voice recognition stopped after repeated errors. Tap to restart.");
          break;
        }
        await new Promise(r => setTimeout(r, 600));
      }
    }
    keepListeningRef.current = false;
    setListening(false);
  }, [processTranscript]);

  const stopNative = useCallback(async () => {
    keepListeningRef.current = false;
    try { await pluginRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  // ── Web continuous recognition ─────────────────────────────────────────────

  const startWeb = useCallback(async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
      stream?.getTracks().forEach(t => t.stop());
    } catch (e) {
      setError(e.name === "NotAllowedError"
        ? "Microphone permission denied. Allow it in your browser settings."
        : e.message);
      return;
    }
    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onstart = () => setListening(true);
    recognition.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join("");
      if (t) processTranscript(t);
    };
    recognition.onerror = (e) => {
      if (e.error === "no-speech") return;
      setError(e.error);
      setListening(false);
    };
    recognition.onend = () => {
      // Auto-restart unless explicitly stopped.
      if (keepListeningRef.current) {
        try { recognition.start(); } catch { /* ignore */ }
      } else {
        setListening(false);
      }
    };
    keepListeningRef.current = true;
    recognition.start();
  }, [processTranscript]);

  const stopWeb = useCallback(() => {
    keepListeningRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = isNative ? startNative : startWeb;
  const stop  = isNative ? stopNative  : stopWeb;

  // I3 — fail closed. Voice is forbidden whenever the vault is locked OR a
  // deniability (decoy/hidden) session is active. Gate the toggle and force a
  // hard stop the moment any of these becomes true.
  const voiceForbidden = !isUnlocked || isDecoy || isHidden;

  const stopRef = useRef(stop);
  stopRef.current = stop;

  useEffect(() => {
    if (voiceForbidden) {
      keepListeningRef.current = false;
      // Best-effort tear-down of whichever engine is active, then force the UI
      // state off so no "listening" indicator survives into a duress session.
      try { stopRef.current?.(); } catch { /* ignore */ }
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
      try { pluginRef.current?.stop?.(); } catch { /* ignore */ }
      setListening(false);
    }
  }, [voiceForbidden]);

  const toggle = useCallback(() => {
    if (voiceForbidden) return; // never start voice while locked / in deniability
    if (listening) stop();
    else start();
  }, [voiceForbidden, listening, start, stop]);

  // Cleanup on unmount (app teardown).
  useEffect(() => () => {
    keepListeningRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  return (
    <VoiceContext.Provider value={{ listening, supported, lastCommand, error, isNative, toggle, stop, start }}>
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used inside VoiceProvider");
  return ctx;
}
