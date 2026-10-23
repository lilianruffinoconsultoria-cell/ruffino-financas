-- Ruffino Finanças · sincronização na nuvem (Supabase)
-- Rode este script uma vez em: Supabase → SQL Editor → New query → Run.
-- Cada usuário tem uma linha com todos os dados do app (JSON). O RLS garante
-- que cada pessoa só lê e grava a própria linha, mesmo usando a chave pública (anon).

create table if not exists public.ruffino_financas_estado (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  rev        bigint      not null default 1,   -- versão: sobe a cada envio (evita sobrescrever outro aparelho)
  updated_at timestamptz not null default now(),
  device     text
);

alter table public.ruffino_financas_estado enable row level security;

drop policy if exists "ruffino_financas_estado: ler a própria linha" on public.ruffino_financas_estado;
drop policy if exists "ruffino_financas_estado: criar a própria linha" on public.ruffino_financas_estado;
drop policy if exists "ruffino_financas_estado: alterar a própria linha" on public.ruffino_financas_estado;
drop policy if exists "ruffino_financas_estado: apagar a própria linha" on public.ruffino_financas_estado;

create policy "ruffino_financas_estado: ler a própria linha" on public.ruffino_financas_estado
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "ruffino_financas_estado: criar a própria linha" on public.ruffino_financas_estado
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "ruffino_financas_estado: alterar a própria linha" on public.ruffino_financas_estado
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "ruffino_financas_estado: apagar a própria linha" on public.ruffino_financas_estado
  for delete to authenticated using ((select auth.uid()) = user_id);
