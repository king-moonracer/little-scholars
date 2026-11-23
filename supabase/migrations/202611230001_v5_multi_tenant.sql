-- Little Scholars 5.0 — apply ONLY to a new Supabase project after review.
-- Ownership, schools, teachers, guardians and learner progress are enforced in Postgres.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.organizations (
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('family','school','coop')),
 name text not null check(length(trim(name)) between 2 and 120),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.memberships (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','school_admin','teacher','guardian')),
 created_at timestamptz not null default now(),
 primary key(organization_id,user_id)
);
create table if not exists public.classrooms (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100),
 created_at timestamptz not null default now(),
 unique(id,organization_id)
);
create table if not exists public.classroom_teachers (
 classroom_id uuid not null references public.classrooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key(classroom_id,user_id)
);
create table if not exists public.learners (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 classroom_id uuid null references public.classrooms(id) on delete set null,
 display_name text not null check(length(trim(display_name)) between 1 and 50),
 stage text not null default 'grammar' check(stage in ('grammar','logic','rhetoric')),
 worldview text not null default 'secular' check(worldview in ('secular','christian','choose')),
 created_at timestamptz not null default now(),
 unique(id,organization_id)
);
create table if not exists public.learner_guardians (
 learner_id uuid not null references public.learners(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key(learner_id,user_id)
);
create table if not exists public.learner_progress (
 learner_id uuid primary key references public.learners(id) on delete cascade,
 payload jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 constraint payload_is_object check (jsonb_typeof(payload)='object'),
 constraint payload_max_length check(octet_length(payload::text)<250000)
);

create index if not exists memberships_user_idx on public.memberships(user_id);
create index if not exists learners_org_idx on public.learners(organization_id);
create index if not exists learners_class_idx on public.learners(classroom_id);
create index if not exists guardians_user_idx on public.learner_guardians(user_id);
create index if not exists teachers_user_idx on public.classroom_teachers(user_id);

-- SECURITY DEFINER permission predicates avoid RLS recursion. Not exposed as remote API.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.has_role(org uuid, accepted text[])
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.memberships m
 where m.organization_id=org and m.user_id=(select auth.uid()) and m.role=any(accepted)) $$;
create or replace function private.can_read_learner(learner uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(
 select 1 from public.learners l
 where l.id=learner and (
  private.has_role(l.organization_id,array['owner','school_admin'])
  or (private.has_role(l.organization_id,array['guardian','teacher','owner','school_admin']) and exists(select 1 from public.learner_guardians g where g.learner_id=l.id and g.user_id=(select auth.uid())))
  or (private.has_role(l.organization_id,array['teacher','owner','school_admin','guardian']) and exists(select 1 from public.classroom_teachers t where t.classroom_id=l.classroom_id and t.user_id=(select auth.uid())))
 )
) $$;
create or replace function private.can_edit_learner(learner uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.can_read_learner(learner) $$;

revoke all on function private.has_role(uuid,text[]) from public,anon;
revoke all on function private.can_read_learner(uuid) from public,anon;
revoke all on function private.can_edit_learner(uuid) from public,anon;
grant execute on function private.has_role(uuid,text[]),private.can_read_learner(uuid),private.can_edit_learner(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.classrooms enable row level security;
alter table public.classroom_teachers enable row level security;
alter table public.learners enable row level security;
alter table public.learner_guardians enable row level security;
alter table public.learner_progress enable row level security;

create policy org_read on public.organizations for select to authenticated
 using(private.has_role(id,array['owner','school_admin','teacher','guardian']));
create policy membership_read on public.memberships for select to authenticated
 using(user_id=(select auth.uid()) or private.has_role(organization_id,array['owner','school_admin']));
create policy class_read on public.classrooms for select to authenticated
 using(private.has_role(organization_id,array['owner','school_admin']) or
  (private.has_role(organization_id,array['teacher','guardian']) and exists(select 1 from public.classroom_teachers t where t.classroom_id=id and t.user_id=(select auth.uid()))));
create policy learner_read on public.learners for select to authenticated
 using(private.can_read_learner(id));
create policy teacher_read on public.classroom_teachers for select to authenticated
 using(user_id=(select auth.uid()) or exists(select 1 from public.classrooms c where c.id=classroom_id and private.has_role(c.organization_id,array['owner','school_admin'])));
create policy guardian_read on public.learner_guardians for select to authenticated
 using(user_id=(select auth.uid()) or private.can_read_learner(learner_id));
create policy progress_read on public.learner_progress for select to authenticated
 using(private.can_read_learner(learner_id));
create policy progress_insert on public.learner_progress for insert to authenticated
 with check(private.can_edit_learner(learner_id) and updated_by=(select auth.uid()));
create policy progress_update on public.learner_progress for update to authenticated
 using(private.can_edit_learner(learner_id))
 with check(private.can_edit_learner(learner_id) and updated_by=(select auth.uid()));

grant select on public.organizations,public.memberships,public.classrooms,public.classroom_teachers,public.learners,public.learner_guardians,public.learner_progress to authenticated;

-- No direct client mutation of access-control tables. Mutations use audited RPCs.
revoke insert,update,delete on public.organizations,public.memberships,public.classrooms,
 public.classroom_teachers,public.learners,public.learner_guardians from anon,authenticated;

create or replace function public.create_learning_organization(p_kind text,p_name text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare id uuid;
begin
 if (select auth.uid()) is null then raise exception 'Sign in required'; end if;
 if p_kind not in ('family','school','coop') or length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'Invalid organization'; end if;
 insert into public.organizations(kind,name,created_by)
 values(p_kind,trim(p_name),(select auth.uid())) returning organizations.id into id;
 insert into public.memberships(organization_id,user_id,role) values(id,(select auth.uid()),'owner');
 return id;
end $$;
revoke all on function public.create_learning_organization(text,text) from public,anon;
grant execute on function public.create_learning_organization(text,text) to authenticated;

create or replace function public.add_learning_classroom(p_org uuid,p_name text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare id uuid;
begin
 if not private.has_role(p_org,array['owner','school_admin']) then raise exception 'Not authorized'; end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 100 then raise exception 'Invalid name'; end if;
 insert into public.classrooms(organization_id,name) values(p_org,trim(p_name)) returning classrooms.id into id;
 return id;
end $$;
revoke all on function public.add_learning_classroom(uuid,text) from public,anon;
grant execute on function public.add_learning_classroom(uuid,text) to authenticated;

create or replace function public.add_learning_learner(p_org uuid,p_name text,p_classroom uuid default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare id uuid; kind text;
begin
 if not private.has_role(p_org,array['owner','school_admin']) then raise exception 'Not authorized'; end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 50 then raise exception 'Invalid name'; end if;
 if p_classroom is not null and not exists (select 1 from public.classrooms where classrooms.id=p_classroom and organization_id=p_org)
 then raise exception 'Classroom is not in organization'; end if;
 insert into public.learners(organization_id,display_name,classroom_id)
 values(p_org,trim(p_name),p_classroom) returning learners.id into id;
 select organizations.kind into kind from public.organizations where organizations.id=p_org;
 if kind='family' then
   insert into public.learner_guardians(learner_id,user_id) values(id,(select auth.uid()));
 end if;
 return id;
end $$;
revoke all on function public.add_learning_learner(uuid,text,uuid) from public,anon;
grant execute on function public.add_learning_learner(uuid,text,uuid) to authenticated;

-- No generic self-service teacher/admin privilege assignment.
-- Later: implement verified, single-use invitation acceptance with audited server-side RPC.
-- Until then, memberships, classroom_teachers, and learner_guardians for schools
-- are provisioned only by trusted service-side administration with consent and audits.

-- An RPC prevents accidental overwriting of updated records from stale devices.
create or replace function public.save_learning_progress(p_learner uuid,p_payload jsonb,p_expected timestamptz default null)
returns timestamptz language plpgsql security definer set search_path=''
as $$
declare old_timestamp timestamptz; next_timestamp timestamptz;
begin
 if not private.can_edit_learner(p_learner) then raise exception 'Not authorized'; end if;
 if jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>=250000 then raise exception 'Invalid progress'; end if;
 select updated_at into old_timestamp from public.learner_progress where learner_id=p_learner for update;
 if found and (p_expected is null or old_timestamp is distinct from p_expected) then
   raise exception 'Progress changed on another device; reload before saving';
 end if;
 if not found and p_expected is not null then raise exception 'Progress was deleted or moved; reload'; end if;
 next_timestamp:=clock_timestamp();
 insert into public.learner_progress(learner_id,payload,updated_at,updated_by)
 values(p_learner,p_payload,next_timestamp,(select auth.uid()))
 on conflict (learner_id) do update set payload=excluded.payload,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 return next_timestamp;
end $$;
revoke all on function public.save_learning_progress(uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.save_learning_progress(uuid,jsonb,timestamptz) to authenticated;

-- For production, consider removing direct progress insert/update and using only the version-aware RPC.
revoke insert,update,delete on public.learner_progress from authenticated,anon;


-- Invitation-based school membership: one-time, email-bound, expiring.
create table if not exists public.school_invitations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 email text not null,
 role text not null check(role in ('teacher','guardian')),
 classroom_id uuid null references public.classrooms(id) on delete cascade,
 learner_id uuid null references public.learners(id) on delete cascade,
 token_hash text not null unique,
 expires_at timestamptz not null default(now()+interval '7 days'),
 redeemed_at timestamptz,
 redeemed_by uuid references auth.users(id),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 constraint invitation_target check ((role='teacher' and classroom_id is not null and learner_id is null)
 or (role='guardian' and learner_id is not null and classroom_id is null))
);
create index if not exists invitations_org_idx on public.school_invitations(organization_id);
alter table public.school_invitations enable row level security;
-- Invitation rows deliberately have no client SELECT or write policies.
revoke all on public.school_invitations from anon,authenticated;

create or replace function public.create_school_invitation(
 p_org uuid,p_email text,p_role text,p_target uuid)
returns text language plpgsql security definer set search_path=''
as $$
declare token text; norm_email text;
begin
 if not private.has_role(p_org,array['owner','school_admin']) then raise exception 'Not authorized'; end if;
 if not exists(select 1 from public.organizations where id=p_org and kind in ('school','coop'))
 then raise exception 'Invitations are intended for schools and co-ops'; end if;
 norm_email:=lower(trim(p_email));
 if length(norm_email) not between 5 and 254 or norm_email not like '%_@_%._%'
 then raise exception 'Valid email required'; end if;
 if p_role='teacher' then
   if not exists(select 1 from public.classrooms where id=p_target and organization_id=p_org)
   then raise exception 'Unknown school classroom'; end if;
 elsif p_role='guardian' then
   if not exists(select 1 from public.learners where id=p_target and organization_id=p_org)
   then raise exception 'Unknown school learner'; end if;
 else raise exception 'Invalid invitation role'; end if;
 token:=encode(extensions.gen_random_bytes(24),'hex');
 insert into public.school_invitations(organization_id,email,role,classroom_id,learner_id,token_hash,created_by)
 values(p_org,norm_email,p_role,
 case when p_role='teacher' then p_target else null end,
 case when p_role='guardian' then p_target else null end,
 encode(extensions.digest(token,'sha256'),'hex'),(select auth.uid()));
 return token;
end $$;

create or replace function public.redeem_school_invitation(p_token text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare inv public.school_invitations%rowtype; actor_email text; actor_id uuid;
begin
 actor_id:=(select auth.uid());
 if actor_id is null then raise exception 'Sign in required'; end if;
 select lower(email) into actor_email from auth.users
 where id=actor_id and email_confirmed_at is not null;
 if actor_email is null then raise exception 'Confirm your account email first'; end if;
 if length(coalesce(p_token,''))<>48 then raise exception 'Invalid invitation'; end if;
 select * into inv from public.school_invitations
 where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
 and redeemed_at is null and expires_at>now() for update;
 if not found then raise exception 'Invitation expired or already used'; end if;
 if inv.email<>actor_email then raise exception 'Invitation belongs to a different verified email'; end if;
 insert into public.memberships(organization_id,user_id,role)
 values(inv.organization_id,actor_id,inv.role) on conflict do nothing;
 if inv.role='teacher' then
   insert into public.classroom_teachers(classroom_id,user_id)
   values(inv.classroom_id,actor_id) on conflict do nothing;
 else
   insert into public.learner_guardians(learner_id,user_id)
   values(inv.learner_id,actor_id) on conflict do nothing;
 end if;
 update public.school_invitations set redeemed_at=now(),redeemed_by=actor_id where id=inv.id;
 return inv.organization_id;
end $$;
revoke all on function public.create_school_invitation(uuid,text,text,uuid),
 public.redeem_school_invitation(text) from public,anon;
grant execute on function public.create_school_invitation(uuid,text,text,uuid),
 public.redeem_school_invitation(text) to authenticated;
