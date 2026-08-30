// @ts-nocheck
// pages/Subscription.jsx — route /plans
//
// Native (iOS/Android): real purchase flow via RevenueCat — fetches the
// current offering, purchases the Safety Plus package, and refreshes the
// tier context on success. Web has no App Store/Play Store (web stays
// testing-only; see CLAUDE.md), so it keeps a disabled, honest preview.

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Info, ArrowRight, Loader2, ExternalLink } from "lucide-react";
import { Link } from "react-router";
import { toast } from "@/lib/toast";
import BackButton from "@/components/BackButton";
import { useTier } from "@/lib/TierProvider";
import {
  FREE_FEATURES,
  SAFETY_PLUS_FEATURES,
  AI_SECURITY_PROTECTION_FEATURES,
  tierLabel,
  isPaidTier,
  TIER,
} from "@/lib/tier";
import {
  getOfferings,
  getTierOffering,
  getAiSecurityProtectionOfferingId,
  purchasePackage,
  restorePurchases,
  manageSubscription,
  offerPriceInfo,
  SAFETY_PLUS_MONTHLY_PACKAGE,
  SAFETY_PLUS_ANNUAL_PACKAGE,
  RETENTION_OFFERING_ID,
} from "@/lib/purchases";
import {
  getRedeemedCode,
  hasRedeemed,
  hasAttributed,
  markAttributed,
  getTier,
  getTierInfo,
  getOfferingIdForTier,
  getPlanFullPriceCents,
  storeDiscountCents,
} from "@/lib/referral";
import { annualSavingPercent } from "@/lib/annualSaving";
import { discountPercent } from "@/lib/discountPercent";
import { recordAttribution, fetchPaidCount, claimFirstReferralBonus } from "@/api/referralApi";
import { OFFER_UNAVAILABLE } from "@/lib/purchases";
import OutcomeSteps, {
  OUTCOME_STEPS,
  OUTCOME_SEEN_KEY,
  markOutcomeSeen,
} from "@/components/subscription/OutcomeSteps";
import CancelOfferDialog from "@/components/subscription/CancelOfferDialog";
import { useLocalePreferences } from "@/lib/useLocale";

const CURRENT_BADGE = "bg-success/10 text-success border-success/20";

// Compact, scannable feature summary — names only, capped, with a "+N more" pill.
// The full detailed lists live on /safety-plus (grouped by SECURITY · FINANCE ·
// CONNECT), linked from the summary, so /plans stays short and pricing-focused.
function HighlightChips({ features, max = 6 }) {
  const shown = features.slice(0, max);
  const rest = features.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((f) => (
        <span
          key={f.name}
          className="inline-flex items-center gap-1 text-xs rounded-full border border-border bg-muted/40 px-2.5 py-1 text-foreground/80"
        >
          <Check className="h-3 w-3 text-success shrink-0" />
          {f.name}
        </span>
      ))}
      {rest > 0 && (
        <span className="inline-flex items-center text-xs rounded-full px-2.5 py-1 text-muted-foreground">
          +{rest} more
        </span>
      )}
    </div>
  );
}

// Codex P2 2026-08-16 — SECURITY-MODEL NOTE on currentTier.
//
// The `currentTier` state below drives the paywall render (upgrade vs.
// "already subscribed" vs. cancel-retention). A client-side mutation of
// this state (React DevTools, injected JS) would suppress the upgrade
// surface and display "Safety Plus plan" without a real RC entitlement.
// That is a UX misrepresentation, NOT an authority upgrade — every actual
// paid feature (RC-signed promotional offers, StoreKit purchases,
// server-verified entitlement in resolveTier()) re-validates against
// RevenueCat's own SDK, which pulls the authoritative grant from Apple /
// Google. A user who forges their own tier state locally sees a wrong
// screen and gets zero premium capability; nobody else is affected.
//
// Adding a per-render `await getCustomerInfo()` here to "verify before
// rendering" would (a) hammer RC on every render, (b) still be forgeable
// (the same JS attacker can stub the SDK), and (c) not change the
// authority model. So this file trusts `currentTier` for display and
// relies on the authoritative gate at the point features are actually
// consumed (see entitlement.js / TierProvider.js). Documented so a
// future reviewer does not add security theater. If a REAL server-side
// feature is added that gates on currentTier, THAT gate must re-verify
// via resolveTier() at consumption time, not trust the client cache.
export default function Subscription() {
  const { currentTier, refreshTier } = useTier();
  const currentPlanName = tierLabel(currentTier);
  const isSafetyPlusPlan = currentTier === TIER.SAFETY_PLUS;
  const isAiSecurityProtectionPlan = currentTier === TIER.AI_SECURITY_PROTECTION;
  const isPaidPlan = isPaidTier(currentTier);
  const { locale, fiatCurrency } = useLocalePreferences();
  // "$0" hardcoded here mis-labeled the Free tier price for non-USD users
  // (the store never returns a Free package, so no priceString source exists).
  // Rendering 0 in the user's chosen fiat via Intl keeps it honest: JP users
  // see "¥0", GBP users see "£0.00", US users see "$0.00".
  let freeTierPrice;
  try {
    freeTierPrice = new Intl.NumberFormat(locale, { style: 'currency', currency: fiatCurrency }).format(0);
  } catch {
    freeTierPrice = 'Free';
  }
  const [monthlyPackage, setMonthlyPackage] = useState(null);
  const [annualPackage, setAnnualPackage] = useState(null);
  const [aiMonthlyPackage, setAiMonthlyPackage] = useState(null);
  const [aiAnnualPackage, setAiAnnualPackage] = useState(null);
  const [referralMonthly, setReferralMonthly] = useState(null);
  const [referralOfferTag, setReferralOfferTag] = useState(null);
  const [referralAnnual, setReferralAnnual] = useState(null);
  const [aiReferralMonthly, setAiReferralMonthly] = useState(null);
  const [aiReferralOfferTag, setAiReferralOfferTag] = useState(null);
  const [aiReferralAnnual, setAiReferralAnnual] = useState(null);
  const [referrerTierInfo, setReferrerTierInfo] = useState(null);
  const [billing, setBilling] = useState("annual");
  const [busy, setBusy] = useState(false);
  // F-radiogroup (2026-07-20 branch review): the two billing buttons were
  // role="radio" inside a role="radiogroup" but relied on plain Tab-order +
  // click, with no arrow-key movement and no roving tabindex. Both buttons
  // were already natively focusable and Enter/Space-operable, so this was an
  // APG pattern deviation rather than a keyboard block — but a real
  // radiogroup should move (and select) with the arrow keys, matching native
  // <input type="radio"> group behaviour.
  const monthlyRadioRef = useRef(null);
  const annualRadioRef = useRef(null);
  const BILLING_ORDER = ["monthly", "annual"];
  const billingRadioRefs = { monthly: monthlyRadioRef, annual: annualRadioRef };
  function handleBillingKeyDown(e) {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const idx = BILLING_ORDER.indexOf(billing);
    const next = BILLING_ORDER[(idx + dir + BILLING_ORDER.length) % BILLING_ORDER.length];
    setBilling(next);
    billingRadioRefs[next].current?.focus();
  }
  const isNative = Capacitor.isNativePlatform();
  const hasReferral = hasRedeemed();

  // Outcome-first preamble. Only non-subscribers see it, ONCE per device, and
  // only until they reach pricing — existing subscribers land straight on the
  // manage view. `null` means "past the preamble" (or never in it).
  //
  // Once-per-device matters: someone who read the story, left, and came back to
  // subscribe is already sold. Re-paging them through three screens to reach the
  // price is friction on exactly the user who decided to pay. Deniability/demo
  // sessions skip the marker write, so they simply see it each time (I3 — a
  // decoy session leaves no trace that the real user visited the paywall).
  const [outcomeStep, setOutcomeStep] = useState(() => {
    if (isPaidPlan) return null;
    try {
      return localStorage.getItem(OUTCOME_SEEN_KEY) ? null : 0;
    } catch { return 0; }
  });
  const [cancelOfferOpen, setCancelOfferOpen] = useState(false);
  const [retentionMonthly, setRetentionMonthly] = useState(null);
  const [retentionAnnual, setRetentionAnnual] = useState(null);
  const aiOfferingId = getAiSecurityProtectionOfferingId();

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;

    function extractPackages(offering) {
      const packages = offering?.availablePackages ?? [];
      const monthly = packages.find((p) => p.identifier === SAFETY_PLUS_MONTHLY_PACKAGE) ?? null;
      const annual = packages.find((p) => p.identifier === SAFETY_PLUS_ANNUAL_PACKAGE) ?? null;
      const fallback = !monthly && !annual ? packages[0] ?? null : null;
      return { monthly: monthly ?? fallback, annual };
    }

    getOfferings()
      .then((offering) => {
        if (cancelled) return;
        const { monthly, annual } = extractPackages(offering);
        setMonthlyPackage(monthly);
        setAnnualPackage(annual);
      })
      .catch((err) => {
        console.warn("Safety Plus offerings unavailable:", err);
      });

    if (aiOfferingId) {
      getTierOffering(aiOfferingId)
        .then((offering) => {
          if (cancelled) return;
          const { monthly, annual } = extractPackages(offering);
          setAiMonthlyPackage(monthly);
          setAiAnnualPackage(annual);
        })
        .catch(() => {});
    } else {
      setAiMonthlyPackage(null);
      setAiAnnualPackage(null);
    }

    if (hasReferral) {
      const refCode = getRedeemedCode();
      if (refCode) {
        fetchPaidCount(refCode)
          .then((paid) => {
            if (cancelled || paid == null) return;
            const tierKey = getTier(paid);
            const info = getTierInfo(paid);
            setReferrerTierInfo(info);
            const offeringId = getOfferingIdForTier(tierKey, TIER.SAFETY_PLUS);
            const aiReferralId = getOfferingIdForTier(tierKey, TIER.AI_SECURITY_PROTECTION);
            if (offeringId) {
              // The offering id doubles as the Play offer tag (referral-gold →
              // the offer tagged `referral-gold`). Held so handleUpgrade can name
              // the option explicitly — see purchases.js findOfferOption.
              setReferralOfferTag(offeringId);
            } else {
              setReferralOfferTag(null);
            }
            if (aiReferralId) {
              setAiReferralOfferTag(aiReferralId);
            } else {
              setAiReferralOfferTag(null);
            }
            return Promise.all([
              offeringId ? getTierOffering(offeringId) : Promise.resolve(null),
              aiReferralId ? getTierOffering(aiReferralId) : Promise.resolve(null),
            ]);
          })
          .then(([offering, aiOffering]) => {
            if (cancelled) return;
            if (offering) {
              const { monthly, annual } = extractPackages(offering);
              setReferralMonthly(monthly);
              setReferralAnnual(annual);
            } else {
              setReferralMonthly(null);
              setReferralAnnual(null);
            }
            if (aiOffering) {
              const { monthly, annual } = extractPackages(aiOffering);
              setAiReferralMonthly(monthly);
              setAiReferralAnnual(annual);
            } else {
              setAiReferralMonthly(null);
              setAiReferralAnnual(null);
            }
          })
          .catch(() => {});
      }
    } else {
      setReferralMonthly(null);
      setReferralAnnual(null);
      setReferralOfferTag(null);
      setAiReferralMonthly(null);
      setAiReferralAnnual(null);
      setAiReferralOfferTag(null);
    }

    // Retention offering — only meaningful to someone who already subscribes.
    // Absent unless a promotional offer is configured store-side, in which case
    // getTierOffering resolves to null and the dialog shows no price.
    if (isPaidPlan) {
      // Promise.resolve() wraps the call: this runs on the MANAGE view of a
      // paying subscriber, and a retention offer is a nice-to-have. If the
      // lookup throws synchronously or returns a non-thenable, the failure must
      // degrade to "no offer" — never take down the page where someone manages
      // a subscription they are already paying for.
      Promise.resolve()
        .then(() => getTierOffering(RETENTION_OFFERING_ID))
        .then((offering) => {
          if (cancelled || !offering) return;
          const { monthly, annual } = extractPackages(offering);
          setRetentionMonthly(monthly);
          setRetentionAnnual(annual);
        })
        .catch(() => {});
    }

    return () => { cancelled = true; };
  }, [aiOfferingId, isNative, hasReferral, currentTier, isPaidPlan]);

  const hasDiscount = hasReferral && Boolean(referralMonthly || referralAnnual);
  const effectiveMonthly = (hasDiscount && referralMonthly) ? referralMonthly : monthlyPackage;
  const effectiveAnnual = (hasDiscount && referralAnnual) ? referralAnnual : annualPackage;
  const hasAiDiscount = hasReferral && Boolean(aiReferralMonthly || aiReferralAnnual);
  const effectiveAiMonthly = (hasAiDiscount && aiReferralMonthly) ? aiReferralMonthly : aiMonthlyPackage;
  const effectiveAiAnnual = (hasAiDiscount && aiReferralAnnual) ? aiReferralAnnual : aiAnnualPackage;
  const selectedAiPackage = billing === "annual"
    ? (effectiveAiAnnual ?? effectiveAiMonthly)
    : (effectiveAiMonthly ?? effectiveAiAnnual);
  const aiOfferingConfigured = Boolean(aiOfferingId);
  const aiPurchaseAvailable = Boolean(selectedAiPackage);

  // Both monthly and annual plans always exist as product offerings, so the
  // toggle always renders. On sideloaded builds where Play Billing is
  // unavailable, `effectiveMonthly`/`effectiveAnnual` are null — the toggle
  // still shows both plans with fallback price strings, and `handleUpgrade`
  // early-returns on a falsy `selectedPackage` (I4, fail-honest).
  const hasAnnualToggle = true;
  const effectiveBilling = billing;
  const selectedPackage = effectiveBilling === "annual" ? effectiveAnnual : effectiveMonthly;

  // Name the offer ONLY when the package actually being bought is the
  // discounted one. If a tier resolved for monthly but not annual, the annual
  // package is the full-price one and must be purchased without a tag —
  // otherwise the fail-closed guard in purchasePackage rejects a legitimate
  // full-price sale.
  // Per-plan, because a tier can resolve for one billing period and not the
  // other — the toggle must be able to show a discounted monthly price beside
  // a full-price annual one without either being mislabelled.
  const usingReferralMonthly =
    hasDiscount && effectiveMonthly != null && effectiveMonthly === referralMonthly;
  const usingReferralAnnual =
    hasDiscount && effectiveAnnual != null && effectiveAnnual === referralAnnual;

  const usingReferralPackage =
    effectiveBilling === "annual" ? usingReferralAnnual : usingReferralMonthly;
  const activeOfferTag = usingReferralPackage ? referralOfferTag : null;
  const usingAiReferralMonthly =
    hasAiDiscount && effectiveAiMonthly != null && effectiveAiMonthly === aiReferralMonthly;
  const usingAiReferralAnnual =
    hasAiDiscount && effectiveAiAnnual != null && effectiveAiAnnual === aiReferralAnnual;
  const usingAiReferralPackage =
    effectiveBilling === "annual" ? usingAiReferralAnnual : usingAiReferralMonthly;
  const aiActiveOfferTag = usingAiReferralPackage ? aiReferralOfferTag : null;

  // A discounted package still reports the BASE price in product.priceString —
  // it wraps the same store product as the full-price package. The offer price
  // has to come from the offer itself (see purchases.js offerPriceInfo), or the
  // paywall quotes $5.99 to a referred user and then charges $5.39.
  const referralMonthlyPrice = usingReferralMonthly
    ? offerPriceInfo(referralMonthly, referralOfferTag)?.priceString
    : null;
  const referralAnnualPrice = usingReferralAnnual
    ? offerPriceInfo(referralAnnual, referralOfferTag)?.priceString
    : null;
  const aiReferralMonthlyPrice = usingAiReferralMonthly
    ? offerPriceInfo(aiReferralMonthly, aiReferralOfferTag)?.priceString
    : null;
  const aiReferralAnnualPrice = usingAiReferralAnnual
    ? offerPriceInfo(aiReferralAnnual, aiReferralOfferTag)?.priceString
    : null;

  // No hardcoded USD fallback: quoting "$5.99" to a JP/EU user whose store
  // hasn't resolved yet would misidentify the currency AND lock in the wrong
  // number. When unresolvable we render "—" (see below) so the paywall never
  // advertises a price we can't stand behind (I4 fail-honest, matches the
  // offerPriceInfo path in purchases.js).
  const monthlyPriceString =
    referralMonthlyPrice ?? effectiveMonthly?.product?.priceString ?? null;
  const annualPriceString =
    referralAnnualPrice ?? effectiveAnnual?.product?.priceString ?? null;
  const regularMonthlyPrice = monthlyPackage?.product?.priceString;
  const regularAnnualPrice = annualPackage?.product?.priceString;
  const selectedPriceString = effectiveBilling === "annual" ? annualPriceString : monthlyPriceString;
  const selectedRegularPrice = effectiveBilling === "annual" ? regularAnnualPrice : regularMonthlyPrice;
  const aiMonthlyPriceString =
    aiReferralMonthlyPrice ?? effectiveAiMonthly?.product?.priceString ?? null;
  const aiAnnualPriceString =
    aiReferralAnnualPrice ?? effectiveAiAnnual?.product?.priceString ?? null;
  const aiRegularMonthlyPrice = aiMonthlyPackage?.product?.priceString;
  const aiRegularAnnualPrice = aiAnnualPackage?.product?.priceString;
  const aiSelectedPriceString = effectiveBilling === "annual" ? aiAnnualPriceString : aiMonthlyPriceString;
  const aiSelectedRegularPrice = effectiveBilling === "annual" ? aiRegularAnnualPrice : aiRegularMonthlyPrice;

  // The NUMBERS behind the two strings above, so the annual-saving claim is
  // derived from exactly what is on screen rather than hardcoded. Same
  // offer-then-base precedence as the strings; no literal fallback, because a
  // guessed price must not become an advertised percentage.
  const monthlyPriceNumber = usingReferralMonthly
    ? offerPriceInfo(referralMonthly, referralOfferTag)?.price
    : effectiveMonthly?.product?.price;
  const annualPriceNumber = usingReferralAnnual
    ? offerPriceInfo(referralAnnual, referralOfferTag)?.price
    : effectiveAnnual?.product?.price;
  const aiMonthlyPriceNumber = usingAiReferralMonthly
    ? offerPriceInfo(aiReferralMonthly, aiReferralOfferTag)?.price
    : effectiveAiMonthly?.product?.price;
  const aiAnnualPriceNumber = usingAiReferralAnnual
    ? offerPriceInfo(aiReferralAnnual, aiReferralOfferTag)?.price
    : effectiveAiAnnual?.product?.price;
  // null whenever either side is unresolvable or annual is not actually cheaper —
  // the badge and the billing note then render nothing at all (I4).
  const savingPercent = annualSavingPercent(monthlyPriceNumber, annualPriceNumber);
  const aiSavingPercent = annualSavingPercent(aiMonthlyPriceNumber, aiAnnualPriceNumber);

  // The referral banner's "% off", derived from the BASE list price and the price
  // the store will actually charge for the plan currently selected. It used to
  // render referrerTierInfo.commission — which is the REFERRER's earnings rate
  // from the static TIERS table, not the buyer's discount, and was set before any
  // offering resolved. Two different numbers that only coincide at USD base
  // prices: Apple cannot express Bronze's 2.5% so it charges $5.79 (really 3.34%
  // off), and FX rounding erases the discount entirely in some territories
  // (Bronze is full price in Albania/Armenia) where the banner still promised
  // "2.5% off". Unresolvable or erased => null => no percentage is claimed (I4).
  const selectedBasePrice = effectiveBilling === "annual"
    ? annualPackage?.product?.price
    : monthlyPackage?.product?.price;
  const selectedOfferPrice = effectiveBilling === "annual"
    ? annualPriceNumber
    : monthlyPriceNumber;
  const referralDiscount = discountPercent(selectedBasePrice, selectedOfferPrice);
  const aiSelectedBasePrice = effectiveBilling === "annual"
    ? aiAnnualPackage?.product?.price
    : aiMonthlyPackage?.product?.price;
  const aiSelectedOfferPrice = effectiveBilling === "annual"
    ? aiAnnualPriceNumber
    : aiMonthlyPriceNumber;
  const aiReferralDiscount = discountPercent(aiSelectedBasePrice, aiSelectedOfferPrice);
  const hasAnyReferralDiscount = hasDiscount || hasAiDiscount;
  const activeReferralPercent = referralDiscount ?? aiReferralDiscount;

  async function purchaseAndRefresh(pkg, {
    offerTag = null,
    expectedTier = TIER.SAFETY_PLUS,
    attributionPlanId = TIER.SAFETY_PLUS,
    billingPeriod = effectiveBilling,
    basePrice = null,
    offerPrice = null,
    successLabel,
    pendingLabel,
  } = {}) {
    if (!pkg) return;
    const refCode = getRedeemedCode();
    const needsAttribution = Boolean(refCode) && !hasAttributed();
    const fullPrice = getPlanFullPriceCents(attributionPlanId, billingPeriod);
    if (needsAttribution && !fullPrice && expectedTier === TIER.AI_SECURITY_PROTECTION) {
      toast.error("AI Security Protection referral pricing is not configured in this build yet — nothing was charged");
      return;
    }
    if (offerTag && needsAttribution && !fullPrice) {
      toast.error("This referral discount is not configured in this build yet — nothing was charged");
      return;
    }
    setBusy(true);
    try {
      await purchasePackage(pkg, { offerTag });
      // Codex P1 2026-08-16: purchasePackage() returning is NOT the same as
      // "entitlement granted". RC + StoreKit / Play Billing can delay,
      // fail, or downgrade the grant after the call resolves (deferred
      // parental-consent, sandbox-lag, price-change reconfirm, etc.). We
      // used to fire referral attribution + bonus + "Safety Plus unlocked"
      // toast unconditionally on that return — recording an attribution
      // for a purchase that didn't actually confer the entitlement. The
      // fix: refreshTier() RETURNS the resolved tier (see TierProvider),
      // and every side effect below is gated on that === 'safety_plus'.
      // If the grant hasn't landed yet the UI stays on the paywall — the
      // user can retry / restore purchases; RC will eventually reconcile
      // and the next refresh will flip currentTier for real.
      const resolvedTier = await refreshTier();
      if (resolvedTier !== expectedTier) {
        toast.info(pendingLabel ?? 'Purchase started — waiting for the store to confirm. Try Restore Purchases if it does not appear in a minute.');
        return;
      }
      if (refCode && !hasAttributed()) {
        // Codex P2 2026-08-15: previously discountCents came from the
        // REFERRER's tier commission percentage — a hardcoded "should be"
        // number that ignored what the store actually charged. Apple's
        // per-territory rounding + FX flattening frequently produce a
        // smaller discount than the tier percentage (Bronze is full price
        // in several territories per CLAUDE.md 07-23 log). Attribution
        // rows then reported a discount that never happened, inflating
        // downstream referrer earnings on paper. Derive from the store-
        // returned price DELTA (base priceString - offer priceString) so
        // the attribution matches the money that actually moved.
        if (!fullPrice) {
          toast.success(successLabel ?? `${tierLabel(expectedTier)} unlocked`);
          return;
        }
        // Branch review 2026-08-15 (C-1): this subtracted the store's price (the
        // USER'S currency) from PLAN_FULL_PRICE_CENTS (hardcoded USD), which is
        // only meaningful in USD territories. Both inputs now come from the SAME
        // package, so the units cancel and storeDiscountCents works from a
        // dimensionless ratio. See lib/referral.js for the full rationale.
        // selectedBasePrice / selectedOfferPrice already exist above for the
        // on-screen percentage — reuse them rather than re-deriving, so the
        // attribution and the banner can never disagree about what was charged.
        const discountCents = storeDiscountCents(basePrice, offerPrice, fullPrice);
        try {
          await recordAttribution(refCode, attributionPlanId, billingPeriod, fullPrice, discountCents);
          markAttributed();
          claimFirstReferralBonus(refCode).catch(() => {});
        } catch { /* best-effort — retry on next purchase if Supabase failed */ }
        // #1703: the user's OWN code is bound to RC at app start (TierProvider →
        // bindOwnReferralCode). Do NOT send refCode here — that is the REFERRER's
        // code and would bind THIS user's rc_user_id to the referrer's row.
      }
      toast.success(successLabel ?? `${tierLabel(expectedTier)} unlocked`);
    } catch (err) {
      if (err?.code === OFFER_UNAVAILABLE) {
        // The referral discount could not be applied. Say so plainly rather
        // than "try again" — retrying will not help, and the alternative
        // (charging full price after showing a discount) is worse than failing.
        toast.error("Your referral discount isn't available right now — nothing was charged");
      } else if (!err?.userCancelled) {
        toast.error("Purchase failed — please try again");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleUpgrade() {
    return purchaseAndRefresh(selectedPackage, {
      offerTag: activeOfferTag,
      expectedTier: TIER.SAFETY_PLUS,
      attributionPlanId: TIER.SAFETY_PLUS,
      billingPeriod: effectiveBilling,
      basePrice: selectedBasePrice,
      offerPrice: selectedOfferPrice,
      successLabel: 'Safety Plus unlocked',
      pendingLabel: 'Purchase started — waiting for Safety Plus to be confirmed. Try Restore Purchases if it does not appear in a minute.',
    });
  }

  async function handleAiUpgrade() {
    return purchaseAndRefresh(selectedAiPackage, {
      offerTag: aiActiveOfferTag,
      expectedTier: TIER.AI_SECURITY_PROTECTION,
      attributionPlanId: TIER.AI_SECURITY_PROTECTION,
      billingPeriod: effectiveBilling,
      basePrice: aiSelectedBasePrice,
      offerPrice: aiSelectedOfferPrice,
      successLabel: 'AI Security Protection unlocked',
      pendingLabel: 'Purchase started — waiting for AI Security Protection to be confirmed. Try Restore Purchases if it does not appear in a minute.',
    });
  }

  async function handleRestore() {
    setBusy(true);
    try {
      await restorePurchases();
      const tier = await refreshTier();
      toast[tier === TIER.FREE ? "info" : "success"](
        tier === TIER.FREE ? "No active subscription purchase found" : `${tierLabel(tier)} restored`
      );
    } catch {
      toast.error("Restore failed — please try again");
    } finally {
      setBusy(false);
    }
  }

  // Cancel INTENT, not cancellation. Tapping "Manage subscription" is the last
  // moment we own — the deep-link below hands off to Apple/Google, and there is
  // no event, callback or hook available to us on the far side of it. So the
  // retention offer is shown here or not at all.
  function handleManage() {
    setCancelOfferOpen(true);
  }

  async function openStoreSubscriptions() {
    setCancelOfferOpen(false);
    try {
      await manageSubscription();
    } catch {
      toast.error("Couldn't open subscription settings");
    }
  }

  function renderManageSubscriptionControls() {
    if (!isNative) return null;
    return (
      <>
        <Button variant="outline" className="w-full" onClick={handleManage}>
          <ExternalLink className="h-4 w-4 me-2" />
          Manage subscription
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          Opens the {Capacitor.getPlatform() === "ios" ? "App Store" : "Play Store"} settings —
          cancel, change plan or update payment there.
        </p>
      </>
    );
  }

  // Outcome-first preamble: sell the result before showing a price. Skippable,
  // and never shown to someone who already subscribes.
  if (outcomeStep !== null) {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-6">
        <BackButton />
        <OutcomeSteps
          step={outcomeStep}
          onNext={() =>
            setOutcomeStep((s) => {
              if (s + 1 < OUTCOME_STEPS.length) return s + 1;
              markOutcomeSeen();
              return null;
            })
          }
          onBack={() => setOutcomeStep((s) => Math.max(0, s - 1))}
          onSkip={() => { markOutcomeSeen(); setOutcomeStep(null); }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <BackButton />

      <CancelOfferDialog
        open={cancelOfferOpen}
        onOpenChange={setCancelOfferOpen}
        onKeep={() => setCancelOfferOpen(false)}
        onContinue={openStoreSubscriptions}
        currentTier={currentTier}
        // Only ever a package that genuinely exists in the current offering —
        // never a client-side computed "discount". With no promotional offer
        // configured in App Store Connect / Play Console this is null and the
        // dialog shows no price, which is correct.
        offerPackage={effectiveBilling === "annual" ? retentionAnnual : retentionMonthly}
        // The retention package wraps the same product as the current one, so
        // its priceString is the FULL price. Without the real offer price the
        // dialog rendered "$5.99 struck through, $5.99" under "Stay for less".
        // Null here means the dialog shows no price at all, which is correct.
        offerPrice={offerPriceInfo(
          effectiveBilling === "annual" ? retentionAnnual : retentionMonthly,
          RETENTION_OFFERING_ID
        )}
        currentPackage={effectiveBilling === "annual" ? annualPackage : monthlyPackage}
        currentPriceString={effectiveBilling === "annual" ? regularAnnualPrice : regularMonthlyPrice}
      />

      <div>
        <h1 className="text-3xl font-bold">Plans</h1>
        <div className="text-muted-foreground mt-1 text-sm">
          You are on the{" "}
          <Badge variant="outline" className={CURRENT_BADGE}>
            {currentPlanName} plan
          </Badge>{" "}
          — the complete self-custody wallet, no account required.
        </div>
      </div>

      {!isNative && (
        <div className="flex items-start gap-3 rounded-xl border border-caution/20 bg-caution/5 p-4">
          <Info className="h-5 w-5 text-caution shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            In-app purchase via Google Play and App Store is available in the mobile app.
            This web build is testing-only — install Veyrnox on iOS or Android to upgrade.
          </p>
        </div>
      )}

      {isNative && (
        <p className="text-xs text-muted-foreground text-center px-4">
          Purchases are verified securely through the App Store or Google Play. Your wallet stays private.
        </p>
      )}

      {hasAnyReferralDiscount && !isPaidPlan && (
        <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
          <Sparkles className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-success">
              Referral pricing available{activeReferralPercent != null ? ` — up to ${activeReferralPercent}% off` : ""}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              You used a friend&rsquo;s referral code — eligible paid plans can show discounted store pricing when their referral offering is configured.
            </p>
          </div>
        </div>
      )}

      {/* ── Quick feature summary (names only; full detail on /safety-plus) ── */}
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Free</h2>
            <span className="text-sm font-bold mono-value">{freeTierPrice}</span>
            {currentTier === TIER.FREE && (
              <Badge variant="outline" className={`${CURRENT_BADGE} text-[10px] px-1.5 py-0 h-4`}>Current</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Everything to hold, send and secure your crypto — no account required.</p>
          <HighlightChips features={FREE_FEATURES} max={6} />
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-primary flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Safety Plus adds
            {isSafetyPlusPlan && (
              <Badge variant="outline" className={`${CURRENT_BADGE} text-[10px] px-1.5 py-0 h-4`}>Current</Badge>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Everything in Free</span>, plus coercion resistance, pre-sign intelligence and advanced analytics.
          </p>
          <HighlightChips features={SAFETY_PLUS_FEATURES} max={6} />
          <Link to="/safety-plus" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            {/* Icon mirrors under dir="rtl" — forward navigation link arrow. */}
            See all Safety Plus features <ArrowRight className="h-3 w-3 rtl:-scale-x-100" />
          </Link>
        </div>

      </div>

      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            Safety Plus
            <Sparkles className="h-4 w-4 text-primary" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSafetyPlusPlan ? (
            <>
              <p className="text-sm text-muted-foreground">
                You’re on Safety Plus — all features unlocked.
              </p>
              {renderManageSubscriptionControls()}
            </>
          ) : isAiSecurityProtectionPlan ? (
            <>
              <p className="text-sm text-muted-foreground">
                Your current paid plan is {currentPlanName}, which already includes every Safety Plus feature.
              </p>
              <p className="text-xs text-muted-foreground">
                This card stays here so the included Safety Plus pricing remains visible, but your entitlement is already above it.
              </p>
            </>
          ) : (
            <>
              {/* Month / Year selector */}
              {hasAnnualToggle && (
                <div
                  role="radiogroup"
                  aria-label="Billing period"
                  onKeyDown={handleBillingKeyDown}
                  className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-muted/40 border border-border"
                >
                  <button
                    ref={monthlyRadioRef}
                    type="button"
                    role="radio"
                    aria-checked={effectiveBilling === "monthly"}
                    tabIndex={effectiveBilling === "monthly" ? 0 : -1}
                    onClick={() => setBilling("monthly")}
                    className={
                      "text-sm rounded-md px-3 py-2 transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                      (effectiveBilling === "monthly"
                        ? "bg-background border border-border font-medium"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    Monthly
                    <span className="block text-xs text-muted-foreground font-normal mono-value">
                      {monthlyPriceString ?? "—"}
                      {hasDiscount && regularMonthlyPrice && regularMonthlyPrice !== monthlyPriceString && (
                        <span className="ms-1 line-through opacity-60">{regularMonthlyPrice}</span>
                      )}
                    </span>
                  </button>
                  <button
                    ref={annualRadioRef}
                    type="button"
                    role="radio"
                    aria-checked={effectiveBilling === "annual"}
                    tabIndex={effectiveBilling === "annual" ? 0 : -1}
                    onClick={() => setBilling("annual")}
                    className={
                      "text-sm rounded-md px-3 py-2 transition-colors text-center relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                      (effectiveBilling === "annual"
                        ? "bg-background border border-primary/40 font-medium"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    Annual
                    {/* Derived from the two prices actually rendered, not a
                        hardcoded "30%". Monthly and annual resolve through two
                        independent offer lookups, so annual can end up the worse
                        deal; when it does — or when either price is unresolvable —
                        annualSavingPercent returns null and no badge is shown. */}
                    {savingPercent != null && (
                      <Badge
                        variant="outline"
                        className="absolute -top-2 end-1 text-[9px] leading-none px-1.5 py-0.5 h-auto border-primary/40 bg-background text-primary whitespace-nowrap"
                      >
                        Save {savingPercent}%
                      </Badge>
                    )}
                    <span className="block text-xs text-muted-foreground font-normal mono-value">
                      {annualPriceString ?? "—"}
                      {hasDiscount && regularAnnualPrice && regularAnnualPrice !== annualPriceString && (
                        <span className="ms-1 line-through opacity-60">{regularAnnualPrice}</span>
                      )}
                    </span>
                  </button>
                </div>
              )}

              {/* Selected price */}
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold mono-value">{selectedPriceString ?? "—"}</span>
                {/* Strike the regular price only when it DIFFERS from what is
                    shown. If the offer price could not be read we fall back to
                    the base price, and "$5.99 struck-through $5.99" would
                    claim a saving that isn't there. Same guard as the toggle
                    rows above. */}
                {hasDiscount &&
                  selectedRegularPrice &&
                  selectedRegularPrice !== selectedPriceString && (
                    <span className="text-base text-muted-foreground line-through mono-value">
                      {selectedRegularPrice}
                    </span>
                  )}
              </div>
              {effectiveBilling === "annual" && (
                <p className="text-xs text-muted-foreground -mt-2">
                  {/* Was "4 months free vs. monthly." — wrong even at USD base
                      (12 - 49.99/5.99 = 3.65), and a second hand-maintained number
                      saying what the badge already says. One derived claim now. */}
                  Billed annually{savingPercent != null && <> — save {savingPercent}% vs. paying monthly</>}.
                </p>
              )}

              {/* CTA */}
              <Button
                disabled={!isNative || !selectedPackage || busy}
                className="w-full"
                onClick={handleUpgrade}
              >
                {busy ? <Loader2 className="h-4 w-4 me-2 motion-safe:animate-spin" /> : <Sparkles className="h-4 w-4 me-2" />}
                {isNative ? (selectedPriceString ? `Upgrade — ${selectedPriceString}` : "Upgrade — loading pricing") : "Upgrade — mobile only"}
              </Button>

              {/* Renewal terms. Both stores require this disclosure at the
                  point of purchase, so it sits with the CTA rather than in
                  small print further down. */}
              <p className="text-xs text-muted-foreground text-center">
                <span className="font-semibold text-foreground">Cancel anytime.</span>{" "}
                Renews {effectiveBilling === "annual" ? "yearly" : "monthly"} at{" "}
                {selectedPriceString ?? "the store price"} until cancelled — manage or cancel in your{" "}
                {Capacitor.getPlatform() === "ios" ? "App Store" : "Google Play"} account settings.
              </p>
              {isNative ? (
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={busy}
                  className="text-xs text-muted-foreground underline w-full text-center"
                >
                  Restore purchases
                </button>
              ) : (
                <p className="text-xs text-muted-foreground text-center">
                  No payment can be made on this screen. Your plan stays Free on web.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Pricing (Month / Year) ── */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-600 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> AI Security Protection adds
          {isAiSecurityProtectionPlan && (
            <Badge variant="outline" className={`${CURRENT_BADGE} text-[10px] px-1.5 py-0 h-4`}>Current</Badge>
          )}
        </h2>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Everything in Free and Safety Plus stays included.</span>
          {" "}AI Security Protection adds live online TIP-backed Vigil answers on top.
        </p>
        <HighlightChips features={AI_SECURITY_PROTECTION_FEATURES} max={4} />
      </div>

      <Card className="border-sky-500/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg text-sky-700">
            AI Security Protection
            <Sparkles className="h-4 w-4 text-sky-600" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4" data-testid="ai-security-protection-card">
          {isAiSecurityProtectionPlan ? (
            <>
              <p className="text-sm text-muted-foreground">
                You're on AI Security Protection — the real-time protection layer with malicious dApp warnings, unsafe DEX and phishing detection, and the AI Advisor overlay on Transaction Simulation.
              </p>
              {renderManageSubscriptionControls()}
              {!isNative && (
                <p className="text-xs text-muted-foreground text-center">
                  Web remains read-only for subscriptions; manage this plan from your mobile app store account.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                AI Security Protection includes everything in Free and Safety Plus, then adds live online TIP-backed Vigil answers.
              </p>
              {isNative ? (
                aiOfferingConfigured ? (
                  <>
                    {/* Monthly / Annual toggle — mirrors Safety Plus. Renders
                        even when packages haven't resolved yet so the paywall
                        keeps its shape; prices fall back to "—" and the
                        Upgrade button is disabled below. */}
                    <div
                      role="radiogroup"
                      aria-label="AI Security Protection billing period"
                      className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-muted/40 border border-border"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={effectiveBilling === "monthly"}
                        onClick={() => setBilling("monthly")}
                        className={
                          "text-sm rounded-md px-3 py-2 transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                          (effectiveBilling === "monthly"
                            ? "bg-background border border-sky-500/40 font-medium"
                            : "text-muted-foreground hover:text-foreground")
                        }
                      >
                        Monthly
                        <span className="block text-xs text-muted-foreground font-normal mono-value">
                          {aiMonthlyPriceString ?? "—"}
                          {hasAiDiscount && aiRegularMonthlyPrice && aiRegularMonthlyPrice !== aiMonthlyPriceString && (
                            <span className="ms-1 line-through opacity-60">{aiRegularMonthlyPrice}</span>
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={effectiveBilling === "annual"}
                        onClick={() => setBilling("annual")}
                        className={
                          "text-sm rounded-md px-3 py-2 transition-colors text-center relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                          (effectiveBilling === "annual"
                            ? "bg-background border border-sky-500/40 font-medium"
                            : "text-muted-foreground hover:text-foreground")
                        }
                      >
                        Annual
                        {aiSavingPercent != null && (
                          <Badge
                            variant="outline"
                            className="absolute -top-2 end-1 text-[9px] leading-none px-1.5 py-0.5 h-auto border-sky-500/40 bg-background text-sky-600 whitespace-nowrap"
                          >
                            Save {aiSavingPercent}%
                          </Badge>
                        )}
                        <span className="block text-xs text-muted-foreground font-normal mono-value">
                          {aiAnnualPriceString ?? "—"}
                          {hasAiDiscount && aiRegularAnnualPrice && aiRegularAnnualPrice !== aiAnnualPriceString && (
                            <span className="ms-1 line-through opacity-60">{aiRegularAnnualPrice}</span>
                          )}
                        </span>
                      </button>
                    </div>

                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-medium text-foreground mono-value">
                        {aiSelectedPriceString ?? "—"}
                      </p>
                      {hasAiDiscount && aiSelectedRegularPrice && aiSelectedRegularPrice !== aiSelectedPriceString && (
                        <span className="text-xs text-muted-foreground line-through mono-value">{aiSelectedRegularPrice}</span>
                      )}
                    </div>
                    <Button
                      className="w-full bg-sky-600 hover:bg-sky-700 text-white"
                      onClick={handleAiUpgrade}
                      disabled={busy || !aiPurchaseAvailable}
                    >
                      {busy
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : aiPurchaseAvailable
                          ? `Subscribe${aiSelectedPriceString ? ` • ${aiSelectedPriceString}` : ''}`
                          : "Subscribe — loading pricing"}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Billed as an in-app subscription through the {Capacitor.getPlatform() === "ios" ? "App Store" : "Play Store"}.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    AI Security Protection is intended to be sold as an in-app subscription, but its RevenueCat offering is not configured in this build yet.
                  </p>
                )
              ) : (
                <p className="text-xs text-muted-foreground">
                  Web remains read-only for subscriptions; this plan is purchased and managed through the mobile app stores.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
