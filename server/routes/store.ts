import { Router } from 'express';
import { prisma } from '../db.js';
import { getDefaultStore } from '../helpers/tenant.js';

export const storeRouter = Router();

// GET /api/store - Retorna configurações da loja
storeRouter.get('/', async (_req, res) => {
  try {
    const store = await getDefaultStore();
    res.json({
      id: store.id,
      name: store.name,
      slug: store.slug,
      segment: store.segment || '',
      whatsappNumber: store.whatsappNumber,
      address: store.address || '',
      logoUrl: store.logoUrl || '/logo-malas-slz.jpg',
      interventionPauseHours: store.interventionPauseHours,
      vipGroupLink: store.vipGroupLink || '',
      theme: {
        primaryColor: store.primaryColor,
        accentColor: store.accentColor,
        surfaceColor: store.surfaceColor,
      },
    });
  } catch (error: any) {
    console.error('Erro ao buscar dados da loja:', error);
    res.status(500).json({ error: error?.message || 'Falha ao buscar dados da loja' });
  }
});

// PUT /api/store - Atualiza dados da loja e identidade visual
storeRouter.put('/', async (req, res) => {
  try {
    const store = await getDefaultStore();
    const {
      name,
      segment,
      whatsappNumber,
      address,
      logoUrl,
      interventionPauseHours,
      vipGroupLink,
      theme,
    } = req.body;

    const dataToUpdate: any = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (segment !== undefined) dataToUpdate.segment = segment;
    if (whatsappNumber !== undefined) dataToUpdate.whatsappNumber = whatsappNumber;
    if (address !== undefined) dataToUpdate.address = address;
    if (logoUrl !== undefined) dataToUpdate.logoUrl = logoUrl;
    if (interventionPauseHours !== undefined) dataToUpdate.interventionPauseHours = Number(interventionPauseHours);
    if (vipGroupLink !== undefined) dataToUpdate.vipGroupLink = vipGroupLink;
    if (theme?.primaryColor) dataToUpdate.primaryColor = theme.primaryColor;
    if (theme?.accentColor) dataToUpdate.accentColor = theme.accentColor;
    if (theme?.surfaceColor) dataToUpdate.surfaceColor = theme.surfaceColor;

    const updated = await prisma.store.update({
      where: { id: store.id },
      data: dataToUpdate,
    });

    res.json({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      segment: updated.segment || '',
      whatsappNumber: updated.whatsappNumber,
      address: updated.address || '',
      logoUrl: updated.logoUrl || '/logo-malas-slz.jpg',
      interventionPauseHours: updated.interventionPauseHours,
      vipGroupLink: updated.vipGroupLink || '',
      theme: {
        primaryColor: updated.primaryColor,
        accentColor: updated.accentColor,
        surfaceColor: updated.surfaceColor,
      },
    });
  } catch (error: any) {
    console.error('Erro ao atualizar configurações da loja:', error);
    res.status(500).json({ error: error?.message || 'Falha ao atualizar configurações da loja' });
  }
});
