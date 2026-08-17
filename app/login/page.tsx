import Image from 'next/image';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[420px] bg-surface-container-lowest rounded-[2.5rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] p-10 flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-on-surface/[0.10] flex items-center justify-center overflow-hidden">
            <div className="relative w-10 h-10">
              <Image src="/brand/logo.png" alt="Universo do R$1,99" fill className="object-contain" unoptimized priority />
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-black text-on-surface tracking-tight">Controle de Estoque</h1>
            <p className="text-xs text-on-surface/40 font-medium uppercase tracking-widest mt-1">Entre com seu login</p>
          </div>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
