// Environment configuration, validated once at startup. Keys live in .env (never committed).
import { z } from "zod";

const secret = z.string().min(32, "must be at least 32 characters");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().default(4000),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: secret,
    OTP_HASH_SECRET: secret,
    FILE_URL_SECRET: secret,
    DATA_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "must be 64 hex characters"),
    CORS_ORIGINS: z.string().default(""),
    SMS_PROVIDER: z.enum(["fake", "msg91"]).default("fake"),
    MSG91_AUTH_KEY: z.string().optional(),
    MSG91_TEMPLATE_ID: z.string().optional(),
    PAYMENT_PROVIDER: z.enum(["fake", "razorpay"]).default("fake"),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    STORAGE_PROVIDER: z.enum(["local"]).default("local"),
    STORAGE_DIR: z.string().default("storage"),
    PUBLIC_BASE_URL: z.string().url().default("http://localhost:4000"),
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
