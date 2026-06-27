import { Mic } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useVoice } from "@/context/VoiceContext";

export default function VoiceFab() {
  const { listening, stop } = useVoice();
  const location = useLocation();

  if (!listening) return null;
  if (location.pathname === "/voice-commands") return null;

  return (
    <button
      onClick={stop}
      aria-label="Stop voice commands"
      className="fixed bottom-24 right-4 z-50 h-12 w-12 rounded-full bg-primary shadow-lg flex items-center justify-center animate-pulse"
    >
      <Mic className="h-5 w-5 text-white" />
    </button>
  );
}
