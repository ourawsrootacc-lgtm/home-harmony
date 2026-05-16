-- 0006 — storage buckets + policies
insert into storage.buckets (id, name, public) values
  ('property-images','property-images', true),
  ('avatars','avatars', true),
  ('maintenance-photos','maintenance-photos', true),
  ('documents','documents', false)
on conflict (id) do nothing;

create policy "public read property images" on storage.objects for select using (bucket_id = 'property-images');
create policy "public read avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "public read maintenance photos" on storage.objects for select using (bucket_id = 'maintenance-photos');

create policy "auth upload property images" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-images' and (auth.uid())::text = (storage.foldername(name))[1]);
create policy "auth upload avatars" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1]);
create policy "auth upload maintenance photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'maintenance-photos' and (auth.uid())::text = (storage.foldername(name))[1]);

create policy "owner deletes own files" on storage.objects for delete to authenticated
  using ((auth.uid())::text = (storage.foldername(name))[1]);
