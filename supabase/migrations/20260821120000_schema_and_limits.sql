-- Схема точек и описаний + ограничения на размер полей.
--
-- Таблицы details и notes создавались руками в панели Supabase и в репозитории
-- описаны не были: схему нельзя было ни воспроизвести, ни прочитать, не заходя
-- в консоль. Здесь они зафиксированы в том виде, в каком работают (create table
-- if not exists ничего не тронет в существующей базе).
--
-- Второе: длина текста не была ограничена ничем — ни формой, ни базой. Публичный
-- ключ разрешает вставку заявок, то есть кто угодно мог положить в очередь
-- модерации описание на десять мегабайт. Проверки в базе действуют независимо
-- от того, что и откуда шлёт клиент.

create table if not exists public.details (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text default '',
  category    text not null default 'other',  -- одна или несколько через запятую
  lat         double precision not null,
  lng         double precision not null,
  photo_url   text default '',
  thumb_url   text not null default '',
  author      text default 'Аноним',
  status      text not null default 'pending' check (status in ('pending', 'approved')),
  created_at  timestamptz not null default now()
);

create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  detail_id  text not null,
  text       text not null,
  author     text default 'Аноним',
  status     text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now()
);

create index if not exists details_status_idx on public.details (status, created_at desc);
create index if not exists notes_detail_idx   on public.notes (detail_id, status);

-- Ограничения добавляем по одному и только если их ещё нет: миграция должна
-- проходить и на базе, где часть из них уже стоит.
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('details', 'details_title_len',       'char_length(title) between 1 and 200'),
      ('details', 'details_description_len', 'char_length(coalesce(description, '''')) <= 2000'),
      ('details', 'details_author_len',      'char_length(coalesce(author, '''')) <= 80'),
      ('details', 'details_category_len',    'char_length(category) <= 120'),
      ('details', 'details_photo_url_len',   'char_length(coalesce(photo_url, '''')) <= 2000'),
      ('details', 'details_thumb_url_len',   'char_length(thumb_url) <= 2000'),
      ('details', 'details_coords_range',    'lat between -90 and 90 and lng between -180 and 180'),
      ('notes',   'notes_text_len',          'char_length(text) between 1 and 2000'),
      ('notes',   'notes_author_len',        'char_length(coalesce(author, '''')) <= 80'),
      ('photos',  'photos_author_len',       'char_length(coalesce(author, '''')) <= 80'),
      ('photos',  'photos_photo_url_len',    'char_length(photo_url) <= 2000'),
      ('photos',  'photos_thumb_url_len',    'char_length(thumb_url) <= 2000')
    ) as t(tbl, name, expr)
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = c.name and conrelid = ('public.' || c.tbl)::regclass
    ) then
      execute format('alter table public.%I add constraint %I check (%s)', c.tbl, c.name, c.expr);
    end if;
  end loop;
end $$;
