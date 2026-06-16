// Agrega eventos de 3 origens (RH manual, Requisições de Tarefas, Finanças) num único
// formato de evento de calendário, usado pelo módulo de Recursos Humanos.

export type CalendarEventOrigin = 'hr' | 'task' | 'finance';

export interface HREvent {
  id: string;
  data: string; // YYYY-MM-DD
  titulo: string;
  descricao: string | null;
  categoria: 'Reunião' | 'Treinamento' | 'Férias' | 'Aniversário' | 'Outro';
  responsavel: string | null;
  cor: string;
}

export interface CalendarEvent {
  id: string;
  date: Date;
  origin: CalendarEventOrigin;
  title: string;
  subtitle: string;
  classificacao?: 'Alta' | 'Média' | 'Baixa' | '';
  amount?: number;
  amountKind?: 'rec' | 'desp';
  raw: any;
}

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function dateKey(d: Date): string {
  return d.toDateString();
}

// ── Requisições de Tarefas ──────────────────────────────────────────────────
// Não existe campo de prazo nas requisições hoje — usamos created_at (data de abertura).
export function buildTaskEvents(requests: any[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const request of requests) {
    if (!request.requested_changes || !request.created_at) continue;
    let changes: any;
    try {
      changes = JSON.parse(request.requested_changes);
    } catch {
      continue;
    }
    if (!changes?.is_task) continue;

    const typeLabel = changes.task_type === 'revisao' ? 'Revisão de Mercadoria' : 'Tarefa Livre';
    events.push({
      id: `task-${request.id}`,
      date: isoToLocalDate(request.created_at),
      origin: 'task',
      title: typeLabel + (changes.responsavel ? ` — ${changes.responsavel}` : ''),
      subtitle: `Requisição · Aberta em ${isoToLocalDate(request.created_at).toLocaleDateString('pt-BR')}`,
      classificacao: changes.classificacao || '',
      raw: request,
    });
  }
  return events;
}

// ── Finanças ─────────────────────────────────────────────────────────────────
// Gera um evento na data de lançamento e, se houver vencimento diferente, outro evento nessa data.
export function buildFinanceEvents(transactions: any[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const tx of transactions) {
    const amountKind: 'rec' | 'desp' = tx.tipo === 'Receita' ? 'rec' : 'desp';
    if (tx.data) {
      events.push({
        id: `fin-lanc-${tx.id}`,
        date: isoToLocalDate(tx.data),
        origin: 'finance',
        title: `${tx.tipo} — ${tx.favorecido}`,
        subtitle: `Finanças · ${tx.tipo}`,
        amount: tx.valor_final,
        amountKind,
        raw: tx,
      });
    }
    if (tx.vencimento && tx.vencimento !== tx.data) {
      events.push({
        id: `fin-venc-${tx.id}`,
        date: isoToLocalDate(tx.vencimento),
        origin: 'finance',
        title: `Vencimento — ${tx.favorecido}`,
        subtitle: `Finanças · ${tx.pago ? 'Pago' : 'Pendente'}`,
        amount: tx.valor_final,
        amountKind,
        raw: tx,
      });
    }
  }
  return events;
}

// ── RH manual ────────────────────────────────────────────────────────────────
export function buildHrEvents(hrEvents: HREvent[]): CalendarEvent[] {
  return hrEvents.map(ev => ({
    id: `hr-${ev.id}`,
    date: isoToLocalDate(ev.data),
    origin: 'hr',
    title: ev.titulo,
    subtitle: ev.responsavel ? `RH · ${ev.responsavel}` : `RH · ${ev.categoria}`,
    raw: ev,
  }));
}

export function groupEventsByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const map: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const key = dateKey(ev.date);
    (map[key] ??= []).push(ev);
  }
  return map;
}
