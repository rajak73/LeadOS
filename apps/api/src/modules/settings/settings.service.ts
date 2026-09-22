import type { AppSettings as AppSettingsDto, UpdateSettingsInput } from '@leados/shared';
import type { AppSettings } from '@prisma/client';
import { env } from '../../config/env.js';
import { fieldError } from '../../lib/errors.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import { isValidTimeZone } from '../../lib/time.js';

export const SETTINGS_ID = 1;

export async function getSettings(db: Tx = prisma): Promise<AppSettings> {
  return db.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  });
}

export const aiProvider = (): AppSettingsDto['aiProvider'] =>
  env.OPENAI_API_KEY ? 'openai' : 'rules';

export function toSettings(s: AppSettings): AppSettingsDto {
  return {
    companyName: s.companyName,
    defaultCurrency: s.defaultCurrency,
    timezone: s.timezone,
    aiScoringAuto: s.aiScoringAuto,
    aiProvider: aiProvider(),
  };
}

export async function updateSettings(input: UpdateSettingsInput): Promise<AppSettingsDto> {
  if (input.timezone && !isValidTimeZone(input.timezone)) {
    throw fieldError('timezone', 'Choose a valid time zone, e.g. Asia/Kolkata');
  }
  await getSettings();
  const updated = await prisma.appSettings.update({ where: { id: SETTINGS_ID }, data: input });
  return toSettings(updated);
}
