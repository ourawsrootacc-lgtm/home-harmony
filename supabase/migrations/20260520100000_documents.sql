-- Secure document exchange between tenants and landlords.
-- Storage: existing private 'documents' bucket.
-- Paths:
--   applications/{application_id}/{uploader_id}/{kind}-{ts}.{ext}
--   properties/{property_id}/{uploader_id}/{kind}-{ts}.{ext}

create type public.app_document_kind as enum
  ('cnic','payslip','bank_statement','employment_letter','police_clearance');

create type public.property_document_kind as enum
  ('ownership','society_noc');

create table public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  tenant_id uuid not null references auth.users(id) on delete cascade,
  kind public.app_document_kind not null,
  storage_path text not null unique,
  mime text,
  size_bytes int check (size_bytes is null or size_bytes <= 10485760),
  created_at timestamptz not null default now()
);
create index application_documents_app_idx on public.application_documents(application_id);

create table public.property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  landlord_id uuid not null references auth.users(id) on delete cascade,
  kind public.property_document_kind not null,
  storage_path text not null unique,
  mime text,
  size_bytes int check (size_bytes is null or size_bytes <= 10485760),
  created_at timestamptz not null default now()
);
create index property_documents_prop_idx on public.property_documents(property_id);

create table public.document_access_log (
  id uuid primary key default gen_random_uuid(),
  document_table text not null check (document_table in ('application_documents','property_documents')),
  document_id uuid not null,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now()
);
create index document_access_log_doc_idx on public.document_access_log(document_table, document_id);

alter table public.application_documents enable row level security;
alter table public.property_documents enable row level security;
alter table public.document_access_log enable row level security;

-- application_documents
create policy "tenant reads own app docs" on public.application_documents
  for select to authenticated using (auth.uid() = tenant_id);

create policy "landlord reads tenant docs when reviewing" on public.application_documents
  for select to authenticated using (
    exists (
      select 1 from public.applications a
      join public.properties p on p.id = a.property_id
      where a.id = application_id
        and p.landlord_id = auth.uid()
        and a.status in ('under_review','offer_sent','approved','fulfilled')
    )
  );

create policy "tenant uploads own app docs" on public.application_documents
  for insert to authenticated with check (
    auth.uid() = tenant_id
    and exists (
      select 1 from public.applications a
      where a.id = application_id
        and a.tenant_id = auth.uid()
        and a.status in ('pending','under_review')
    )
  );

create policy "tenant deletes own app docs" on public.application_documents
  for delete to authenticated using (auth.uid() = tenant_id);

-- property_documents
create policy "landlord reads own property docs" on public.property_documents
  for select to authenticated using (auth.uid() = landlord_id);

create policy "landlord writes own property docs" on public.property_documents
  for insert to authenticated with check (
    auth.uid() = landlord_id
    and exists (select 1 from public.properties p
                where p.id = property_id and p.landlord_id = auth.uid())
  );

create policy "landlord deletes own property docs" on public.property_documents
  for delete to authenticated using (auth.uid() = landlord_id);

create policy "tenant reads property docs when approved/leased" on public.property_documents
  for select to authenticated using (
    exists (
      select 1 from public.applications a
      where a.property_id = property_documents.property_id
        and a.tenant_id = auth.uid()
        and a.status in ('approved','fulfilled')
    )
    or exists (
      select 1 from public.leases l
      where l.property_id = property_documents.property_id
        and l.tenant_id = auth.uid()
        and l.status in ('active','pending_activation','holdover','disputed')
    )
  );

-- access log
create policy "users insert own access log" on public.document_access_log
  for insert to authenticated with check (auth.uid() = viewer_id);

create policy "tenant sees views on own app docs" on public.document_access_log
  for select to authenticated using (
    document_table = 'application_documents'
    and exists (
      select 1 from public.application_documents d
      where d.id = document_id and d.tenant_id = auth.uid()
    )
  );

create policy "landlord sees views on own property docs" on public.document_access_log
  for select to authenticated using (
    document_table = 'property_documents'
    and exists (
      select 1 from public.property_documents d
      where d.id = document_id and d.landlord_id = auth.uid()
    )
  );

-- Storage policies for 'documents' bucket — gated via a SECURITY DEFINER helper
-- that mirrors the RLS rules above and looks up the row by storage_path.
create or replace function public.can_access_document_path(p text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.application_documents d
    where d.storage_path = p and (
      d.tenant_id = auth.uid()
      or exists (
        select 1 from public.applications a
        join public.properties pr on pr.id = a.property_id
        where a.id = d.application_id
          and pr.landlord_id = auth.uid()
          and a.status in ('under_review','offer_sent','approved','fulfilled')
      )
    )
  ) or exists (
    select 1 from public.property_documents d
    where d.storage_path = p and (
      d.landlord_id = auth.uid()
      or exists (
        select 1 from public.applications a
        where a.property_id = d.property_id
          and a.tenant_id = auth.uid()
          and a.status in ('approved','fulfilled')
      )
      or exists (
        select 1 from public.leases l
        where l.property_id = d.property_id
          and l.tenant_id = auth.uid()
          and l.status in ('active','pending_activation','holdover','disputed')
      )
    )
  );
$$;

create policy "read documents via app rules" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and public.can_access_document_path(name));

-- Upload: path must be applications/{id}/{auth.uid}/... or properties/{id}/{auth.uid}/...
create policy "auth upload documents" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in ('applications','properties')
    and (auth.uid())::text = (storage.foldername(name))[3]
  );

create policy "owner deletes own documents" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (auth.uid())::text = (storage.foldername(name))[3]
  );

-- Auto-purge on rejection / cancellation
-- 1) Removing an application_documents row also removes the storage object.
create or replace function public.delete_app_doc_storage()
returns trigger language plpgsql security definer set search_path = public, storage
as $$
begin
  delete from storage.objects
   where bucket_id = 'documents' and name = OLD.storage_path;
  return OLD;
end;
$$;

create trigger application_documents_delete_storage
  before delete on public.application_documents
  for each row execute function public.delete_app_doc_storage();

create or replace function public.delete_property_doc_storage()
returns trigger language plpgsql security definer set search_path = public, storage
as $$
begin
  delete from storage.objects
   where bucket_id = 'documents' and name = OLD.storage_path;
  return OLD;
end;
$$;

create trigger property_documents_delete_storage
  before delete on public.property_documents
  for each row execute function public.delete_property_doc_storage();

-- 2) Application transitions to a terminal state purge tenant docs.
create or replace function public.purge_app_docs_on_close()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if NEW.status in ('rejected','cancelled','withdrawn','superseded')
     and OLD.status is distinct from NEW.status then
    delete from public.application_documents where application_id = NEW.id;
  end if;
  return NEW;
end;
$$;

create trigger applications_purge_docs_on_close
  after update of status on public.applications
  for each row execute function public.purge_app_docs_on_close();
