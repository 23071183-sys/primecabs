import type { ActorType, Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db.js";

export interface AuditEntry {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

const json = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

export async function audit(e: AuditEntry, db: Tx | typeof prisma = prisma) {
  await db.auditLog.create({
    data: {
      actorType: e.actorType,
      actorId: e.actorId ?? null,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId ?? null,
      before: json(e.before),
      after: json(e.after),
      ip: e.ip ?? null,
    },
  });
}
