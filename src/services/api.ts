import { Product, StoreSettings } from '../types';

const API_BASE = '/api';

export const apiService = {
  // Health check
  async checkHealth(): Promise<{ status: string; database?: string } | null> {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  // Produtos
  async getProducts(): Promise<Product[] | null> {
    try {
      const res = await fetch(`${API_BASE}/products`);
      if (!res.ok) return null;
      return await res.json();
    } catch (error) {
      console.warn('Backend offline ou inacessível. Usando fallback local:', error);
      return null;
    }
  },

  async createProduct(product: Omit<Product, 'id'>): Promise<Product | null> {
    try {
      const res = await fetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product | null> {
    try {
      const res = await fetch(`${API_BASE}/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async updateStock(id: string, delta: number): Promise<Product | null> {
    try {
      const res = await fetch(`${API_BASE}/products/${id}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async deleteProduct(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/products/${id}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // Loja & Configurações de Identidade
  async getStoreSettings(): Promise<StoreSettings | null> {
    try {
      const res = await fetch(`${API_BASE}/store`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async updateStoreSettings(settings: Partial<StoreSettings>): Promise<StoreSettings | null> {
    try {
      const res = await fetch(`${API_BASE}/store`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },
};
