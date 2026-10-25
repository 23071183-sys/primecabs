// JWT sign-in for the three apps and role checks for admin staff.
import jwt from "@fastify/jwt";
import type { AdminRole } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { forbidden, unauthorized } from "../errors.js";

export type TokenPayload =
  | { sub: string; kind: "customer" | "driver" }
  | { sub: string; kind: "admin"; role: AdminRole };

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}

/** What each admin role may do. SUPER_ADMIN may do everything. */
export const permissions = {
  "drivers.read": ["LOCATION_ADMIN", "SUPPORT"],
  "drivers.review": ["LOCATION_ADMIN"],
  "rides.read": ["LOCATION_ADMIN", "SUPPORT"],
  "rides.review": ["LOCATION_ADMIN"],
  "rides.cancel": ["LOCATION_ADMIN"],
  "bookings.read": ["LOCATION_ADMIN", "SUPPORT", "ACCOUNTANT"],
  "bookings.cancel": ["LOCATION_ADMIN", "SUPPORT"],
  "bookings.fullRefund": ["LOCATION_ADMIN"],
  "payments.read": ["ACCOUNTANT"],
  "refunds.retry": ["ACCOUNTANT"],
  "config.read": ["LOCATION_ADMIN", "SUPPORT", "ACCOUNTANT"],
  "config.write": [],
  "settings.write": [],
  "admins.manage": [],
  "audit.read": [],
} as const satisfies Record<string, readonly AdminRole[]>;

export type Permission = keyof typeof permissions;

export const can = (role: AdminRole, p: Permission) =>
  role === "SUPER_ADMIN" || (permissions[p] as readonly AdminRole[]).includes(role);

/** Every permission a role has; sent to the admin portal so it can show only what the role may use. */
export const permissionsFor = (role: AdminRole): Permission[] =>
  (Object.keys(permissions) as Permission[]).filter((p) => can(role, p));

export interface AdminContext {
  id: string;
  role: AdminRole;
  /** null = all cities; otherwise the location admin's cities. */
  cityIds: string[] | null;
}

async function verify(req: FastifyRequest) {
  try {
    await req.jwtVerify();
  } catch {
    throw unauthorized("Your session has expired. Sign in again.");
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  await app.register(jwt, { secret: config().JWT_SECRET });
});

export async function requireUser(req: FastifyRequest, kind: "customer" | "driver"): Promise<string> {
  await verify(req);
  if (req.user.kind !== kind) throw forbidden();
  const u = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { status: true } });
  if (!u) throw unauthorized();
  if (u.status === "BLOCKED") throw forbidden("This account is blocked. Contact support.");
  return req.user.sub;
}

export async function requireAdmin(req: FastifyRequest, permission?: Permission): Promise<AdminContext> {
  await verify(req);
  if (req.user.kind !== "admin") throw forbidden();
  // Re-read the role on every request so disabling an admin or changing their role applies at once.
  const admin = await prisma.adminUser.findUnique({ where: { id: req.user.sub }, include: { cityScopes: true } });
  if (!admin || !admin.active) throw unauthorized("Your admin account is disabled");
  if (permission && !can(admin.role, permission)) throw forbidden("Your role can't do this");
  return {
    id: admin.id,
    role: admin.role,
    cityIds: admin.role === "LOCATION_ADMIN" ? admin.cityScopes.map((s) => s.cityId) : null,
  };
}
