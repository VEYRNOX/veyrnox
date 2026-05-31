// components/auth/SocialAuthButtons.jsx — "Continue with Apple / Google".
//
// UX CONVENIENCE ONLY. These buttons drive the app's ACCOUNT auth layer
// (base44.auth.loginWithProvider) — i.e. streamlined sign-up / sign-in of the
// account/profile. They are a faster front door layered on top of the
// UNCHANGED local wallet creation.
//
// THEY DO NOT TOUCH KEY HANDLING. The wallet's keys are device-only, derived
// from the BIP-39 seed by WalletProvider/wallet-core exactly as before. No key
// material is synced, backed up, or derived via an Apple/Google identity, and
// wallet recovery is NOT tied to those accounts. Provider login resolves only
// the app account; the local vault is still created/unlocked the same way.
//
// (The provider OAuth itself must be configured server-side, same as Google is
// today — that's a backend concern, not a client key concern.)

import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import GoogleIcon from "@/components/GoogleIcon";

function AppleIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.36 12.78c-.02-2.02 1.65-2.99 1.72-3.04-.94-1.37-2.4-1.56-2.92-1.58-1.24-.13-2.43.73-3.06.73-.63 0-1.6-.71-2.64-.69-1.36.02-2.61.79-3.31 2.01-1.41 2.45-.36 6.07 1.01 8.06.67.97 1.47 2.06 2.51 2.02 1.01-.04 1.39-.65 2.61-.65 1.22 0 1.56.65 2.63.63 1.09-.02 1.78-.99 2.44-1.96.77-1.12 1.09-2.21 1.1-2.27-.02-.01-2.11-.81-2.13-3.21zM14.39 6.86c.56-.68.94-1.62.83-2.56-.81.03-1.79.54-2.37 1.21-.52.6-.97 1.56-.85 2.48.9.07 1.83-.46 2.39-1.13z" />
    </svg>
  );
}

const PROVIDERS = [
  { id: "apple", label: "Continue with Apple", Icon: AppleIcon },
  { id: "google", label: "Continue with Google", Icon: GoogleIcon },
];

/**
 * Apple/Google account sign-in buttons.
 * @param {string} [redirect="/"] where the account-auth provider returns to.
 */
export default function SocialAuthButtons({ redirect = "/" }) {
  return (
    <div className="space-y-3">
      {PROVIDERS.map(({ id, label, Icon }) => (
        <Button
          key={id}
          type="button"
          variant="outline"
          className="w-full h-11"
          onClick={() => base44.auth.loginWithProvider(id, redirect)}
        >
          <Icon className="h-4 w-4 mr-2" />
          {label}
        </Button>
      ))}
    </div>
  );
}
