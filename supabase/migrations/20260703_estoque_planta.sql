-- Planta do estoque: blocos posicionáveis na planta visual (prateleiras, paredes e objetos)

create table if not exists floor_blocks (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('shelf', 'wall', 'object')),
  shelf_id    uuid references shelves(id) on delete cascade,
  name        text,
  icon        text,
  pos_x       numeric not null default 40,
  pos_y       numeric not null default 40,
  width       numeric not null default 150,
  height      numeric not null default 150,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (shelf_id),
  constraint floor_blocks_shelf_type_chk check (
    (type = 'shelf' and shelf_id is not null) or (type <> 'shelf' and shelf_id is null)
  )
);

create index if not exists floor_blocks_type_idx on floor_blocks(type);
