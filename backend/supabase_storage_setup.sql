-- Run this in Supabase SQL Editor if Storage says "bucket not found".
-- free_notes is a table; these are Storage buckets.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('free-notes', 'free-notes', true, 104857600, array['application/pdf']),
  ('photocopy-docs', 'photocopy-docs', true, 104857600, array['application/pdf']),
  ('products', 'products', true, 104857600, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('chat-files', 'chat-files', true, 104857600, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read app storage files" on storage.objects;
create policy "Public read app storage files"
on storage.objects for select
using (bucket_id in ('free-notes', 'photocopy-docs', 'products', 'chat-files'));

drop policy if exists "Public upload app storage files" on storage.objects;
create policy "Public upload app storage files"
on storage.objects for insert
with check (bucket_id in ('free-notes', 'photocopy-docs', 'products', 'chat-files'));

drop policy if exists "Public update app storage files" on storage.objects;
create policy "Public update app storage files"
on storage.objects for update
using (bucket_id in ('free-notes', 'photocopy-docs', 'products', 'chat-files'))
with check (bucket_id in ('free-notes', 'photocopy-docs', 'products', 'chat-files'));

drop policy if exists "Public delete app storage files" on storage.objects;
create policy "Public delete app storage files"
on storage.objects for delete
using (bucket_id in ('free-notes', 'photocopy-docs', 'products', 'chat-files'));
