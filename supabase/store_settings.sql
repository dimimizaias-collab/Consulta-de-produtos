create table if not exists public.store_settings (
  id text primary key default 'default',
  name text,
  cnpj text,
  address text,
  logo text,
  updated_at timestamptz default now()
);

alter table public.store_settings enable row level security;

create policy "Allow full access to store_settings"
  on public.store_settings
  for all
  using (true)
  with check (true);
