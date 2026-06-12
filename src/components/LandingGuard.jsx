import { Navigate } from 'react-router-dom';
import { useWallet } from '@/lib/WalletProvider';
import LandingPage from '@/pages/LandingPage';

// Guards the public /landing route. Renders the public landing page ONLY when
// the device has no vault (genuine first run). If a vault exists — or existence
// cannot yet be confirmed — redirects to '/', which flows through WalletGate to
// the PIN pad. This closes the reload-to-/landing lock bypass (/landing used to
// be a sibling of WalletGate, so a WebView reload rendered it publicly
// regardless of lock state — an I4 fail-open).
//
// I4 (fail closed): only an explicit, confirmed vaultExists === false reveals the
//   public page. `null` (error/unknown) and the checking window both redirect.
// I3 (deniability): the decision keys ONLY on the single boolean "is there a
//   vault". It must never branch on stealth/duress state, wallet-set type, or
//   wallet count. A decoy device and a real device both resolve vaultExists ===
//   true and land on the identical PIN pad. Do not import or read hasStealthPool,
//   hasDuressPin, or any set-cardinality signal here.
export default function LandingGuard() {
  const { vaultExists, vaultChecking } = useWallet();
  if (vaultChecking) return null;                 // pending → render nothing (no public flash)
  if (vaultExists === false) return <LandingPage />;  // confirmed no vault → public page
  return <Navigate to="/" replace />;             // vault exists OR null → fail closed to PIN
}
