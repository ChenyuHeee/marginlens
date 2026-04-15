-- MarginLens Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- Enable Row Level Security on all tables
-- Users can only access their own data

-- ─── Documents ───
create table if not exists public.documents (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text not null check (type in ('markdown', 'pdf')),
  content text not null default '',
  file_size integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "Users can manage own documents"
  on public.documents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_documents_user on public.documents(user_id);

-- ─── Annotations ───
create table if not exists public.annotations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  selected_text text not null default '',
  context_before text not null default '',
  context_after text not null default '',
  comment text not null default '',
  llm_response text,
  color text not null default '#fef08a',
  position_hint jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.annotations enable row level security;

create policy "Users can manage own annotations"
  on public.annotations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_annotations_user on public.annotations(user_id);
create index if not exists idx_annotations_document on public.annotations(document_id);

-- ─── Chat Sessions ───
create table if not exists public.chat_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  title text not null default '',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_sessions enable row level security;

create policy "Users can manage own chat sessions"
  on public.chat_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_chat_sessions_user on public.chat_sessions(user_id);
create index if not exists idx_chat_sessions_document on public.chat_sessions(document_id);

-- ─── User Settings ───
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  read_progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users can manage own settings"
  on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── API Usage ───
create table if not exists public.api_usage (
  -- composite key: '{YYYY-MM-DD}__{provider_id}'
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  provider_id text not null,
  provider_name text not null,
  model text not null default '',
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  calls integer not null default 0
);

alter table public.api_usage enable row level security;

create policy "Users can manage own api_usage"
  on public.api_usage for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_api_usage_user on public.api_usage(user_id);
create index if not exists idx_api_usage_date on public.api_usage(user_id, date);
