-- One-off cleanup: remove demo/mock accounts and all their data.
-- Cascades clean up profiles, user_roles, properties, property_images,
-- property_documents, applications, leases, maintenance_tickets,
-- favorites, messages, notifications, complaints.
-- (Storage objects for these users should be removed via the Storage API
-- separately; SQL cannot touch storage.objects on Lovable Cloud.)

delete from auth.users
 where email in (
   'admin@homerentals.pk',
   'landlord@homerentals.pk',
   'tenant@homerentals.pk',
   'maintenance@homerentals.pk'
 );
