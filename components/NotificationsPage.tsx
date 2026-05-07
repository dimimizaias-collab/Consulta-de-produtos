'use client';

import { Bell, CheckCheck, ArrowRight, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  note_id: string | null;
  note_file_name: string | null;
  read: boolean;
  created_at: string;
}

interface NotificationsPageProps {
  notifications: AppNotification[];
  onGoToNote: (noteId: string) => void;
  onMarkAllRead: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora mesmo';
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `há ${days} dia${days > 1 ? 's' : ''}`;
}

export function NotificationsPage({ notifications, onGoToNote, onMarkAllRead }: NotificationsPageProps) {
  const unread = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <Bell size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-on-surface tracking-tight">Notificações</h2>
            <p className="text-xs text-on-surface/40 font-medium">
              {unread > 0 ? `${unread} não lida${unread > 1 ? 's' : ''}` : 'Tudo em dia'}
            </p>
          </div>
        </div>
        {unread > 0 && (
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-primary hover:bg-primary/5 transition-all"
          >
            <CheckCheck size={14} />
            Marcar todas como lidas
          </button>
        )}
      </div>

      {/* Lista */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-on-surface/20">
          <Bell size={56} className="mb-4 opacity-20" />
          <p className="text-sm font-black uppercase tracking-widest">Nenhuma notificação</p>
        </div>
      ) : (
        <div className="grid gap-4">
          <AnimatePresence initial={false}>
            {notifications.map((n, i) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={cn(
                  "bg-surface-container-lowest rounded-[1.5rem] p-6 border shadow-sm transition-all",
                  n.read
                    ? "border-on-surface/[0.04]"
                    : "border-primary/20 ring-1 ring-primary/10 shadow-primary/5"
                )}
              >
                <div className="flex items-start gap-4">
                  {/* Ícone */}
                  <div className={cn(
                    "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0",
                    n.read ? "bg-on-surface/5 text-on-surface/30" : "bg-primary/10 text-primary"
                  )}>
                    <Package size={20} />
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={cn(
                          "text-sm font-black leading-tight",
                          n.read ? "text-on-surface/60" : "text-on-surface"
                        )}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-xs text-on-surface/40 font-medium mt-0.5">{n.body}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                        <span className="text-[10px] text-on-surface/30 font-bold whitespace-nowrap">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Rodapé do card */}
                    {n.note_id && (
                      <div className="mt-3 pt-3 border-t border-on-surface/[0.04] flex items-center justify-between">
                        <p className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest truncate">
                          {n.note_file_name ?? 'Nota aprovada'}
                        </p>
                        <button
                          onClick={() => onGoToNote(n.note_id!)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-xl text-[11px] font-black hover:bg-on-surface transition-all shadow-md shadow-primary/20 active:scale-95 whitespace-nowrap ml-3"
                        >
                          Ir para nota
                          <ArrowRight size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
