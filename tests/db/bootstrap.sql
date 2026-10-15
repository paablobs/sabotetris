-- Minimal Supabase Auth/roles contract for isolated PostgreSQL tests, not production.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
-- Supabase grants public-schema routines to API roles by default. Reproduce it
-- so tests catch privilege leaks hidden by PostgreSQL's vanilla defaults.
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  is_anonymous boolean not null default true,
  created_at timestamptz not null default now()
);
