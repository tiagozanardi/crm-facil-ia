import { prisma } from '../db';

export async function getDefaultStore() {
  const store = await prisma.store.findFirst({
    where: { slug: 'malas-slz' },
  });
  if (store) return store;
  
  const fallback = await prisma.store.findFirst();
  if (!fallback) {
    throw new Error('Nenhuma loja encontrada no banco de dados. Execute o seed.');
  }
  return fallback;
}
