import React, { useState } from 'react';
import { useCRM } from '../context/CRMContext';
import { Product, ProductCategory } from '../types';
import { 
  Package, 
  Plus, 
  Search, 
  Filter, 
  Upload, 
  Image as ImageIcon, 
  Trash2, 
  Edit3, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  DollarSign, 
  Layers, 
  Ruler, 
  Sparkles,
  ShoppingBag
} from 'lucide-react';

export const ProductsView: React.FC = () => {
  const { products, addProduct, updateProduct, deleteProduct, updateProductStock, addNotification } = useCRM();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<ProductCategory>('bordo');
  const [formPrice, setFormPrice] = useState('');
  const [formPixPrice, setFormPixPrice] = useState('');
  const [formStock, setFormStock] = useState('10');
  const [formMinStock, setFormMinStock] = useState('3');
  const [formDimensions, setFormDimensions] = useState('55 x 35 x 25 cm (Padrão ANAC)');
  const [formColors, setFormColors] = useState('Terracota, Preto, Rosé Gold');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Categories config
  const categories: { id: string; label: string }[] = [
    { id: 'all', label: 'Todos os Produtos' },
    { id: 'bordo', label: 'Malas de Bordo (ANAC)' },
    { id: 'media_grande', label: 'Malas Médias & Grandes' },
    { id: 'frasqueira', label: 'Frasqueiras' },
    { id: 'mochila', label: 'Mochilas' },
    { id: 'acessorios', label: 'Acessórios & Organizadores' },
  ];

  // Filtering
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.colors.some(c => c.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  // Inventory stats
  const totalItemsCount = products.reduce((acc, p) => acc + p.stock, 0);
  const totalInventoryValue = products.reduce((acc, p) => acc + (p.price * p.stock), 0);
  const lowStockCount = products.filter(p => p.stock > 0 && p.stock <= (p.minStock || 3)).length;
  const outOfStockCount = products.filter(p => p.stock === 0).length;

  // Handle Photo Upload (Base64 file reader)
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setImagePreview(result);
        setFormImageUrl(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const openNewProductModal = () => {
    setEditingProductId(null);
    setFormName('');
    setFormCategory('bordo');
    setFormPrice('');
    setFormPixPrice('');
    setFormStock('10');
    setFormMinStock('3');
    setFormDimensions('55 x 35 x 25 cm (Padrão ANAC)');
    setFormColors('Terracota, Preto, Rosé Gold');
    setFormImageUrl('');
    setFormDescription('');
    setImagePreview(null);
    setShowModal(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProductId(p.id);
    setFormName(p.name);
    setFormCategory(p.category);
    setFormPrice(p.price.toString());
    setFormPixPrice(p.pixPrice ? p.pixPrice.toString() : '');
    setFormStock(p.stock.toString());
    setFormMinStock(p.minStock ? p.minStock.toString() : '3');
    setFormDimensions(p.dimensions || '');
    setFormColors(p.colors.join(', '));
    setFormImageUrl(p.imageUrl);
    setFormDescription(p.description || '');
    setImagePreview(p.imageUrl);
    setShowModal(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPrice) {
      addNotification('Preencha o nome e o preço do produto.');
      return;
    }

    const priceNum = parseFloat(formPrice.replace(',', '.'));
    const pixNum = formPixPrice ? parseFloat(formPixPrice.replace(',', '.')) : priceNum * 0.93; // 7% de desconto padrão Pix
    const colorsArray = formColors.split(',').map(c => c.trim()).filter(Boolean);

    const productPayload = {
      name: formName.trim(),
      category: formCategory,
      price: priceNum,
      pixPrice: pixNum,
      stock: parseInt(formStock) || 0,
      minStock: parseInt(formMinStock) || 3,
      dimensions: formDimensions.trim(),
      colors: colorsArray.length > 0 ? colorsArray : ['Padrão'],
      imageUrl: formImageUrl || 'https://images.unsplash.com/photo-1565026057447-bc90a3dceb87?auto=format&fit=crop&w=600&q=80',
      active: true,
      description: formDescription.trim(),
      sku: `PROD-${Date.now().toString().slice(-4)}`
    };

    if (editingProductId) {
      updateProduct(editingProductId, productPayload);
    } else {
      addProduct(productPayload);
    }

    setShowModal(false);
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-graphite-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-500" />
            Controle de Estoque & Catálogo de Produtos
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Cadastre seus produtos, fotos e valores. A IA usa esses dados para informar preços, medidas e estoque aos clientes automaticamente.
          </p>
        </div>

        <button 
          onClick={openNewProductModal}
          className="px-4 py-2 rounded-xl bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors flex items-center gap-2 shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          Cadastrar Novo Produto
        </button>
      </div>

      {/* Métricas Rápidas de Estoque */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-gray-500">Produtos no Catálogo</span>
            <div className="text-2xl font-bold text-graphite-900 mt-1">{products.length} itens</div>
            <span className="text-[11px] text-gray-400 font-medium">{totalItemsCount} unidades físicas</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-gray-500">Valor em Estoque</span>
            <div className="text-2xl font-bold text-graphite-900 mt-1">
              R$ {totalInventoryValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">Preço de venda</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-gray-500">Estoque Baixo</span>
            <div className="text-2xl font-bold text-amber-600 mt-1">{lowStockCount} itens</div>
            <span className="text-[11px] text-amber-600 font-medium">Menos de 3 un.</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-gray-500">Itens Esgotados</span>
            <div className="text-2xl font-bold text-gray-900 mt-1">{outOfStockCount}</div>
            <span className="text-[11px] text-gray-400 font-medium">A IA avisa reposição</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="Pesquisar produto por nome, cor ou código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-brand-500"
          />
        </div>

        {/* Categorias Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedCategory === cat.id
                  ? 'bg-brand-500 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Cards de Produtos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredProducts.map((prod) => {
          const isLowStock = prod.stock > 0 && prod.stock <= (prod.minStock || 3);
          const isOutOfStock = prod.stock === 0;

          return (
            <div
              key={prod.id}
              className="bg-white rounded-2xl border border-gray-200/90 shadow-xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between group"
            >
              <div>
                {/* Imagem do Produto com Badges */}
                <div className="relative h-48 bg-gray-100 overflow-hidden">
                  <img
                    src={prod.imageUrl}
                    alt={prod.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/logo-malas-slz.jpg';
                    }}
                  />

                  {/* Badge de Estoque */}
                  <div className="absolute top-2.5 left-2.5">
                    {isOutOfStock ? (
                      <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-rose-500 text-white shadow-xs">
                        Esgotado
                      </span>
                    ) : isLowStock ? (
                      <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-amber-500 text-white shadow-xs flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Apenas {prod.stock} un.
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-600 text-white shadow-xs">
                        {prod.stock} em estoque
                      </span>
                    )}
                  </div>

                  {/* Botões de Ação na Imagem */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(prod)}
                      className="p-1.5 rounded-lg bg-white/90 text-gray-700 hover:bg-white hover:text-brand-600 shadow-xs transition-colors backdrop-blur-xs"
                      title="Editar Produto"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteProduct(prod.id)}
                      className="p-1.5 rounded-lg bg-white/90 text-gray-700 hover:bg-white hover:text-rose-600 shadow-xs transition-colors backdrop-blur-xs"
                      title="Remover Produto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Conteúdo do Card */}
                <div className="p-4 space-y-2">
                  <h3 className="text-sm font-bold text-graphite-900 group-hover:text-brand-600 transition-colors">
                    {prod.name}
                  </h3>

                  {/* Preços */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-extrabold text-graphite-900">
                      R$ {prod.price.toFixed(2)}
                    </span>
                    {prod.pixPrice && (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        Pix: R$ {prod.pixPrice.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Medidas / Dimensões */}
                  {prod.dimensions && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 p-2 rounded-lg border border-gray-100">
                      <Ruler className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                      <span className="font-medium text-[11px] truncate">{prod.dimensions}</span>
                    </div>
                  )}

                  {/* Cores */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {prod.colors.map((cor, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                        {cor}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Rodapé do Card: Controle Rápido de Estoque (+ e -) */}
              <div className="px-4 py-3 bg-gray-50/70 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">Ajustar estoque:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateProductStock(prod.id, -1)}
                    disabled={prod.stock === 0}
                    className="w-7 h-7 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold text-sm flex items-center justify-center disabled:opacity-40 transition-colors shadow-2xs"
                  >
                    -
                  </button>
                  <span className="text-xs font-bold text-graphite-900 w-8 text-center">{prod.stock}</span>
                  <button
                    onClick={() => updateProductStock(prod.id, 1)}
                    className="w-7 h-7 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold text-sm flex items-center justify-center transition-colors shadow-2xs"
                  >
                    +
                  </button>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* MODAL DE CADASTRO / EDIÇÃO DE PRODUTO */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-brand-500" />
                <h3 className="text-sm font-bold text-gray-900">
                  {editingProductId ? 'Editar Produto' : 'Cadastrar Novo Produto'}
                </h3>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              
              {/* Upload de Foto com Prévia */}
              <div>
                <label className="text-xs font-bold text-gray-800 block mb-1">
                  Foto do Produto
                </label>
                <div className="flex items-center gap-4">
                  {imagePreview ? (
                    <div className="w-24 h-24 rounded-xl border border-gray-200 overflow-hidden relative group shrink-0">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => { setImagePreview(null); setFormImageUrl(''); }}
                        className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-bold transition-opacity"
                      >
                        Trocar
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 shrink-0 bg-gray-50">
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-[10px] mt-1">Sem foto</span>
                    </div>
                  )}

                  <div className="flex-1 space-y-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 border border-brand-200 text-brand-600 text-xs font-semibold hover:bg-brand-100 cursor-pointer transition-colors shadow-2xs">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Fazer upload de foto</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handlePhotoUpload} 
                        className="hidden" 
                      />
                    </label>
                    <p className="text-[10px] text-gray-400">
                      Ou cole o link direto da imagem abaixo:
                    </p>
                    <input
                      type="text"
                      placeholder="https://exemplo.com/foto-da-mala.jpg"
                      value={formImageUrl}
                      onChange={(e) => {
                        setFormImageUrl(e.target.value);
                        setImagePreview(e.target.value);
                      }}
                      className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Nome do Produto */}
              <div>
                <label className="text-xs font-semibold text-gray-700">Nome do Produto</label>
                <input
                  type="text"
                  placeholder="Ex: Mala de Bordo 10kg Polipropileno Terracota"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                  required
                />
              </div>

              {/* Categoria */}
              <div>
                <label className="text-xs font-semibold text-gray-700">Categoria</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as ProductCategory)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800"
                >
                  <option value="bordo">Mala de Bordo (ANAC 10kg)</option>
                  <option value="media_grande">Mala Média ou Grande</option>
                  <option value="frasqueira">Frasqueira</option>
                  <option value="mochila">Mochila</option>
                  <option value="acessorios">Acessórios / Organizadores</option>
                </select>
              </div>

              {/* Preços (Normal e Pix) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">Preço Normal (R$)</label>
                  <input
                    type="text"
                    placeholder="Ex: 449.00"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Preço com Desconto Pix (R$)</label>
                  <input
                    type="text"
                    placeholder="Ex: 417.00 (Opcional)"
                    value={formPixPrice}
                    onChange={(e) => setFormPixPrice(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* Estoque e Estoque Mínimo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">Quantidade em Estoque</label>
                  <input
                    type="number"
                    min="0"
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Aviso Estoque Mínimo</label>
                  <input
                    type="number"
                    min="1"
                    value={formMinStock}
                    onChange={(e) => setFormMinStock(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* Dimensões / Medidas */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-700">Medidas / Dimensões</label>
                  <button
                    type="button"
                    onClick={() => setFormDimensions('55 x 35 x 25 cm (Padrão ANAC 10kg)')}
                    className="text-[10px] text-brand-600 font-semibold hover:underline"
                  >
                    + Padrão ANAC
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Ex: 55 x 35 x 25 cm (Padrão ANAC)"
                  value={formDimensions}
                  onChange={(e) => setFormDimensions(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                />
              </div>

              {/* Cores */}
              <div>
                <label className="text-xs font-semibold text-gray-700">Cores Disponíveis (separadas por vírgula)</label>
                <input
                  type="text"
                  placeholder="Ex: Terracota, Preto Fosco, Rosé Gold"
                  value={formColors}
                  onChange={(e) => setFormColors(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                />
              </div>

              {/* Botões do Modal */}
              <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-brand-500 text-white text-xs font-bold hover:bg-brand-600 transition-colors shadow-xs"
                >
                  {editingProductId ? 'Atualizar Produto' : 'Salvar Produto'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
