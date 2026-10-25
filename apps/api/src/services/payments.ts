// Payment orders and verification (Razorpay flow; the fake gateway follows the same steps).
import { fakeCheckoutSuccess, paymentGateway } from "../adapters/payments.js";
import { prisma } from "../db.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { confirmPayment } from "./bookings.js";

/** Creates (or reuses) a gateway order for a HELD booking. */
export async function createPaymentOrder(bookingId: string, customerId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.customerId !== customerId) throw notFound("Booking");
  if (booking.status !== "HELD") throw conflict("NOT_PAYABLE", "This booking is not waiting for payment");
  if (booking.holdExpiresAt <= new Date()) throw conflict("HOLD_EXPIRED", "Time's up. Your seats were released; please book again.");

  const gateway = paymentGateway();
  const open = await prisma.payment.findFirst({
    where: { bookingId, status: "CREATED", provider: gateway.name, amount: booking.total },
    orderBy: { createdAt: "desc" },
  });
  const payment =
    open ??
    (await (async () => {
      const order = await gateway.createOrder(booking.total, booking.code);
      return prisma.payment.create({
        data: { bookingId, provider: gateway.name, providerOrderId: order.orderId, amount: booking.total },
      });
    })());

  return {
    provider: gateway.name,
    keyId: gateway.publicKey,
    orderId: payment.providerOrderId,
    amount: payment.amount,
    currency: "INR",
    bookingCode: booking.code,
    holdExpiresAt: booking.holdExpiresAt,
  };
}

/** Called by the app after checkout succeeds. The signature proves the gateway approved it. */
export async function verifyPayment(
  customerId: string,
  input: { bookingId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
) {
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: input.razorpayOrderId }, include: { booking: true } });
  if (!payment || payment.bookingId !== input.bookingId || payment.booking.customerId !== customerId) throw notFound("Payment order");
  if (!paymentGateway().verifyPaymentSignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
    throw badRequest("BAD_SIGNATURE", "Payment could not be verified");
  }
  return confirmPayment({ providerOrderId: input.razorpayOrderId, providerPaymentId: input.razorpayPaymentId, source: "app" });
}

/** Razorpay webhook: payment.captured confirms; payment.failed records the failure (the hold stays until it expires). */
export async function handleWebhook(rawBody: string, signature: string | undefined) {
  if (!signature || !paymentGateway().verifyWebhookSignature(rawBody, signature)) {
    throw badRequest("BAD_SIGNATURE", "Webhook signature is not valid");
  }
  const event = JSON.parse(rawBody) as {
    event: string;
    payload?: { payment?: { entity?: { id: string; order_id: string; error_description?: string } } };
  };
  const entity = event.payload?.payment?.entity;
  if (!entity?.order_id) return { handled: false };

  if (event.event === "payment.captured") {
    const r = await confirmPayment({ providerOrderId: entity.order_id, providerPaymentId: entity.id, source: "webhook", raw: event });
    return { handled: true, outcome: r.outcome };
  }
  if (event.event === "payment.failed") {
    await prisma.payment.updateMany({
      where: { providerOrderId: entity.order_id, status: "CREATED" },
      data: { status: "FAILED", failureReason: entity.error_description ?? "Payment failed" },
    });
    return { handled: true };
  }
  return { handled: false };
}

/** Development only: what the Razorpay checkout would return after a successful payment. */
export async function fakeCheckout(bookingId: string, customerId: string, orderId: string) {
  if (paymentGateway().name !== "FAKE") throw notFound("Route");
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: orderId }, include: { booking: true } });
  if (!payment || payment.bookingId !== bookingId || payment.booking.customerId !== customerId) throw notFound("Payment order");
  return fakeCheckoutSuccess(orderId);
}
