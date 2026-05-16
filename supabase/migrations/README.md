# Supabase migrations

This is the **only** folder the Supabase CLI reads. Every schema change for this
project lives here.

## Apply on your machine

```
git pull
npx supabase db push
npm run dev
```

## Rules

- All new migrations go in this folder. Do NOT create a parallel `db/migrations/`
  folder — the CLI ignores it and your changes will silently not apply.
- File names must be timestamped: `YYYYMMDDHHMMSS_short_description.sql`. The
  CLI applies them in lexical order, so the timestamp prefix matters.
- Write idempotent SQL when possible (`create table if not exists`,
  `add column if not exists`, `drop trigger if exists` before `create trigger`,
  `do $$ ... $$` guards for enum values). That way a re-run is safe if a push
  partially succeeded.
- Never edit a migration that has already been pushed to a shared database.
  Write a new migration instead.
