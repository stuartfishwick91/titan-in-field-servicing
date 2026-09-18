-- Single-administrator presentation trial. Separate employee permissions require
-- a later role model; no prototype PIN or browser session is stored here.
create table public.trial_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'Administrator' check (role = 'Administrator')
);
alter table public.trial_members enable row level security;
revoke all on public.trial_members from anon, authenticated;
grant select on public.trial_members to authenticated;
create policy member_self on public.trial_members for select to authenticated
using (user_id = (select auth.uid()));

create table public.trial_workspaces (
  owner_id uuid primary key references public.trial_members(user_id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  documents jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint trial_document_object check (jsonb_typeof(documents) = 'object'),
  constraint trial_document_size check (octet_length(documents::text) <= 15000000),
  constraint trial_document_keys check (documents - array[
    'titan-assets-v2','titan-bulk-tanks-v1','titan-workshop-stock-v1',
    'titan-service-trucks-v1','titan-oil-templates-v1','titan-fuel-schedule-v3',
    'titan-service-entries-v1','titan-fuel-submissions-v2',
    'titan-stock-adjustment-register-v1','titan-system-alert-settings-v1',
    'titan-branding-settings-v1','titan-daily-fuel-sheet-export-history-v1'
  ]::text[] = '{}'::jsonb)
);
alter table public.trial_workspaces enable row level security;
revoke all on public.trial_workspaces from anon, authenticated;
grant select, insert, update on public.trial_workspaces to authenticated;
create policy workspace_read on public.trial_workspaces for select to authenticated
using (owner_id = (select auth.uid()) and exists (select 1 from public.trial_members where user_id = (select auth.uid())));
create policy workspace_insert on public.trial_workspaces for insert to authenticated
with check (owner_id = (select auth.uid()) and exists (select 1 from public.trial_members where user_id = (select auth.uid())));
create policy workspace_update on public.trial_workspaces for update to authenticated
using (owner_id = (select auth.uid()) and exists (select 1 from public.trial_members where user_id = (select auth.uid())))
with check (owner_id = (select auth.uid()) and exists (select 1 from public.trial_members where user_id = (select auth.uid())));

create table public.trial_commits (
  owner_id uuid not null references public.trial_members(user_id) on delete cascade,
  operation_id uuid not null,
  revision bigint not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, operation_id)
);
alter table public.trial_commits enable row level security;
revoke all on public.trial_commits from anon, authenticated;
grant select, insert on public.trial_commits to authenticated;
create policy commit_read on public.trial_commits for select to authenticated
using (owner_id = (select auth.uid()));
create policy commit_insert on public.trial_commits for insert to authenticated
with check (owner_id = (select auth.uid()) and exists (select 1 from public.trial_members where user_id = (select auth.uid())));

create function public.trial_workspace_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.trial_workspace_revision() from public, anon, authenticated;
create trigger trial_revision before update on public.trial_workspaces
for each row execute function public.trial_workspace_revision();

create function public.commit_trial_workspace(expected_revision bigint, next_documents jsonb, operation_id uuid)
returns setof public.trial_workspaces
language plpgsql security invoker set search_path = '' as $$
declare current_workspace public.trial_workspaces;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select * into current_workspace from public.trial_workspaces
    where owner_id = auth.uid() for update;
  if not found then raise exception 'Trial membership required' using errcode = '42501'; end if;
  if exists (select 1 from public.trial_commits c where c.owner_id = auth.uid() and c.operation_id = $3) then
    return next current_workspace;
    return;
  end if;
  if current_workspace.revision <> expected_revision then
    raise exception 'Another device changed the records. Reload shared records before trying again.' using errcode = 'P0001';
  end if;
  update public.trial_workspaces set documents = next_documents where owner_id = auth.uid()
    returning * into current_workspace;
  insert into public.trial_commits(owner_id, operation_id, revision)
    values (auth.uid(), $3, current_workspace.revision);
  return next current_workspace;
end;
$$;
revoke all on function public.commit_trial_workspace(bigint, jsonb, uuid) from public, anon;
grant execute on function public.commit_trial_workspace(bigint, jsonb, uuid) to authenticated;
