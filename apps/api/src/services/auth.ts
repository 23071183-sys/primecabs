// Phone OTP sign-in (customers and drivers) and email/password sign-in (admins).
import bcrypt from "bcryptjs";
import { sms } from "../adapters/sms.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { checkLoginOtp, generateNumericCode, hashOtp, resendWaitSeconds } from "../domain/otp.js";
import { badRequest, conflict, forbidden, tooMany, unauthorized } from "../errors.js";
import { audit } from "./audit.js";
import { getSettings } from "./settings.js";

export type AppKind = "customer" | "driver";
const roleFor = (app: AppKind) => (app === "customer" ? "CUSTOMER" : "DRIVER");

const maskPhone = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 5)}•••••${p.slice(-3)}`;

export async function requestOtp(phone: string, app: AppKind, ip?: string) {
  const s = (await getSettings()).loginOtp;
  const now = new Date();

  const user = await prisma.user.findUnique({ where: { phone } });
  if (user && user.role !== roleFor(app)) {
    throw conflict(
      "PHONE_USED_BY_OTHER_APP",
      app === "customer"
        ? "This number is registered as a driver. Use a different number to book rides."
        : "This number is registered as a customer. Use a different number to drive.",
    );
  }
  if (user?.status === "BLOCKED") throw forbidden("This account is blocked. Contact support.");

  const last = await prisma.loginOtp.findFirst({ where: { phone }, orderBy: { createdAt: "desc" } });
  const wait = resendWaitSeconds(last?.createdAt ?? null, now, s.resendSeconds);
  if (wait > 0) throw tooMany("OTP_RESEND_WAIT", `Wait ${wait} seconds before asking for a new code`, { retryAfterSeconds: wait });

  const lastHour = await prisma.loginOtp.count({ where: { phone, createdAt: { gt: new Date(now.getTime() - 3_600_000) } } });
  if (lastHour >= s.maxPerHour) throw tooMany("OTP_LIMIT", "Too many codes requested. Try again in an hour.");

  const code = generateNumericCode(s.length);
  await prisma.loginOtp.create({
    data: {
      phone,
      codeHash: hashOtp(code, phone, config().OTP_HASH_SECRET),
      expiresAt: new Date(now.getTime() + s.ttlSeconds * 1000),
      ip: ip ?? null,
    },
  });
  await sms().sendOtp(phone, code);

  return {
    sentTo: maskPhone(phone),
    expiresInSeconds: s.ttlSeconds,
    resendInSeconds: s.resendSeconds,
    // Development convenience only: the fake SMS sender also returns the code.
    ...(config().SMS_PROVIDER === "fake" && config().NODE_ENV !== "production" ? { devCode: code } : {}),
  };
}

export async function verifyOtp(phone: string, code: string, app: AppKind) {
  const s = (await getSettings()).loginOtp;
  const now = new Date();
  const record = await prisma.loginOtp.findFirst({ where: { phone }, orderBy: { createdAt: "desc" } });
  if (!record) throw badRequest("OTP_NOT_REQUESTED", "Ask for a code first");

  const result = checkLoginOtp(record, hashOtp(code, phone, config().OTP_HASH_SECRET), now, s.maxAttempts);
  if (result === "WRONG_CODE") {
    const updated = await prisma.loginOtp.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    const left = Math.max(0, s.maxAttempts - updated.attempts);
    throw badRequest("OTP_WRONG", left > 0 ? `Wrong code. ${left} tries left.` : "Wrong code. Ask for a new one.", { attemptsLeft: left });
  }
  if (result === "EXPIRED") throw badRequest("OTP_EXPIRED", "This code has expired. Ask for a new one.");
  if (result === "TOO_MANY_ATTEMPTS") throw tooMany("OTP_LOCKED", "Too many wrong tries. Ask for a new code.");
  if (result === "ALREADY_USED") throw badRequest("OTP_USED", "This code was already used. Ask for a new one.");

  const consumed = await prisma.loginOtp.updateMany({ where: { id: record.id, consumedAt: null }, data: { consumedAt: now } });
  if (consumed.count === 0) throw badRequest("OTP_USED", "This code was already used. Ask for a new one.");

  const role = roleFor(app);
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing && existing.role !== role) throw conflict("PHONE_USED_BY_OTHER_APP", "This number is registered in the other app");
  if (existing?.status === "BLOCKED") throw forbidden("This account is blocked. Contact support.");

  const user = existing ?? (await prisma.user.create({ data: { phone, role } }));
  if (role === "DRIVER") {
    await prisma.driver.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
  }
  const profileComplete = !!(user.name && user.email && user.age && user.gender);
  return { user, isNewUser: !existing, profileComplete };
}

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function adminLogin(email: string, password: string, ip?: string) {
  const admin = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() }, include: { cityScopes: true } });
  const now = new Date();
  if (admin?.lockedUntil && admin.lockedUntil > now) {
    throw tooMany("ACCOUNT_LOCKED", "Too many failed sign-ins. Try again in 15 minutes.");
  }
  // Compare even when the account doesn't exist, so response time doesn't reveal valid emails.
  const ok = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !ok || !admin.active) {
    if (admin) {
      const failed = admin.failedLogins + 1;
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: { failedLogins: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null },
      });
      await audit({ actorType: "ADMIN", actorId: admin.id, action: "admin.login_failed", entity: "admin_user", entityId: admin.id, ip });
    }
    throw unauthorized("Email or password is incorrect");
  }
  await prisma.adminUser.update({ where: { id: admin.id }, data: { failedLogins: 0, lockedUntil: null } });
  await audit({ actorType: "ADMIN", actorId: admin.id, action: "admin.login", entity: "admin_user", entityId: admin.id, ip });
  return admin;
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
