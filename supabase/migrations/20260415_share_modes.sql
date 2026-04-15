-- Add share_mode, access_mode, allowed_emails to shared_documents
alter table shared_documents
  add column if not exists share_mode    text not null default 'readonly',  -- 'readonly' | 'import'
  add column if not exists access_mode   text not null default 'public',    -- 'public' | 'restricted'
  add column if not exists allowed_emails text[] not null default '{}';

-- Drop old blanket-public policy
drop policy if exists "Public read by token" on shared_documents;

-- New read policy: public shares open to all; restricted shares only for creator or allowed emails
create policy "Read by access mode"
  on shared_documents for select
  using (
    access_mode = 'public'
    or created_by = auth.uid()
    or (access_mode = 'restricted' and auth.email() = any(allowed_emails))
  );
