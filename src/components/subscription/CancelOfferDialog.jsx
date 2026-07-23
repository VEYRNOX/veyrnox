// @ts-nocheck
// components/subscription/CancelOfferDialog.jsx
//
// Shown when a subscriber taps "Manage subscription" — i.e. on cancel INTENT,
// while they are still inside our app. Offers a reason to stay, then hands off.
//
// PLATFORM LIMIT (this is why it is an intent-intercept, not a cancel-intercept):
// Subscriptions are cancelled in Apple's / Google's own UI. There is no
// cancellation event, no callback and no interception point available to the
// app — once `manageSubscription()` deep-links out (itms-apps:// or
// play.google.com/store/account/subscriptions) we can neither see nor influence
// what happens. The only moment we legitimately own is this tap.
//
// HONESTY RULE (do not relax):
// A price is rendered ONLY when a real store-configured promotional offer
// resolved, AND its own price could be read. Apple and Google sell exclusively
// from their own price points; a discount invented client-side is a number
// neither store can charge. With no offer configured this dialog shows
// retention value and no price at all — which is the correct behaviour, not a
// degraded one. Mirrors the referral-discount pattern in pages/Subscription.jsx.
//
// The offer price arrives as the `offerPrice` prop and must NOT be read off
// `offerPackage`: the retention package wraps the SAME store product as the
// current subscription, so its priceString is the full price. Reading it
// rendered a struck-through "$5.99" beside an identical "$5.99" under a "Stay
// for less" headline — a claimed saving of nothing. `offerPackage` answers
// only "is there an offer at all"; purchases.js offerPriceInfo answers "at
// what price", and yields null rather than substituting the base price.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldOff, EyeOff, Trash2 } from "lucide-react";

// What actually stops working. Deliberately the coercion-resistant set: these
// are the reasons someone bought Safety Plus, not a generic feature dump.
const LOSES = [
  { Icon: ShieldOff, label: "Duress PIN", detail: "decoy wallet on a forced unlock" },
  { Icon: EyeOff, label: "Hidden wallets", detail: "accounts absent from any list or count" },
  { Icon: Trash2, label: "Panic wipe", detail: "on-demand destruction of local key material" },
];

/**
 * @param {object}   props
 * @param {boolean}  props.open
 * @param {Function} props.onOpenChange
 * @param {Function} props.onKeep      - dismiss, stay subscribed
 * @param {Function} props.onContinue  - proceed to the store's subscription settings
 * @param {object|null} props.offerPackage - the package carrying a promotional offer, or null
 * @param {{priceString: string, price: number}|null} props.offerPrice - the offer's real
 *   price, from purchases.js offerPriceInfo. NOT readable off offerPackage: a package
 *   reports its base plan price whether or not an offer applies.
 * @param {object|null} props.currentPackage - what they pay now, for deriving the saving
 * @param {string|null} props.currentPriceString - what they pay now, for comparison
 */
export default function CancelOfferDialog({
  open,
  onOpenChange,
  onKeep,
  onContinue,
  offerPackage = null,
  offerPrice: offerPriceData = null,
  currentPackage = null,
  currentPriceString = null,
}) {
  // The offer price comes from the OFFER, not the package: a package's
  // priceString is always its base plan's, so `retentionMonthly` and
  // `monthlyPackage` both report $5.99. Reading it here rendered a
  // struck-through $5.99 beside an identical $5.99 under "Stay for less".
  // No resolvable offer price => no price block (I4), never a base-price
  // stand-in dressed up as a discount.
  const offerPrice = offerPriceData?.priceString ?? null;
  const hasRealOffer = Boolean(offerPackage && offerPrice);

  // The "50% off" style headline is DERIVED from the two real store prices,
  // never asserted. If the store returns a promotional offer at half price the
  // badge reads 50%; if the configured offer is 30%, it reads 30%. Nothing here
  // can claim a saving the store will not actually apply — and if either
  // numeric price is missing the badge is simply omitted rather than guessed.
  const regularAmount = Number(currentPackage?.product?.price);
  const offerAmount = Number(offerPriceData?.price);
  const percentOff =
    Number.isFinite(regularAmount) &&
    Number.isFinite(offerAmount) &&
    regularAmount > 0 &&
    offerAmount < regularAmount
      ? Math.round((1 - offerAmount / regularAmount) * 100)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="cancel-offer-dialog">
        <DialogHeader>
          <DialogTitle>Before you go</DialogTitle>
          <DialogDescription>
            Cancelling keeps your wallet and your funds — Veyrnox is
            non-custodial, and nothing about your keys changes. These protections
            are what switch off.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 py-2">
          {LOSES.map(({ Icon, label, detail }) => (
            <li key={label} className="flex items-start gap-3">
              <Icon className="h-4 w-4 text-caution shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-sm text-foreground">
                <span className="font-semibold">{label}</span>
                <span className="text-muted-foreground"> — {detail}</span>
              </p>
            </li>
          ))}
        </ul>

        {hasRealOffer && (
          <div
            className="rounded-xl border border-primary/30 bg-primary/5 p-4"
            data-testid="cancel-offer-price"
          >
            <p className="text-sm font-semibold text-foreground">
              {percentOff ? `Stay for ${percentOff}% less` : "Stay for less"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {currentPriceString ? (
                <>
                  <span className="line-through">{currentPriceString}</span>{" "}
                  <span className="font-semibold text-primary">{offerPrice}</span>
                </>
              ) : (
                <span className="font-semibold text-primary">{offerPrice}</span>
              )}{" "}
              — applied by the store at your next renewal.
            </p>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button className="w-full" onClick={onKeep}>
            {hasRealOffer ? "Keep Safety Plus at this price" : "Keep Safety Plus"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onContinue}>
            Continue to cancel
          </Button>
          <p className="text-xs text-muted-foreground text-center pt-1">
            Cancelling is handled by the App Store or Google Play. You keep
            Safety Plus until the end of the period you've paid for.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
