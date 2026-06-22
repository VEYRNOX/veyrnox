import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Volume2, CheckCircle, AlertCircle, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

const COMMANDS = [
  { phrase: "go to dashboard", action: "/", description: "Navigate to Dashboard" },
  { phrase: "open send", action: "/send", description: "Open Send Crypto" },
  { phrase: "open receive", action: "/receive", description: "Open Receive" },
  { phrase: "show portfolio", action: "/", description: "Go to Portfolio" },
  { phrase: "open settings", action: "/settings", description: "Open Settings" },
  { phrase: "open tax report", action: "/tax", description: "Open Tax Report" },
  { phrase: "open analytics", action: "/analytics", description: "Open Analytics" },
  { phrase: "check alerts", action: "/alerts", description: "Open Price Alerts" },
];

export default function VoiceCommands() {
  const navigate = useNavigate();
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastCommand, setLastCommand] = useState(null);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  const processTranscript = (text) => {
    const lower = text.toLowerCase();
    const matched = COMMANDS.find(c => lower.includes(c.phrase));
    if (matched) {
      setLastCommand({ ...matched, text });
      navigate(matched.action);
      const utterance = new SpeechSynthesisUtterance(`Navigating to ${matched.description}`);
      utterance.rate = 1.2;
      window.speechSynthesis.speak(utterance);
    } else {
      setLastCommand({ unrecognized: true, text });
    }
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setError(null);
    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onstart = () => setListening(true);
    recognition.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join("");
      setTranscript(t);
      if (e.results[e.results.length - 1].isFinal) processTranscript(t);
    };
    recognition.onerror = (e) => { setError(e.error); setListening(false); };
    recognition.onend = () => setListening(false);
    recognition.start();
  };

  const stopListening = () => { recognitionRef.current?.stop(); setListening(false); };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div><h1 className="text-xl font-bold">Voice Commands</h1><p className="text-sm text-muted-foreground">Navigate and control your wallet by voice</p></div>

      {!supported ? (
        <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0" />
          <p className="text-sm">Voice recognition is not supported in this browser. Try Chrome or Edge on desktop.</p>
        </div>
      ) : (
        <>
          {/* Mic button */}
          <div className="flex flex-col items-center py-8 space-y-4">
            <button onClick={listening ? stopListening : startListening}
              aria-label={listening ? "Stop listening" : "Start listening"}
              className={`h-24 w-24 rounded-full flex items-center justify-center transition-all shadow-lg ${listening ? "bg-destructive animate-pulse scale-110" : "bg-primary hover:scale-105"}`}>
              {listening ? <MicOff className="h-10 w-10 text-white" /> : <Mic className="h-10 w-10 text-white" />}
            </button>
            <p className="text-sm text-muted-foreground">{listening ? "Listening... speak now" : "Tap to start listening"}</p>
            {transcript && listening && (
              <div className="px-4 py-2 rounded-xl bg-secondary text-sm font-medium text-center max-w-xs">"{transcript}"</div>
            )}
          </div>

          {/* Result */}
          {lastCommand && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 ${lastCommand.unrecognized ? "border-yellow-500/30 bg-yellow-500/5" : "border-green-500/30 bg-green-500/5"}`}>
              {lastCommand.unrecognized ? <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0" /> : <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />}
              <div>
                <p className="text-sm font-medium">{lastCommand.unrecognized ? "Command not recognized" : `✓ ${lastCommand.description}`}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Heard: "{lastCommand.text}"</p>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive p-3 rounded-xl border border-destructive/20 bg-destructive/5">Error: {error}. Check microphone permissions.</p>}
        </>
      )}

      {/* Available commands */}
      <div>
        <p className="text-sm font-semibold flex items-center gap-2 mb-3"><Zap className="h-4 w-4 text-primary" /> Available Commands</p>
        <div className="grid grid-cols-1 gap-2">
          {COMMANDS.map(c => (
            <div key={c.phrase} className="flex items-center justify-between p-3 rounded-xl border border-border bg-card text-xs">
              <span className="font-mono text-primary">"{c.phrase}"</span>
              <span className="text-muted-foreground">{c.description}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 rounded-xl bg-secondary/30 border border-border text-xs text-muted-foreground">
        <Volume2 className="h-3.5 w-3.5 inline mr-1.5" />
        Voice commands use your browser's built-in Web Speech API. No audio is sent to external servers.
      </div>
    </div>
  );
}