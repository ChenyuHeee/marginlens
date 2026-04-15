-- ─── profiles ───────────────────────────────────────────────────────────────
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  email      text,
  color      text not null default '#6366f1',   -- cursor color in collab
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Anyone (even unauthenticated) can read profiles for display in collab/share
create policy "Public read profiles"
  on profiles for select
  using (true);

-- Owner can insert and update their own profile
create policy "Owner can upsert profile"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "Owner can update profile"
  on profiles for update
  to authenticated
  using (id = auth.uid());

-- ─── collab_documents ───────────────────────────────────────────────────────
-- Stores the persistent Y.js state vector for each collaborative document
create table if not exists collab_documents (
  id            text primary key,               -- same token as shared_documents.id
  ydoc_state    bytea,                          -- Y.encodeStateAsUpdate() snapshot
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

alter table collab_documents enable row level security;

-- Read: same access control as the parent shared_document
-- We join via shared_documents for the access check
create policy "Read collab doc if can read share"
  on collab_documents for select
  using (
    exists (
      select 1 from shared_documents sd
      where sd.id = collab_documents.id
        and (
          sd.access_mode = 'public'
          or sd.created_by = auth.uid()
          or (sd.access_mode = 'restricted' and auth.email() = any(sd.allowed_emails))
        )
    )
  );

-- Write: same restriction — must be allowed
create policy "Write collab doc if allowed"
  on collab_documents for insert
  to authenticated
  with check (
    exists (
      select 1 from shared_documents sd
      where sd.id = collab_documents.id
        and (
          sd.created_by = auth.uid()
          or (sd.access_mode = 'restricted' and auth.email() = any(sd.allowed_emails))
        )
    )
  );

create policy "Update collab doc if allowed"
  on collab_documents for update
  to authenticated
  using (
    exists (
      select 1 from shared_documents sd
      where sd.id = collab_documents.id
        and (
          sd.created_by = auth.uid()
          or (sd.access_mode = 'restricted' and auth.email() = any(sd.allowed_emails))
        )
    )
  );

-- ─── Add 'collab' to share_mode on shared_documents ─────────────────────────
-- share_mode is text; no enum change needed, just document the new value:
-- 'readonly' | 'import' | 'collab'
