'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import {
  Package,
  Search,
  Plus,
  MapPin,
  ChevronRight,
  BoxIcon,
  AlertCircle,
  Printer,
} from 'lucide-react';
import BoxQRPrint from '@/components/BoxQRPrint';

interface BoxSummary {
  id: string;
  qr_code: string;
  label: string;
  location: string | null;
  status: 'aberta' | 'fechada' | 'vazia';
  total_produtos: number;
  total_itens: number;
}

function NewBoxModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ qr_code: '', label: '', location: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.qr_code.trim() || !form.label.trim()) { setError('Código QR e Nome são obrigatórios.'); return; }
    setLoading(true); setError('');
    const { error: err } = await supabase.from('boxes').insert({
      qr_code: form.qr_code.trim().toUpperCase(),
      label: form.label.trim(),
      location: form.location.trim() || null,
    });
    setLoading(false);
    if (err) { setError(err.message.includes('unique') ? 'Esse código QR já existe.' : err.message); }
    else { onSaved(); onClose(); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#1a1a2e] p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-white">Nova Caixa</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-400">Código QR *</label>
            <input className="w-full rounded-lg bg-white/10 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Ex: CAIXA-001" value={form.qr_code} onChange={(e) => setForm({ ...form, qr_code: e.target.value })} />
            <p className="mt-1 text-xs text-gray-500">Esse é o código que será impresso no adesivo QR.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">Nome da caixa *</label>
            <input className="w-full rounded-lg bg-white/10 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Ex: Caixa 01 - Limpeza" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">Localização</label>
            <input className="w-full rounded-lg bg-white/10 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Ex: Prateleira A3" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          {error && <p className="flex items-center gap-1 text-sm text-red-400"><AlertCircle size={14} /> {error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-white/20 py-2 text-sm text-gray-300 hover:bg-white/10">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50">{loading ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BoxSummary['status'] }) {
  const map = { aberta: 'bg-green-500/20 text-green-400', fechada: 'bg-yellow-500/20 text-yellow-400', vazia: 'bg-gray-500/20 text-gray-400' };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{status}</span>;
}

export default function BoxesPage() {
  const [boxes, setBoxes] = useState<BoxSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewBox, setShowNewBox] = useState(false);
  const [printBox, setPrintBox] = useState<BoxSummary | null>(null);

  async function fetchBoxes() {
    setLoading(true);
    const { data } = await supabase.from('boxes_summary').select('*').order('label');
    setBoxes((data as BoxSummary[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchBoxes(); }, []);

  const filtered = boxes.filter(
    (b) => b.label.toLowerCase().includes(search.toLowerCase()) ||
      b.qr_code.toLowerCase().includes(search.toLowerCase()) ||
      (b.location ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] p-4 text-white">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BoxIcon className="text-purple-400" size={24} />
          <h1 className="text-xl font-bold">Controle de Caixas</h1>
        </div>
        <button onClick={() => setShowNewBox(true)} className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold hover:bg-purple-700">
          <Plus size={16} />Nova caixa
        </button>
      </div>
      <div className="mb-4 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
        <Search size={16} className="text-gray-400" />
        <input className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none" placeholder="Buscar por nome, código ou localização..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? (
        <p className="mt-10 text-center text-gray-500">Carregando caixas...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-10 text-center text-gray-500">{search ? 'Nenhuma caixa encontrada.' : 'Nenhuma caixa cadastrada ainda.'}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((box) => (
            <div key={box.id} className="flex items-center justify-between rounded-xl bg-white/5 p-4 transition hover:bg-white/10">
              <Link href={`/box/${box.qr_code}`} className="flex flex-1 flex-col gap-1 pr-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{box.label}</span>
                  <StatusBadge status={box.status} />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                  <span className="font-mono text-purple-400">{box.qr_code}</span>
                  {box.location && <span className="flex items-center gap-1"><MapPin size={12} />{box.location}</span>}
                  <span className="flex items-center gap-1"><Package size={12} />{box.total_produtos} produto(s) · {box.total_itens} item(s)</span>
                </div>
              </Link>
              <div className="flex items-center gap-2">
                <button onClick={() => setPrintBox(box)} title="Imprimir QR Code" className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-purple-400"><Printer size={16} /></button>
                <ChevronRight size={18} className="text-gray-500" />
              </div>
            </div>
          ))}
        </div>
      )}
      {showNewBox && <NewBoxModal onClose={() => setShowNewBox(false)} onSaved={fetchBoxes} />}
      {printBox && <BoxQRPrint boxes={[{ qr_code: printBox.qr_code, label: printBox.label, location: printBox.location ?? undefined }]} onClose={() => setPrintBox(null)} />}
    </div>
  );
}
