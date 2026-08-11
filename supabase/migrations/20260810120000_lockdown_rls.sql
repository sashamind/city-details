-- Закрываем запись и модерацию от анонимного ключа.
--
-- Было: политики "всем всё можно" (см. комментарий в миграции photos). Публичный
-- anon-ключ лежит в app.js, поэтому кто угодно мог удалить любую точку, фото или
-- описание и одобрить свои записи в обход модерации.
--
-- Стало:
--   * читать анониму — только одобренное;
--   * создавать — только со статусом pending;
--   * менять и удалять — нельзя вообще; это делает edge-функция admin-action
--     под service-role ключом после проверки токена администратора.
--
-- ВАЖНО: перед применением этой миграции должны быть задеплоены функции
-- admin-login и admin-action и обновлён фронтенд, иначе админка перестанет
-- работать (публичная часть сайта продолжит работать в любом случае).

-- 1. Убираем все прежние политики на наших таблицах: их имена в разных
--    окружениях могли отличаться, поэтому чистим по факту.
do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('details', 'notes', 'photos')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

alter table public.details enable row level security;
alter table public.notes   enable row level security;
alter table public.photos  enable row level security;

-- 2. Чтение: анониму видно только одобренное.
--    service-role политики обходит, так что админка видит всё.
create policy "details_public_select" on public.details
  for select using (status = 'approved');

create policy "notes_public_select" on public.notes
  for select using (status = 'approved');

create policy "photos_public_select" on public.photos
  for select using (status = 'approved');

-- 3. Создание: только на модерацию. Одобрить свою же запись нельзя.
create policy "details_public_insert" on public.details
  for insert with check (status = 'pending');

create policy "notes_public_insert" on public.notes
  for insert with check (status = 'pending');

create policy "photos_public_insert" on public.photos
  for insert with check (status = 'pending');

-- 4. UPDATE и DELETE политик не имеют вовсе — значит, анониму запрещены.

-- 5. Хранилище: анонимная загрузка остаётся (иначе никто не пришлёт фото),
--    но удалять и перезаписывать чужие файлы нельзя. Ограничительные политики
--    (as restrictive) складываются с существующими по И, поэтому нам не нужно
--    знать их имена и мы не задеваем другие бакеты.
drop policy if exists "photos_bucket_no_public_delete" on storage.objects;
create policy "photos_bucket_no_public_delete" on storage.objects
  as restrictive for delete
  using (bucket_id <> 'photos' or auth.role() = 'service_role');

drop policy if exists "photos_bucket_no_public_update" on storage.objects;
create policy "photos_bucket_no_public_update" on storage.objects
  as restrictive for update
  using (bucket_id <> 'photos' or auth.role() = 'service_role');

-- 6. Ограничиваем, что вообще можно залить в бакет: только картинки и не
--    больше 10 МБ. HEIC оставлен намеренно — на мобильных сжатие может
--    не сработать, и тогда уходит оригинал с камеры.
update storage.buckets
set
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp',
    'image/gif', 'image/heic', 'image/heif'
  ]
where id = 'photos';
