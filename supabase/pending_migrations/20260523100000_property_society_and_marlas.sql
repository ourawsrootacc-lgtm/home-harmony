-- Society + Marlas migration
-- 1. Add `society` (free-text within a city)
alter table public.properties
  add column if not exists society text;

-- 2. Add `area_marlas` as the authoritative area field.
alter table public.properties
  add column if not exists area_marlas numeric(6,2);

-- Backfill from area_sqft (1 marla ≈ 272.25 sq ft)
update public.properties
   set area_marlas = round((area_sqft / 272.25)::numeric, 2)
 where area_marlas is null and area_sqft is not null;

-- Allow area_sqft to be nullable so new inserts can omit it.
alter table public.properties
  alter column area_sqft drop not null;

-- Keep area_sqft in sync with area_marlas via a trigger so any
-- legacy consumer still reads a consistent value.
create or replace function public.sync_property_area_sqft()
returns trigger
language plpgsql
as $$
begin
  if NEW.area_marlas is not null then
    NEW.area_sqft := round(NEW.area_marlas * 272.25);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_property_area_sqft on public.properties;
create trigger trg_sync_property_area_sqft
before insert or update of area_marlas on public.properties
for each row execute function public.sync_property_area_sqft();

-- 3. Restrict city to the 5 supported cities. Drop old check if any.
alter table public.properties
  drop constraint if exists properties_city_check;

-- Remove legacy rows for unsupported cities so the new check can apply.
delete from public.properties
 where city not in ('Karachi','Lahore','Islamabad','Peshawar','Quetta');

alter table public.properties
  add constraint properties_city_check
  check (city in ('Karachi','Lahore','Islamabad','Peshawar','Quetta'));
