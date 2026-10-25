// Sends refunds to the payment gateway. A refund row is created inside the cancellation
// transaction (PENDING) and sent afterwards, so a gateway outage never blocks a cancellation.
import { paymentGateway } from "../adapters/payments.js";
import { prisma } from "../db.js";
import { conflict, notFound } from "../errors.js";
import { audit } from "./audit.js";

export async function processRefund(refundId: string) {
  // Claim the refund so two workers can't send it twice: PENDING/FAILED -> PENDING with attempts+1.
  const claimed = await prisma.refund.updateMany({
    where: { id: refundId, status: { in: ["PENDING", "FAILED"] }, providerRefundId: null },
    data: { status: "PENDING", attempts: { increment: 1 } },
  });
  const refund = await prisma.refund.findUnique({ where: { id: refundId }, include: { payment: true } });
  if (!refund) throw notFound("Refund");
  if (claimed.count === 0) return refund;

  const outcome = refund.payment.providerPaymentId
    ? await paymentGateway()
        .refund(refund.payment.providerPaymentId, refund.amount, refund.reason)
        .catch((e: Error) => ({ ok: false as const, error: e.message, refundId: undefined }))
    : { ok: false as const, error: "Payment has no gateway payment id", refundId: undefined };

  const updated = await prisma.refund.update({
    where: { id: refund.id },
    data: outcome.ok
      ? { status: "PROCESSED", providerRefundId: outcome.refundId ?? null, failureReason: null }
      : { status: "FAILED", failureReason: outcome.error ?? "Refund failed" },
  });
  await audit({
    actorType: "SYSTEM",
    action: outcome.ok ? "refund.processed" : "refund.failed",
    entity: "refund",
    entityId: refund.id,
    after: { amount: refund.amount, status: updated.status, error: updated.failureReason },
  });
  return updated;
}

export async function retryRefund(refundId: string, adminId: string, ip?: string) {
  const r = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!r) throw notFound("Refund");
  if (r.status !== "FAILED") throw conflict("REFUND_NOT_FAILED", "Only failed refunds can be retried");
  await audit({ actorType: "ADMIN", actorId: adminId, action: "refund.retry", entity: "refund", entityId: refundId, ip });
  return processRefund(refundId);
}
