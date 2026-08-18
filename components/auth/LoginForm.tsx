'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export function LoginForm() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = login.trim();
    if (!trimmed || !password) return;
    setLoading(true);
    setError('');
    try {
      let email = trimmed;
      if (!trimmed.includes('@')) {
        const res = await fetch(`/api/usuarios/resolve-login?username=${encodeURIComponent(trimmed)}`);
        if (!res.ok) {
          setError('Nome de usuário ou senha incorretos.');
          return;
        }
        const data = await res.json();
        email = data.email;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError('E-mail/usuário ou senha incorretos.');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Erro ao entrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const field = 'w-full bg-surface border border-on-surface/[0.12] rounded-[13px] px-4 py-3.5 text-[14px] font-semibold text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors placeholder:text-on-surface/30 placeholder:font-medium';

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[380px] flex flex-col gap-4">
      <div>
        <label className="text-[10px] font-black text-on-surface/40 uppercase tracking-widest mb-1.5 block">E-mail ou usuário</label>
        <input
          type="text"
          value={login}
          onChange={e => setLogin(e.target.value)}
          placeholder="nome@empresa.com ou usuário"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          className={field}
        />
      </div>

      <div>
        <label className="text-[10px] font-black text-on-surface/40 uppercase tracking-widest mb-1.5 block">Senha</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Sua senha"
            className={cn(field, 'pr-12')}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface/30 hover:text-on-surface/60 transition-colors"
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-[12.5px] font-semibold text-red-600 dark:text-red-400 bg-red-500/10 rounded-[11px] px-3.5 py-2.5">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !login.trim() || !password}
        className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-4 rounded-[13px] font-black text-sm hover:bg-on-surface transition-[colors,transform] shadow-xl shadow-primary/20 uppercase tracking-widest active:scale-95 disabled:opacity-60 mt-2"
      >
        {loading ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
        ) : (
          <><LogIn size={18} /> Entrar</>
        )}
      </button>
    </form>
  );
}
