-- Estoque físico: prateleiras, caixas e conteúdo das caixas

create table if not exists shelves (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists storage_boxes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  shelf_id    uuid references shelves(id) on delete set null,
  description text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists box_contents (
  id          uuid primary key default gen_random_uuid(),
  box_id      uuid references storage_boxes(id) on delete cascade not null,
  product_id  uuid references products(id) on delete cascade not null,
  quantity    integer not null default 1,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (box_id, product_id)
);
