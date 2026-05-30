import { base44 } from "@/api/base44Client";

export async function logAuditEvent({ action, category, details, severity = "info" }) {
  try {
    await base44.entities.AuditLog.create({
      action,
      category,
      details,
      severity,
      user_agent: navigator.userAgent.substring(0, 200),
    });
  } catch {
    // Non-blocking — audit log failure should never block user actions
  }
}