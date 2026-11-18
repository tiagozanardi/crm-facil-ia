import { Router } from 'express';
import { ProductCategory } from '@prisma/client';
import { prisma } from '../db.js';
import { getDefaultStore } from '../helpers/tenant.js';

export const productsRouter = Router();

function mapPrismaCategory(cat: string): ProductCategory {
  const normalized = cat.toUpperCase().replace('-', '_');
  if (normalized in ProductCategory) {
    return normalized as ProductCategory;
  }
  return ProductCategory.BORDO;
}

function formatProduct(product: any) {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku || undefined,
    category: product.category.toLowerCase() as string,
    price: Number(product.price),
    pixPrice: product.pixPrice ? Number(product.pixPrice) : undefined,
    stock: product.stock,
    minStock: product.minStock,
    dimensions: product.dimensions || undefined,
    colors: product.colors || [],
    imageUrl: product.imageUrl,
    description: product.description || undefined,
    active: product.active,
  };
}

// GET /api/products - Lista todos os produtos da loja
productsRouter.get('/', async (req, res) => {
  try {
    const store = await getDefaultStore();
    const products = await prisma.product.findMany({
      where: {
        storeId: store.id,
        active: req.query.all === 'true' ? undefined : true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(products.map(formatProduct));
  } catch (error: any) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ error: error?.message || 'Falha ao buscar produtos' });
  }
});

// POST /api/products - Cadastra novo produto
productsRouter.post('/', async (req, res) => {
  try {
    const store = await getDefaultStore();
    const {
      name,
      sku,
      category,
      price,
      pixPrice,
      stock,
      minStock,
      dimensions,
      colors,
      imageUrl,
      description,
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Nome e preço são obrigatórios' });
    }

    const created = await prisma.product.create({
      data: {
        storeId: store.id,
        name,
        sku: sku || null,
        category: mapPrismaCategory(category || 'bordo'),
        price: Number(price),
        pixPrice: pixPrice ? Number(pixPrice) : null,
        stock: Number(stock) || 0,
        minStock: Number(minStock) || 3,
        dimensions: dimensions || null,
        colors: Array.isArray(colors) ? colors : [],
        imageUrl: imageUrl || '/imagens/produtos/mala-bordo-rose.jpg',
        description: description || null,
        active: true,
      },
    });

    res.status(201).json(formatProduct(created));
  } catch (error: any) {
    console.error('Erro ao criar produto:', error);
    res.status(500).json({ error: error?.message || 'Falha ao criar produto' });
  }
});

// PUT /api/products/:id - Atualiza produto existente
productsRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      sku,
      category,
      price,
      pixPrice,
      stock,
      minStock,
      dimensions,
      colors,
      imageUrl,
      description,
      active,
    } = req.body;

    const dataToUpdate: any = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (sku !== undefined) dataToUpdate.sku = sku;
    if (category !== undefined) dataToUpdate.category = mapPrismaCategory(category);
    if (price !== undefined) dataToUpdate.price = Number(price);
    if (pixPrice !== undefined) dataToUpdate.pixPrice = pixPrice ? Number(pixPrice) : null;
    if (stock !== undefined) dataToUpdate.stock = Number(stock);
    if (minStock !== undefined) dataToUpdate.minStock = Number(minStock);
    if (dimensions !== undefined) dataToUpdate.dimensions = dimensions;
    if (colors !== undefined) dataToUpdate.colors = colors;
    if (imageUrl !== undefined) dataToUpdate.imageUrl = imageUrl;
    if (description !== undefined) dataToUpdate.description = description;
    if (active !== undefined) dataToUpdate.active = Boolean(active);

    const updated = await prisma.product.update({
      where: { id },
      data: dataToUpdate,
    });

    res.json(formatProduct(updated));
  } catch (error: any) {
    console.error('Erro ao atualizar produto:', error);
    res.status(500).json({ error: error?.message || 'Falha ao atualizar produto' });
  }
});

// PATCH /api/products/:id/stock - Atualiza quantidade em estoque (+/- delta)
productsRouter.patch('/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    const { delta } = req.body;

    if (delta === undefined || typeof delta !== 'number') {
      return res.status(400).json({ error: 'Delta numérico é obrigatório' });
    }

    const current = await prisma.product.findUnique({
      where: { id },
      select: { stock: true },
    });

    if (!current) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const newStock = Math.max(0, current.stock + delta);

    const updated = await prisma.product.update({
      where: { id },
      data: { stock: newStock },
    });

    res.json(formatProduct(updated));
  } catch (error: any) {
    console.error('Erro ao alterar estoque:', error);
    res.status(500).json({ error: error?.message || 'Falha ao alterar estoque' });
  }
});

// DELETE /api/products/:id - Remove produto
productsRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.product.delete({
      where: { id },
    });
    res.json({ success: true, id });
  } catch (error: any) {
    console.error('Erro ao excluir produto:', error);
    res.status(500).json({ error: error?.message || 'Falha ao excluir produto' });
  }
});
