// ReferralHandoff — carries a referral code across a store install (#2541).
// Rendered under the pre-vault entry tiles only.
//
// Universal/app links only reach an app that is already installed. A new user
// taps veyrnox.com/r/<code>, lands on the web wallet (which stores the code in
// the BROWSER's storage), then installs an app that has its own storage. So:
//   web    — show the stored code and send the user to a store with it: Google
//            Play with the code as the install referrer (read back by
//            captureInstallReferrer on Android), or copy the code and open the
//            App Store (iOS has no first-party equivalent).
//   native — offer to take the code on first run. Paste only runs on a tap,
//            never on mount (no silent clipboard read).
//
// I3: renders nothing in a deniability/demo session, and the write path
// (captureReferralFromUrl) re-checks the gate at the moment of the tap.

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copyPlain } from "@/lib/copySecret";
import { getPendingReferral, hasRedeemed } from "@/lib/referral";
import { captureReferralFromUrl, playStoreReferralUrl } from "@/lib/referralAttribution";
import { isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";

const APP_STORE_URL = "https://apps.apple.com/app/id6790188660";

export default function ReferralHandoff() {
  const [pending, setPending] = useState(() => getPendingReferral());
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  if (isDeniabilityOrDemoActive() || hasRedeemed()) return null;

  if (!Capacitor.isNativePlatform()) {
    if (!pending) return null;
    return (
      <div className="mt-4 rounded-lg border border-border p-4 space-y-3 text-sm" data-testid="referral-handoff-web">
        <p>
          You were invited with code <span className="mono-value">{pending}</span>. The app can&apos;t read it
          from this browser, so take it with you.
        </p>
        <div className="flex flex-col gap-2">
          <Button asChild variant="outline">
            <a href={playStoreReferralUrl(pending)} onClick={() => copyPlain(pending)}>
              Get it on Google Play
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={APP_STORE_URL} onClick={() => copyPlain(pending)}>
              Copy code &amp; get it on the App Store
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          On iPhone, paste the code when the app first opens.
        </p>
      </div>
    );
  }

  if (pending) {
    return (
      <p className="mt-4 text-center text-xs text-muted-foreground" data-testid="referral-handoff-pending">
        Referral code <span className="mono-value">{pending}</span> will be applied when you finish setup.
      </p>
    );
  }

  const apply = (raw) => {
    setError("");
    const url = new URL("http://localhost/");
    url.searchParams.set("ref", raw);
    captureReferralFromUrl(url, "first_run_entry");
    const stored = getPendingReferral();
    if (stored) setPending(stored);
    else setError("That isn't a Veyrnox referral code. Codes look like VYX-ABC234.");
  };

  const paste = async () => {
    setError("");
    try {
      const text = (await navigator.clipboard.readText()).trim();
      setValue(text);
      if (text) apply(text);
    } catch {
      setError("Couldn't read the clipboard. Long-press the box and choose Paste.");
    }
  };

  return (
    <details className="mt-4 text-sm" data-testid="referral-handoff-native">
      <summary className="cursor-pointer text-center text-muted-foreground">Have a referral code?</summary>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); apply(value); }}
      >
        <Input
          aria-label="Referral code"
          placeholder="VYX-XXXXXX"
          value={value}
          maxLength={10}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="button" variant="outline" onClick={paste}>Paste</Button>
        <Button type="submit">Apply</Button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </details>
  );
}
