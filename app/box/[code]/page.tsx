'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft,
  Package,
  MapPin,
  Plus,
  Minus,
  Clock,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';

// -------------------------------------------------------
// Tipos
// -------------------------------------------------------
interface Box {
  id: string;
  qr_code: string;
  label: string;
  location: string | null;
  status: 'aberta' | 'fechada' | 'vazia';
  notes: string | null;
}

interface BoxItem {
  id: string;
  product_id: string;
  quantity: number;
  product_name: string;
  product_code: string;
}

interface Movement {
  id: string;
  type: 'entrada' | 'saida';
  quantity: number;
  user_name: string;
  destination: string | null;
  notes: string | null;
  created_at: string;
  product_name: string;
}

interface Product {
  id: string;
  name: string;
  code: string;
}

// -------------------------------------------------------
// Modal de movimentação (entrada ou saída)
// -------------------------------------------------------
function MovementModal({
  boxId,
  type,
  onClose,
  onSaved,
}: {
  boxId: string;
  type: 'entrada' | 'saida';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({
    product_id: '',
    quantity: '',
    user_name: '',
    destination: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase
      .from('products')
      .select('id, name, code')
      .order('name')
      .then(({ data }) => setProducts((data as Product[]) ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.product_id || !form.quantity || !form.user_name) {
      setError('Produto, quantidade e responsável são obrigatórios.');
      return;
    }
    const qty = parseFloat(form.quantity);
    if (isNaN(qty) || qty <= 0) {
      setError('Quantidade inválida.');
      return;
    }
    setLoading(true);
    setError('');

    const { error: err } = await supabase.rpc('register_box_movement', {
      p_box_id: boxId,
      p_product_id: form.product_id,
      p_type: type,
      p_quantity: qty,
      p_user_name: form.user_name.trim(),
      p_destination: form.destination.trim() || null,
      p_notes: form.notes.trim() || null,
    });

    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess(true);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 1000);
    }
  }

  const isEntrada = type === 'entrada';
  const color = isEntrada ? 'green' : 'red';
  const colorClass = isEntrada
    ? 'bg-green-600 hover:bg-green-700'
    : 'bg-red-600 hover:bg-red-700';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#1a1a2e] p-6 shadow-xl">
        <h2 className={`mb-4 text-lg font-bold ${isEntrada ? 'text-green-400' : 'text-red-400'}`}>
          {isEntrada ? '📦 Registrar Entrada' : '📤 Registrar Saída'}
        </h2>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle className="text-green-400" size={48} />
            <p className="text-white">Movimentação registrada!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Produto */}
            <div>
              <label className="mb-1 block text-sm text-gray-400">Produto *</label>
              <select
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={form.product_id}
                onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              >
                <option value="" className="bg-[#1a1a2e]">
                  Selecione um produto...
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#1a1a2e]">
                    {p.name} {p.code ? `(${p.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Quantidade */}
            <div>
              <label className="mb-1 block text-sm text-gray-400">Quantidade *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Ex: 10"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>

            {/* Responsável */}
            <div>
              <label className="mb-1 block text-sm text-gray-400">Responsável *</label>
              <input
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Seu nome"
                value={form.user_name}
                onChange={(e) => setForm({ ...form, user_name: e.target.value })}
              />
            </div>

            {/* Destino (somente para saída) */}
            {!isEntrada && (
              <div>
                <label className="mb-1 block text-sm text-gray-400">Destino / Setor</label>
                <input
                  className="w-full rounded-lg bg-white/10 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Ex: Gôndola A, Frente de loja..."
                  value={form.destination}
                  onChange={(e) => setForm({ ...form, destination: e.target.value })}
                />
              </div>
            )}

            {/* Observações */}
            <div>
              <label className="mb-1 block text-sm text-gray-400">Observações</label>
              <input
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Opcional"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {error && (
              <p className="flex items-center gap-1 text-sm text-red-400">
                <AlertCircle size={14} /> {error}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-white/20 py-2 text-sm text-gray-300 hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50 ${colorClass}`}
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                {loading ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Badge de status
// -------------------------------------------------------
function StatusBadge({ status }: { status: Box['status'] }) {
  const map = {
    aberta: 'bg-green-500/20 text-green-400',
    fechada: 'bg-yellow-500/20 text-yellow-400',
    vazia: 'bg-gray-500/20 text-gray-400',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {status}
    </span>
  );
}

// -------------------------------------------------------
// Página principal: /box/[code]
// -------------------------------------------------------
export default function BoxDetailPage() {
  const params = useParams();
  const router = useRouter();
  const code = params?.code as string;

  const [box, setBox] = useState<Box | null>(null);
  const [items, setItems] = useState<BoxItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [modal, setModal] = useState<'entrada' | 'saida' | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const fetchData = useCallback(async () => {
    if (!code) return;

    // Busca a caixa pelo QR Code
    const { data: boxData } = await supabase
      .from('boxes')
      .select('*')
      .eq('qr_code', code.toUpperCase())
      .single();

    if (!boxData) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setBox(boxData as Box);

    // Busca os itens da caixa com nome do produto
    const { data: itemsData } = await supabase
      .from('box_items')
      .select('id, product_id, quantity, products(name, code)')
      .eq('box_id', boxData.id)
      .gt('quantity', 0)
      .order('quantity', { ascending: false });

    setItems(
      ((itemsData as any[]) ?? []).map((i) => ({
        id: i.id,
        product_id: i.product_id,
        quantity: i.quantity,
        product_name: i.products?.name ?? 'Produto desconhecido',
        product_code: i.products?.code ?? '',
      })),
    );

    // Busca histórico de movimentações
    const { data: movData } = await supabase
      .from('box_movements')
      .select('id, type, quantity, user_name, destination, notes, created_at, products(name)')
      .eq('box_id', boxData.id)
      .order('created_at', { ascending: false })
      .limit(50);

    setMovements(
      ((movData as any[]) ?? []).map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity,
        user_name: m.user_name,
        destination: m.destination,
        notes: m.notes,
        created_at: m.created_at,
        product_name: m.products?.name ?? 'Produto desconhecido',
      })),
    );

    setLoading(false);
  }, [code]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // ---- Render ----

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f1a]">
        <Loader2 className="animate-spin text-purple-400" size={36} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0f0f1a] p-6 text-white">
        <AlertCircle className="text-red-400" size={48} />
        <h1 className="text-xl font-bold">Caixa não encontrada</h1>
        <p className="text-center text-gray-400">
          Nenhuma caixa com o código <span className="font-mono text-purple-400">{code}</span> foi encontrada.
        </p>
        <button
          onClick={() => router.push('/boxes')}
          className="mt-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold hover:bg-purple-700"
        >
          Ver todas as caixas
        </button>
      </div>
    );
  }

  if (!box) return null;

  return (
    <div className="min-h-screen bg-[#0f0f1a] p-4 text-white">
      {/* Cabeçalho */}
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => router.push('/boxes')} className="rounded-lg p-1 hover:bg-white/10">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-bold">{box.label}</h1>
          <span className="font-mono text-xs text-purple-400">{box.qr_code}</span>
        </div>
        <div className="ml-auto">
          <StatusBadge status={box.status} />
        </div>
      </div>

      {/* Info da caixa */}
      {box.location && (
        <div className="mb-4 flex items-center gap-1 text-sm text-gray-400">
          <MapPin size={14} />
          {box.location}
        </div>
      )}

      {/* Botões de ação */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <button
          onClick={() => setModal('entrada')}
          className="flex items-center justify-center gap-2 rounded-xl bg-green-600/80 py-3 text-sm font-semibold hover:bg-green-600"
        >
          <Plus size={18} />
          Registrar Entrada
        </button>
        <button
          onClick={() => setModal('saida')}
          disabled={items.length === 0}
          className="flex items-center justify-center gap-2 rounded-xl bg-red-600/80 py-3 text-sm font-semibold hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus size={18} />
          Registrar Saída
        </button>
      </div>

      {/* Conteúdo da caixa */}
      <div className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-400">
          <Package size={16} />
          CONTEÚDO DA CAIXA ({items.length} produto{items.length !== 1 ? 's' : ''})
        </h2>

        {items.length === 0 ? (
          <p className="rounded-xl bg-white/5 py-6 text-center text-sm text-gray-500">
            Caixa vazia
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{item.product_name}</p>
                  {item.product_code && (
                    <p className="text-xs text-gray-500">{item.product_code}</p>
                  )}
                </div>
                <span className="rounded-lg bg-purple-600/30 px-3 py-1 text-sm font-bold text-purple-300">
                  {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Histórico de movimentações */}
      <div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="mb-3 flex w-full items-center gap-2 text-sm font-semibold text-gray-400"
        >
          <Clock size={16} />
          HISTÓRICO ({movements.length} movimentação{movements.length !== 1 ? 'ões' : ''})
          {showHistory ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
        </button>

        {showHistory && (
          <div className="space-y-2">
            {movements.length === 0 ? (
              <p className="rounded-xl bg-white/5 py-6 text-center text-sm text-gray-500">
                Nenhuma movimentação registrada
              </p>
            ) : (
              movements.map((m) => (
                <div key={m.id} className="rounded-xl bg-white/5 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          m.type === 'entrada'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {m.type}
                      </span>
                      <span className="text-sm font-medium">{m.product_name}</span>
                    </div>
                    <span className="text-sm font-bold">
                      {m.type === 'entrada' ? '+' : '-'}
                      {m.quantity % 1 === 0 ? m.quantity : m.quantity.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
                    <span>👤 {m.user_name}</span>
                    {m.destination && <span>📍 {m.destination}</span>}
                    {m.notes && <span>📝 {m.notes}</span>}
                    <span className="ml-auto">{formatDate(m.created_at)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modal de movimentação */}
      {modal && (
        <MovementModal
          boxId={box.id}
          type={modal}
          onClose={() => setModal(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
