-- Supabase blocks direct writes to storage.objects from SQL.
-- These triggers caused property/application deletes to fail with
-- "Direct deletion from storage tables is not allowed."
-- Storage cleanup is now handled in app code via the Storage API.

drop trigger if exists application_documents_delete_storage on public.application_documents;
drop trigger if exists property_documents_delete_storage on public.property_documents;
drop function if exists public.delete_app_doc_storage();
drop function if exists public.delete_property_doc_storage();
