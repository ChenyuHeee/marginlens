-- Shared document snapshots (no auth required to read a share)
create table if not exists shared_documents (
  id          text primary key,          -- short random token, e.g. 8-char nanoid
  title       text not null,
  content     text not null,             -- full markdown content
  annotations jsonb not null default '[]',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz               -- null = never expires
);

-- Anyone can read a share by token (public, no login needed)
alter table shared_documents enable row level security;

create policy "Public read by token"
  on shared_documents for select
  using (true);

create policy "Authenticated users can create shares"
  on shared_documents for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Creator can delete their own shares"
  on shared_documents for delete
  to authenticated
  using (created_by = auth.uid());
