-- Deposit-gated lease activation.
-- When a 'deposit' payment for a lease flips to 'approved', and the lease is
-- waiting in 'pending_activation', activate it and write an audit event.

create or replace function public.activate_lease_on_deposit_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.context = 'deposit'
     and NEW.status = 'approved'
     and NEW.lease_id is not null
     and (OLD.status is distinct from 'approved') then
    update public.leases
       set status = 'active',
           activated_at = now()
     where id = NEW.lease_id
       and status = 'pending_activation';

    if found then
      insert into public.lease_events (lease_id, kind, payload)
      values (
        NEW.lease_id,
        'activated',
        jsonb_build_object('via_payment', NEW.id, 'amount', NEW.amount)
      );
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_activate_lease_on_deposit on public.payments;
create trigger trg_activate_lease_on_deposit
  after update on public.payments
  for each row execute function public.activate_lease_on_deposit_approval();
