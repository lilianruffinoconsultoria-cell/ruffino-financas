-- Ruffino Finanças · sincronização na nuvem (Supabase)
-- Rode este script uma vez em: Supabase → SQL Editor → New query → Run.
-- Cada usuário tem uma linha com todos os dados do app (JSON). O RLS garante
-- que cada pessoa só lê e grava a própria linha, mesmo usando a chave pública (anon).

create table if not exists public.app_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  rev        bigint      not null default 1,   -- versão: sobe a cada envio (evita sobrescrever outro aparelho)
  updated_at timestamptz not null default now(),
  device     text
);

alter table public.app_state enable row level security;

drop policy if exists "app_state: ler a própria linha" on public.app_state;
drop policy if exists "app_state: criar a própria linha" on public.app_state;
drop policy if exists "app_state: alterar a própria linha" on public.app_state;
drop policy if exists "app_state: apagar a própria linha" on public.app_state;

create policy "app_state: ler a própria linha" on public.app_state
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "app_state: criar a própria linha" on public.app_state
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "app_state: alterar a própria linha" on public.app_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "app_state: apagar a própria linha" on public.app_state
  for delete to authenticated using ((select auth.uid()) = user_id);
