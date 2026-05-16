// scripts/seed.mjs — create demo users + sample data
// Usage: node scripts/seed.mjs
// Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in environment (or .env)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const PWD = "Demo@1234";

const USERS = [
  { email: "admin@homerentals.pk",       full_name: "Aisha Khan",   phone: "+923001112233", role: "admin" },
  { email: "landlord@homerentals.pk",    full_name: "Omar Sheikh",  phone: "+923002223344", role: "landlord" },
  { email: "tenant@homerentals.pk",      full_name: "Hassan Ali",   phone: "+923003334455", role: "tenant" },
  { email: "maintenance@homerentals.pk", full_name: "Bilal Ahmed",  phone: "+923004445566", role: "maintenance" },
];

const PROPERTIES = (landlord_id) => [
  { title: "2-bed apartment in DHA Phase 5", city: "Karachi", address: "Khayaban-e-Shahbaz, DHA Phase 5",
    type: "apartment", bedrooms: 2, bathrooms: 2, area_sqft: 1100, monthly_rent: 95000, deposit: 190000,
    lat: 24.7990, lng: 67.0421, is_verified: true,
    description: "Bright 2-bedroom apartment with modern kitchen and parking. Walking distance to cafes." },
  { title: "Spacious 3-bed house in Bahria Town", city: "Lahore", address: "Sector C, Bahria Town",
    type: "house", bedrooms: 3, bathrooms: 3, area_sqft: 2200, monthly_rent: 130000, deposit: 260000,
    lat: 31.3700, lng: 74.1820, is_verified: true,
    description: "Family home with lawn, servant quarters, gated community with security." },
  { title: "Studio in F-7 Markaz", city: "Islamabad", address: "F-7 Markaz",
    type: "studio", bedrooms: 1, bathrooms: 1, area_sqft: 500, monthly_rent: 60000, deposit: 60000,
    lat: 33.7180, lng: 73.0519, is_verified: true,
    description: "Compact furnished studio steps from F-7 Markaz restaurants and supermarkets." },
  { title: "Upper portion in Gulberg", city: "Lahore", address: "MM Alam Road, Gulberg III",
    type: "portion", bedrooms: 2, bathrooms: 2, area_sqft: 1300, monthly_rent: 85000, deposit: 170000,
    lat: 31.5160, lng: 74.3460, is_verified: false,
    description: "Independent upper portion with separate entrance, two bedrooms and balcony." },
  { title: "4-bed villa in Bahria Enclave", city: "Islamabad", address: "Bahria Enclave Sector C",
    type: "house", bedrooms: 4, bathrooms: 4, area_sqft: 3200, monthly_rent: 220000, deposit: 440000,
    lat: 33.6900, lng: 73.1610, is_verified: true,
    description: "Luxury villa with private lawn, modular kitchen, and 24/7 security." },
  const { data: created, error } = await sb.auth.admin.createUser({
    email, password: PWD, email_confirm: true,
    user_metadata: { full_name, phone, role },
  });
  let user = created?.user;
  if (error && /already/i.test(error.message)) {
    const { data: list } = await sb.auth.admin.listUsers();
    user = list.users.find(u => u.email === email);
  } else if (error) { throw error; }
  await sb.from("profiles").upsert({ id: user.id, full_name, phone });
  await sb.from("user_roles").upsert({ user_id: user.id, role }, { onConflict: "user_id,role" });
  return user;
};

(async () => {
  console.log("Seeding users…");
  const users = {};
  for (const u of USERS) users[u.role] = await upsertUser(u);

  console.log("Seeding properties…");
  // clear existing for landlord to keep idempotent
  await sb.from("properties").delete().eq("landlord_id", users.landlord.id);
  const { data: props } = await sb.from("properties").insert(PROPERTIES(users.landlord.id)).select();

  console.log("Seeding sample application…");
  if (props?.[0]) {
    await sb.from("applications").insert({
      property_id: props[0].id, tenant_id: users.tenant.id,
      message: "Hi, I'd love to schedule a viewing this weekend.",
      status: "pending",
    });
  }
  if (props?.[1]) {
    const start = new Date(); const end = new Date(); end.setFullYear(end.getFullYear()+1);
    await sb.from("leases").insert({
      property_id: props[1].id, tenant_id: users.tenant.id, landlord_id: users.landlord.id,
      start_date: start.toISOString().slice(0,10), end_date: end.toISOString().slice(0,10),
      monthly_rent: props[1].monthly_rent, deposit: props[1].deposit, status: "active",
    });
    await sb.from("maintenance_tickets").insert([
      { property_id: props[1].id, tenant_id: users.tenant.id, category: "plumbing", priority: "high",
        description: "Kitchen sink is leaking under the cabinet.", status: "open" },
      { property_id: props[1].id, tenant_id: users.tenant.id, category: "electrical", priority: "medium",
        description: "Hallway light fixture is flickering.", status: "in_progress", assigned_to: users.maintenance.id },
    ]);
  }

  console.log("Done. Demo accounts:");
  USERS.forEach(u => console.log(`  ${u.role.padEnd(12)} ${u.email}  /  ${PWD}`));
})().catch(e => { console.error(e); process.exit(1); });
