/// <reference types="vite/client" />

// Ambient globals the app reads off `window` at runtime. These are provided by
// the browser/extension environment (injected wallet providers, the Web Speech
// API) rather than by our own code, so they are declared loosely as optional.
interface Window {
  /** EIP-1193 injected EVM provider (MetaMask, etc.). */
  ethereum?: any;
  /** Injected Solana wallet provider (Phantom, etc.). */
  solana?: any;
  /** Web Speech API (standard + webkit-prefixed). */
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}
