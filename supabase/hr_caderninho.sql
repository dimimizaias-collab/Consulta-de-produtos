create table if not exists public.hr_caderninho (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references public.hr_employees(id) on delete set null,
  colaborador_nome text,
  tipo text not null check (tipo in ('Mercadoria', 'Vale', 'Outros')),
  valor numeric(12,2) not null default 0,
  observacao text,
  data date not null,
  created_at timestamptz default now()
);

alter table public.hr_caderninho enable row level security;

create policy "Allow full access to hr_caderninho"
  on public.hr_caderninho
  for all
  using (true)
  with check (true);
