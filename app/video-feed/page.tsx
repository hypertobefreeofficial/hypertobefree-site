drop table if exists public.story_reactions cascade;

create table public.story_reactions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null check (
    reaction_type in ('amen', 'praise', 'encouraged')
  ),
  created_at timestamptz not null default now(),
  unique (story_id, user_id, reaction_type)
);

alter table public.story_reactions enable row level security;

create policy "Users can view story reactions"
on public.story_reactions
for select
to authenticated
using (true);

create policy "Users can add story reactions"
on public.story_reactions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can remove own story reactions"
on public.story_reactions
for delete
to authenticated
using (auth.uid() = user_id);
