-- One-off cleanup: remove demo/mock accounts and all their data.
-- Most child tables cascade from auth.users, but `lease_signatures.user_id`
-- has no ON DELETE CASCADE, so we must purge those rows manually first.
-- (Storage objects for these users should be removed via the Storage API
-- separately; SQL cannot touch storage.objects on Lovable Cloud.)

delete from public.lease_signatures
 where user_id in (
   select id from auth.users
   where email in (
     'admin@homerentals.pk',
     'landlord@homerentals.pk',
     'tenant@homerentals.pk',
     'maintenance@homerentals.pk'
   )
 );

delete from auth.users
 where email in (
   'admin@homerentals.pk',
   'landlord@homerentals.pk',
   'tenant@homerentals.pk',
   'maintenance@homerentals.pk'
 );
