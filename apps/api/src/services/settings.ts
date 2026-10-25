import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db.js";
import { defaultSettings, settingKeys, settingSchemas, type SettingKey, type Settings } from "../domain/settings.js";
import { notFound, parse } from "../errors.js";
import { audit } from "./audit.js";

/** Current settings: stored values over defaults. Read fresh each time so admin edits apply at once. */
export async function getSettings(db: Tx | typeof prisma = prisma): Promise<Settings> {
  const rows = await db.setting.findMany();
  const out = structuredClone(defaultSettings) as Record<SettingKey, unknown>;
  for (const row of rows) {
    if (!(row.key in settingSchemas)) continue;
    const key = row.key as SettingKey;
    const r = settingSchemas[key].safeParse(row.value);
    if (r.success) out[key] = r.data;
  }
  return out as Settings;
}

export async function updateSetting(key: string, value: unknown, adminId: string, ip?: string) {
  if (!settingKeys.includes(key as SettingKey)) throw notFound("Setting");
  const k = key as SettingKey;
  const valid = parse(settingSchemas[k], value) as Prisma.InputJsonValue;
  const before = (await getSettings())[k];
  await prisma.setting.upsert({
    where: { key: k },
    create: { key: k, value: valid, updatedById: adminId },
    update: { value: valid, updatedById: adminId },
  });
  await audit({ actorType: "ADMIN", actorId: adminId, action: "setting.update", entity: "setting", entityId: k, before, after: valid, ip });
  return valid;
}
