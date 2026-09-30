// Subscription status + expiry, shown on /plans and in Settings. Display only:
// it reads the lifecycle view from TierProvider and never gates anything.
// Copy comes from subscriptionCopy.STATE_COPY; every message keeps the
// "wallet and assets stay accessible" promise (pinned by tests).
import { STATE_COPY } from '@/lib/subscriptionCopy';
import { SUBSCRIPTION_STATUS } from '@/lib/subscriptionState';

export function formatExpiry(ms) {
  if (!Number.isFinite(ms)) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** { message, dateLabel } for a subscription view, or null when nothing to say. */
export function statusContent(subscription) {
  const { status, expiresAt } = subscription ?? {};
  const date = formatExpiry(expiresAt);
  switch (status) {
    case SUBSCRIPTION_STATUS.ACTIVE:
      return {
        message: STATE_COPY.active,
        dateLabel: date ? `Renews on ${date}` : null,
      };
    case SUBSCRIPTION_STATUS.CANCELLED:
      // Without a readable date, say "the end of the current billing period"
      // rather than inventing one.
      return {
        message: STATE_COPY.cancelled(date ?? 'the end of the current billing period'),
        dateLabel: date ? `Ends on ${date}` : null,
      };
    case SUBSCRIPTION_STATUS.BILLING_RETRY:
      return { message: STATE_COPY.billingRetry, dateLabel: date ? `Current period ends ${date}` : null };
    case SUBSCRIPTION_STATUS.EXPIRED:
      return { message: STATE_COPY.expired, dateLabel: date ? `Ended on ${date}` : null };
    default:
      return null;
  }
}

export default function SubscriptionStatus({ subscription, compact = false }) {
  const content = statusContent(subscription);
  if (!content) return null;
  return (
    <div
      role="status"
      data-testid="subscription-status"
      data-status={subscription.status}
      className="rounded-xl border border-border bg-secondary/30 p-3 space-y-1"
    >
      {content.dateLabel && (
        <p className="text-sm font-semibold" data-testid="subscription-expiry">{content.dateLabel}</p>
      )}
      {!compact && <p className="text-xs text-muted-foreground">{content.message}</p>}
    </div>
  );
}
