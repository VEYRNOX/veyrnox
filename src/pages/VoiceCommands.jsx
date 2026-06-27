import { Mic, MicOff, Volume2, CheckCircle, AlertCircle, Zap } from "lucide-react";
import { useVoice, COMMANDS } from "@/context/VoiceContext";

export default function VoiceCommands() {
  const { listening, supported, lastCommand, error, toggle } = useVoice();

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Voice Commands</h1>
        <p className="text-sm text-muted-foreground">Navigate your wallet hands-free</p>
      </div>

      {!supported ? (
        <div className="p-4 rounded-xl border border-caution/30 bg-caution/5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-caution shrink-0" />
          <p className="text-sm">Voice recognition is not supported on this device. On Android, ensure the Google app or a compatible speech engine is installed.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center py-8 space-y-4">
            <button
              onClick={toggle}
              aria-label={listening ? "Stop voice commands" : "Start voice commands"}
              className={`h-24 w-24 rounded-full flex items-center justify-center transition-all shadow-lg ${
                listening ? "bg-destructive animate-pulse scale-110" : "bg-primary hover:scale-105"
              }`}
            >
              {listening ? <MicOff className="h-10 w-10 text-white" /> : <Mic className="h-10 w-10 text-white" />}
            </button>
            <p className="text-sm text-muted-foreground">
              {listening
                ? "Listening — navigate anywhere, voice follows you. Tap to stop."
                : "Tap to enable voice commands across the whole app"}
            </p>
          </div>

          {lastCommand && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 ${
              lastCommand.unrecognized ? "border-caution/30 bg-caution/5" : "border-success/30 bg-success/5"
            }`}>
              {lastCommand.unrecognized
                ? <AlertCircle className="h-5 w-5 text-caution shrink-0" />
                : <CheckCircle className="h-5 w-5 text-success shrink-0" />}
              <div>
                <p className="text-sm font-medium">
                  {lastCommand.unrecognized ? "Command not recognized — still listening" : `✓ ${lastCommand.description}`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Heard: "{lastCommand.text}"</p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive p-3 rounded-xl border border-destructive/20 bg-destructive/5">{error}</p>
          )}
        </>
      )}

      <div>
        <p className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-primary" /> Available Commands
        </p>
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
        Voice stays active as you navigate. A pulsing mic icon appears in the corner on every page. Return here to stop.
      </div>
    </div>
  );
}
