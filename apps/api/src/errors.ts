// One error shape for every API response: { error: { code, message, details? } }.
import type { z } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new AppError(400, code, message, details);
export const unauthorized = (message = "Sign in to continue") => new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You don't have access to this") => new AppError(403, "FORBIDDEN", message);
export const notFound = (what = "Item") => new AppError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
export const tooMany = (code: string, message: string, details?: unknown) => new AppError(429, code, message, details);

/** Validate input with a zod schema or throw a 400 with field-level details. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields = r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    throw badRequest("VALIDATION_FAILED", fields[0]?.message ?? "Check the highlighted fields", { fields });
  }
  return r.data;
}
