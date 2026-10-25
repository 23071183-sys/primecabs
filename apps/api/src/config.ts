// Environment configuration, validated once at startup. Keys live in .env (never committed).
import { z } from "zod";

const secret = z.string().min(32, "must be at least 32 characters");

/** 32-byte key as 64 hex characters, or base64 (what Render's generateValue produces). */
export function decodeKey(value: string): Buffer | null {
  if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, "hex");
  const b = Buffer.from(value, "base64");
  return b.length === 32 ? b : null;
}

/** "admin.example.com" -> "https://admin.example.com"; full origins are kept as they are. */
export const parseOrigins = (list: string) =>
  list
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean)
    .map((s) => (/^https?:\/\//.test(s) ? s : `https://${s}`));

const schema = z
  .object({
    // staging = hosted test server: like production, but fake SMS and payments are allowed.
    NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    PORT: z.coerce.number().int().default(4000),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: secret,
    OTP_HASH_SECRET: secret,
    FILE_URL_SECRET: secret,
    DATA_ENCRYPTION_KEY: z.string().refine((v) => decodeKey(v) !== null, "must be 64 hex characters or a base64 32-byte key"),
    CORS_ORIGINS: z.string().default(""),
    SMS_PROVIDER: z.enum(["fake", "msg91"]).default("fake"),
    MSG91_AUTH_KEY: z.string().optional(),
    MSG91_TEMPLATE_ID: z.string().optional(),
    PAYMENT_PROVIDER: z.enum(["fake", "razorpay"]).default("fake"),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    STORAGE_PROVIDER: z.enum(["local", "database"]).default("local"),
    STORAGE_DIR: z.string().default("storage"),
    // Base URL for signed document links. On Render, its own public URL is used when this is unset.
    PUBLIC_BASE_URL: z.string().url().default(process.env.RENDER_EXTERNAL_URL ?? "http://localhost:4000"),
  })
  .superRefine((env, ctx) => {
    if (env.PAYMENT_PROVIDER === "razorpay") {
      for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"] as const) {
        if (!env[k]) ctx.addIssue({ code: "custom", path: [k], message: "required when PAYMENT_PROVIDER=razorpay" });
      }
    }
    if (env.SMS_PROVIDER === "msg91" && (!env.MSG91_AUTH_KEY || !env.MSG91_TEMPLATE_ID)) {
      ctx.addIssue({ code: "custom", path: ["MSG91_AUTH_KEY"], message: "MSG91 keys are required when SMS_PROVIDER=msg91" });
    }
    if (env.NODE_ENV === "production" && (env.SMS_PROVIDER === "fake" || env.PAYMENT_PROVIDER === "fake")) {
      ctx.addIssue({ code: "custom", path: ["NODE_ENV"], message: "fake SMS or payments cannot run in production" });
    }
  });

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

export function config(): Config {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
      throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const isDev = () => config().NODE_ENV !== "production";
