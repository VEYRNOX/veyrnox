/**
 * Rate Limiter Backend Function
 * Tracks and enforces per-user request limits for critical operations.
 * Stores rate limit windows in memory (per-instance) — suitable for abuse prevention.
 *
 * POST payload: { action: string, userId: string, maxRequests?: number, windowSeconds?: number }
 * Returns: { allowed: boolean, remaining: number, resetAt: string }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// In-memory store: key -> { count, windowStart }
const rateLimitStore = new Map();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, maxRequests = 5, windowSeconds = 60 } = await req.json();

    if (!action) {
      return Response.json({ error: 'action is required' }, { status: 400 });
    }

    const key = `${user.id}:${action}`;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    let record = rateLimitStore.get(key);

    if (!record || now - record.windowStart > windowMs) {
      // Start fresh window
      record = { count: 0, windowStart: now };
    }

    record.count += 1;
    rateLimitStore.set(key, record);

    const remaining = Math.max(0, maxRequests - record.count);
    const allowed = record.count <= maxRequests;
    const resetAt = new Date(record.windowStart + windowMs).toISOString();

    if (!allowed) {
      return Response.json(
        { allowed: false, remaining: 0, resetAt, error: 'Rate limit exceeded. Please wait before retrying.' },
        { status: 429 }
      );
    }

    return Response.json({ allowed: true, remaining, resetAt });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});