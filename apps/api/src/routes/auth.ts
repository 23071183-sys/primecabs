import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { indianMobile } from "../domain/validators.js";
import { parse } from "../errors.js";
import { permissionsFor, requireAdmin, requireUser } from "../plugins/auth.js";
import { adminLogin, requestOtp, verifyOtp } from "../services/auth.js";

const APP_TOKEN_DAYS = "30d";
const ADMIN_TOKEN_HOURS = "12h";
const app = z.enum(["customer", "driver"]);

export async function authRoutes(r: FastifyInstance) {
  r.post("/otp/request", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const body = parse(z.object({ phone: indianMobile, app }), req.body);
    return requestOtp(body.phone, body.app, req.ip);
  });

  r.post("/otp/verify", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
    const body = parse(z.object({ phone: indianMobile, otp: z.string().regex(/^\d{4,8}$/, "Enter the code from the SMS"), app }), req.body);
    const { user, isNewUser, profileComplete } = await verifyOtp(body.phone, body.otp, body.app);
    const token = r.jwt.sign({ sub: user.id, kind: body.app }, { expiresIn: APP_TOKEN_DAYS });
    return { token, isNewUser, profileComplete, user: { id: user.id, phone: user.phone, name: user.name, email: user.email, age: user.age, gender: user.gender } };
  });

  /** Swap a still-valid token for a fresh one (apps call this on launch). */
  r.post("/refresh", async (req) => {
    await req.jwtVerify().catch(() => null);
    const kind = req.user?.kind;
    if (kind === "admin") {
      const admin = await requireAdmin(req);
      return { token: r.jwt.sign({ sub: admin.id, kind: "admin", role: admin.role }, { expiresIn: ADMIN_TOKEN_HOURS }) };
    }
    const id = await requireUser(req, kind === "driver" ? "driver" : "customer");
    return { token: r.jwt.sign({ sub: id, kind: kind === "driver" ? "driver" : "customer" }, { expiresIn: APP_TOKEN_DAYS }) };
  });

  r.post("/admin/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const body = parse(z.object({ email: z.string().email(), password: z.string().min(1).max(200) }), req.body);
    const admin = await adminLogin(body.email, body.password, req.ip);
    const token = r.jwt.sign({ sub: admin.id, kind: "admin", role: admin.role }, { expiresIn: ADMIN_TOKEN_HOURS });
    return {
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role, cityIds: admin.cityScopes.map((s) => s.cityId), permissions: permissionsFor(admin.role) },
    };
  });
}
