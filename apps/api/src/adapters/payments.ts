// Payment gateway adapter. `fake` behaves like Razorpay test mode without any account:
// orders and payments get fake ids and signatures are checked the same way.
import { createHmac, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { safeEqual } from "../domain/otp.js";

export interface CreatedOrder {
  orderId: string;
  amount: number;
  currency: "INR";
}

export interface RefundOutcome {
  ok: boolean;
  refundId?: string;
  error?: string;
}

export interface PaymentGateway {
  name: "RAZORPAY" | "FAKE";
  publicKey: string | null;
  createOrder(amountPaise: number, receipt: string): Promise<CreatedOrder>;
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  refund(paymentId: string, amountPaise: number, note: string): Promise<RefundOutcome>;
}

const hmac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");
const randomId = (prefix: string) => `${prefix}_${randomBytes(7).toString("hex")}`;

function fakeGateway(): PaymentGateway {
  const secret = `fake:${config().JWT_SECRET}`;
  return {
    name: "FAKE",
    publicKey: null,
    async createOrder(amount) {
      return { orderId: randomId("order_fake"), amount, currency: "INR" };
    },
    verifyPaymentSignature(orderId, paymentId, signature) {
      return safeEqual(hmac(secret, `${orderId}|${paymentId}`), signature);
    },
    verifyWebhookSignature(rawBody, signature) {
      return safeEqual(hmac(secret, rawBody), signature);
    },
    async refund() {
      return { ok: true, refundId: randomId("rfnd_fake") };
    },
  };
}

/** What the Razorpay checkout would return to the app after a successful fake payment. */
export function fakeCheckoutSuccess(orderId: string) {
  const paymentId = randomId("pay_fake");
  const signature = hmac(`fake:${config().JWT_SECRET}`, `${orderId}|${paymentId}`);
  return { razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature };
}

export function fakeWebhookSignature(rawBody: string) {
  return hmac(`fake:${config().JWT_SECRET}`, rawBody);
}

function razorpayGateway(): PaymentGateway {
  const c = config();
  const auth = `Basic ${Buffer.from(`${c.RAZORPAY_KEY_ID}:${c.RAZORPAY_KEY_SECRET}`).toString("base64")}`;
  const call = async (path: string, body: unknown) => {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, any>;
    return { ok: res.ok, json };
  };
  return {
    name: "RAZORPAY",
    publicKey: c.RAZORPAY_KEY_ID!,
    async createOrder(amount, receipt) {
      const { ok, json } = await call("/orders", { amount, currency: "INR", receipt });
      if (!ok) throw new Error(`Razorpay order failed: ${json.error?.description ?? "unknown error"}`);
      return { orderId: json.id, amount: json.amount, currency: "INR" };
    },
    verifyPaymentSignature(orderId, paymentId, signature) {
      return safeEqual(hmac(c.RAZORPAY_KEY_SECRET!, `${orderId}|${paymentId}`), signature);
    },
    verifyWebhookSignature(rawBody, signature) {
      return safeEqual(hmac(c.RAZORPAY_WEBHOOK_SECRET!, rawBody), signature);
    },
    async refund(paymentId, amount, note) {
      const { ok, json } = await call(`/payments/${paymentId}/refund`, { amount, notes: { reason: note } });
      return ok ? { ok: true, refundId: json.id } : { ok: false, error: json.error?.description ?? "Refund failed" };
    },
  };
}

let override: PaymentGateway | undefined;
/** Tests can swap the gateway, e.g. to simulate a failing refund. */
export const setPaymentGatewayForTests = (g: PaymentGateway | undefined) => (override = g);

export const paymentGateway = (): PaymentGateway =>
  override ?? (config().PAYMENT_PROVIDER === "razorpay" ? razorpayGateway() : fakeGateway());
