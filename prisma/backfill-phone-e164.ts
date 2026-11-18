/**
 * Backfill de Lead.phoneE164 a partir de Lead.phone (dados antigos do seed).
 *
 * - Normaliza para E.164 brasileiro: só dígitos, com DDI 55.
 * - Idempotente: só mexe em leads com phoneE164 NULL.
 * - Não falha o processo inteiro por causa de um lead inválido.
 *
 * Uso: npm run backfill:phones
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function toE164BR(phone: string | null | undefined): string | null {
  if (!phone) return null;

  let digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  digits = digits.replace(/^0+/, '');

  // Fixo (10) ou celular (11) sem DDI.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;

  // Já com DDI (12 ou 13).
  if (digits.length === 12 || digits.length === 13) {
    return digits.startsWith('55') ? digits : `55${digits}`;
  }

  return null;
}

async function main() {
  const leads = await prisma.lead.findMany({
    where: { phoneE164: null },
    select: { id: true, name: true, phone: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const lead of leads) {
    const e164 = toE164BR(lead.phone);
    if (!e164) {
      skipped += 1;
      console.warn(`ignorado (telefone inválido): ${lead.name} — "${lead.phone}"`);
      continue;
    }

    try {
      await prisma.lead.update({ where: { id: lead.id }, data: { phoneE164: e164 } });
      updated += 1;
    } catch (err: any) {
      skipped += 1;
      console.warn(`falha em ${lead.name}: ${err?.message ?? err}`);
    }
  }

  const filled = await prisma.lead.count({ where: { phoneE164: { not: null } } });
  const total = await prisma.lead.count();

  console.log(`backfill: ${updated} atualizados, ${skipped} ignorados`);
  console.log(`leads com phoneE164: ${filled}/${total}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
