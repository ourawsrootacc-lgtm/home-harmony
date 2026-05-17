-- One-off cleanup: remove demo/mock accounts and all their data.
--
-- Most child tables cascade from auth.users, but several tables hold
-- foreign keys to auth.users WITHOUT `on delete cascade`. PostgreSQL
-- blocks the delete one table at a time until every such reference is
-- cleared. We purge them all here, in dependency order, before touching
-- auth.users.
--
-- Storage objects for these users (property images, documents, payment
-- proofs) must be cleared via the Storage API separately — SQL cannot
-- touch storage.objects directly in Supabase.

do $$
declare
  demo_ids uuid[];
begin
  select coalesce(array_agg(id), '{}')
    into demo_ids
    from auth.users
   where email in (
     'admin@homerentals.pk',
     'landlord@homerentals.pk',
     'tenant@homerentals.pk',
     'maintenance@homerentals.pk'
   );

  if array_length(demo_ids, 1) is null then
    raise notice 'No demo users found, nothing to clean up.';
    return;
  end if;

  -- ---------- Audit / event logs (safe to delete outright) ----------
  delete from public.payment_events     where actor_id = any(demo_ids);
  delete from public.lease_events       where actor_id = any(demo_ids);
  delete from public.maintenance_events where actor_id = any(demo_ids);

  -- ---------- Lease lifecycle records pointing at demo users ----------
  delete from public.lease_signatures where user_id     = any(demo_ids);
  delete from public.lease_requests   where requested_by = any(demo_ids)
                                          or responded_by = any(demo_ids);
  delete from public.deposit_ledger   where recorded_by    = any(demo_ids)
                                          or acknowledged_by = any(demo_ids);
  delete from public.lease_versions   where proposed_by   = any(demo_ids);

  -- ---------- Maintenance lifecycle records ----------
  delete from public.maintenance_cancellations where cancelled_by = any(demo_ids);
  delete from public.maintenance_quotes        where created_by   = any(demo_ids);

  -- ---------- Optional references — null them instead of deleting parents ----------
  update public.maintenance_tickets set assigned_to = null where assigned_to = any(demo_ids);
  update public.payments              set reviewed_by = null where reviewed_by = any(demo_ids);

  -- ---------- Finally, drop the demo accounts. Cascades handle the rest. ----------
  delete from auth.users where id = any(demo_ids);
end $$;
