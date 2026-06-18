-- Доп. фотографии к точкам ("хронология").
-- Каждая точка (details) уже хранит обложку в details.photo_url — это самое первое/старое фото.
-- В этой таблице — все ДОПОЛНИТЕЛЬНЫЕ фото: их добавляет кто угодно, админ подтверждает,
-- порядок задаётся sort_order (по умолчанию новые уходят в конец).
--
-- ВАЖНО про безопасность: в проекте админ проверяется только на клиенте (edge-функция
-- admin-login), а все запросы идут под публичным anon-ключом. Поэтому политики ниже
-- повторяют текущую модель details/notes — аноним может всё. Если позже захотите
-- закрыть запись/модерацию, это делается здесь, политиками RLS.

create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  detail_id   text not null,                 -- ссылка на details.id (строкой, без FK — чтобы не зависеть от типа id)
  photo_url   text not null,
  author      text default 'Аноним',
  status      text not null default 'pending' check (status in ('pending', 'approved')),
  sort_order  integer not null default 0,    -- порядок в слайдере; меньше = раньше (старше)
  created_at  timestamptz not null default now()
);

create index if not exists photos_detail_idx on public.photos (detail_id, status);
create index if not exists photos_order_idx  on public.photos (detail_id, sort_order, created_at);

alter table public.photos enable row level security;

-- Политики повторяют существующую (разрешительную) модель проекта.
drop policy if exists "photos_select" on public.photos;
create policy "photos_select" on public.photos for select using (true);

drop policy if exists "photos_insert" on public.photos;
create policy "photos_insert" on public.photos for insert with check (true);

drop policy if exists "photos_update" on public.photos;
create policy "photos_update" on public.photos for update using (true) with check (true);

drop policy if exists "photos_delete" on public.photos;
create policy "photos_delete" on public.photos for delete using (true);
