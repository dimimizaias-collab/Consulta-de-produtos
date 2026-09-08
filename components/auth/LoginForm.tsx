'use client';

import { useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export function LoginForm() {
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
          setLoading(false);
          return;
        }
        const data = await res.json();
        email = data.email;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError('E-mail/usuário ou senha incorretos.');
        setLoading(false);
        return;
      }
      // Navegação hard (não router.push/refresh) — o middleware roda no servidor e precisa
      // do cookie de sessão já anexado à requisição.
      //
      // No Safari (iOS confirmado em produção) isso ainda falhava mesmo com a troca acima:
      // o signInWithPassword grava a sessão via document.cookie de forma síncrona/aguardada,
      // mas o WebKit tem um bug conhecido onde, se a navegação começa na mesma tarefa em que
      // os cookies acabaram de ser escritos, ele às vezes inicia a requisição antes de
      // persistir a gravação no disco. O middleware então não vê a sessão, redireciona de
      // volta pro /login, e o formulário remonta do zero (campos em branco, sem erro nenhum
      // — exatamente o sintoma relatado). Empurrar a navegação pro próximo tick dá tempo do
      // Safari terminar de gravar os cookies antes da navegação começar. Não tem custo
      // perceptível (é um único login) e não afeta Chrome/Firefox, que já funcionavam.
      await new Promise(resolve => setTimeout(resolve, 50));
      window.location.href = '/';
    } catch {
      setError('Erro ao entrar. Tente novamente.');
      setLoading(false);
    }
  };

  const field = 'w-full bg-surface border border-on-surface/[0.12] rounded-[13px] px-4 py-3.5 text-[14px] font-semibold text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors placeholder:text-on-surface/30 placeholder:font-medium';

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[380px] flex flex-col gap-4">
      <div>
        <label htmlFor="login-username" className="text-[10px] font-black text-on-surface/40 uppercase tracking-widest mb-1.5 block">E-mail ou usuário</label>
        <input
          type="text"
          name="username"
          id="login-username"
          value={login}
          onChange={e => setLogin(e.target.value)}
          placeholder="nome@empresa.com ou usuário"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          className={field}
        />
      </div>

      <div>
        <label htmlFor="login-password" className="text-[10px] font-black text-on-surface/40 uppercase tracking-widest mb-1.5 block">Senha</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            name="current-password"
            id="login-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Sua senha"
            autoComplete="current-password"
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
