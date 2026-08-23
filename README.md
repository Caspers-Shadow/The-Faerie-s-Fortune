# The Faerie's Fortune - Setup Guide

This version requires an account to do anything beyond viewing the login
screen - parties, roles, and rolls are all tied to real user accounts now,
so there's no "local only" mode anymore. You'll need a free Supabase
project before the site is usable.

---

## Files in this project

| File                  | What it does                                                     |
|------------------------|-------------------------------------------------------------------|
| `index.html`           | Login / sign-up page - the entry point                           |
| `dashboard.html`       | Lists your parties; create a new one (as DM) or join one (code)  |
| `party.html`           | The dice room for one specific party                             |
| `styles.css`           | All visual styling and themes                                    |
| `dice.js`              | The 3D dice, rolling, table themes, and fantasy backgrounds       |
| `supabase-client.js`   | Shared login/session helpers used by every page                  |
| `login.js`             | Logic for `index.html`                                           |
| `dashboard.js`         | Logic for `dashboard.html`                                       |
| `party-room.js`        | Logic for `party.html` - roster, sessions, and the shared log    |
| `config.js`            | **The one file you edit** - your Supabase project keys go here   |

All ten files need to be uploaded together, kept in the same folder -
pages load the others by filename, not by path.

---

## Part 1 - Create your Supabase project

1. Go to [supabase.com](https://supabase.com), sign up, and create a new
   project (any name/region is fine).
2. **Project Settings → API**, copy the **Project URL** and the **anon
   public** key (not `service_role` - that one must stay secret).
3. Paste them into `config.js`:
   ```js
   const SUPABASE_URL = 'https://your-project-ref.supabase.co';
   const SUPABASE_ANON_KEY = 'your-long-anon-key';
   ```

## Part 2 - Create the database

Open the **SQL Editor** in your Supabase project → **New query**, paste
this whole block in, and click **Run**. It's safe to re-run if you ever
need to start over - the first few lines clear out any earlier attempt.

```sql
drop table if exists log_entries cascade;
drop table if exists sessions cascade;
drop table if exists party_members cascade;
drop table if exists parties cascade;
drop table if exists profiles cascade;
drop function if exists public.handle_new_user cascade;
drop function if exists public.is_party_dm cascade;
drop function if exists public.is_party_member cascade;
drop function if exists public.join_party_by_code cascade;

-- one row per signed-up person
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "Profiles are viewable by any signed-in user"
  on profiles for select using (auth.role() = 'authenticated');
create policy "Users manage their own profile"
  on profiles for update using (auth.uid() = id);
create policy "Users insert their own profile"
  on profiles for insert with check (auth.uid() = id);

-- automatically create a profile when someone signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- a party, run by one Dungeon Master
create table parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  dm_id uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
alter table parties enable row level security;

-- who's in which party, and as what role
create table party_members (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references parties(id) on delete cascade,
  user_id uuid not null references profiles(id),
  role text not null check (role in ('dm', 'player')),
  joined_at timestamptz not null default now(),
  unique (party_id, user_id)
);
alter table party_members enable row level security;

-- Helper functions used by the policies below. A policy on `parties` that
-- directly queried `party_members` (and vice versa) causes Postgres to
-- recurse infinitely, since checking one table's visibility re-triggers
-- the other's. These run with elevated privileges internally, bypassing
-- RLS on the table they check, which breaks that cycle.
create or replace function public.is_party_dm(p_party_id uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from parties where id = p_party_id and dm_id = auth.uid());
$$;
create or replace function public.is_party_member(p_party_id uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from party_members where party_id = p_party_id and user_id = auth.uid());
$$;
grant execute on function public.is_party_dm(uuid) to authenticated;
grant execute on function public.is_party_member(uuid) to authenticated;

create policy "Members can see their own memberships"
  on party_members for select using (
    auth.uid() = user_id or public.is_party_dm(party_id)
  );
create policy "Users can join a party as themselves"
  on party_members for insert with check (auth.uid() = user_id);

-- Looking up a party by invite code has to work for someone who isn't a
-- member yet - but the SELECT policy above only shows parties to existing
-- members/the DM. This function does the lookup-and-join as one guarded
-- step instead of opening up the whole parties table to browsing.
create or replace function public.join_party_by_code(p_code text)
returns table (id uuid, name text)
language plpgsql security definer as $$
declare
  v_party record;
begin
  select p.id, p.name into v_party from parties p where p.invite_code = upper(p_code);
  if v_party.id is null then
    raise exception 'No party found with that code';
  end if;
  insert into party_members (party_id, user_id, role)
  values (v_party.id, auth.uid(), 'player')
  on conflict (party_id, user_id) do nothing;
  return query select v_party.id, v_party.name;
end;
$$;
grant execute on function public.join_party_by_code(text) to authenticated;

create policy "Members can view their parties"
  on parties for select using (
    dm_id = auth.uid() or public.is_party_member(id)
  );
create policy "Any signed-in user can create a party"
  on parties for insert with check (auth.uid() = dm_id);
create policy "DM can update their party"
  on parties for update using (dm_id = auth.uid());

-- a play session within a party
create table sessions (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references parties(id) on delete cascade,
  label text,
  started_at timestamptz not null default now()
);
alter table sessions enable row level security;
create policy "Members can view sessions"
  on sessions for select using (
    public.is_party_dm(party_id) or public.is_party_member(party_id)
  );
create policy "DM can create sessions"
  on sessions for insert with check (public.is_party_dm(party_id));

-- rolls, notes, and session dividers, all in one shared log
create table log_entries (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references parties(id) on delete cascade,
  session_id uuid references sessions(id) on delete set null,
  user_id uuid references profiles(id),
  type text not null check (type in ('roll', 'note', 'session')),
  die text,
  display text,
  crit boolean default false,
  fail boolean default false,
  note_text text,
  created_at timestamptz not null default now()
);
alter table log_entries enable row level security;
create policy "Members can view log entries"
  on log_entries for select using (
    public.is_party_dm(party_id) or public.is_party_member(party_id)
  );
create policy "Members can add log entries"
  on log_entries for insert with check (
    user_id = auth.uid() and (public.is_party_dm(party_id) or public.is_party_member(party_id))
  );
```

This creates five tables and turns on row-level security everywhere, so
the database itself, not just the site's code, enforces who can see what.
Only party members can read or add rolls and notes for that party.

### Recommended: turn off email confirmation while testing
**Authentication → Providers → Email**, toggle off **"Confirm email"** so
new accounts can log in immediately. Turn it back on before sharing the
site publicly.

---

## Part 3 - Publish with GitHub Pages

1. Create a free GitHub account at [github.com](https://github.com) if
   you don't have one.
2. **+** (top right) → **New repository**. Public, no README.
3. **Add file → Upload files**, drag in **all ten files** listed at the
   top of this guide, keeping them all at the top level of the repo (not
   inside a subfolder). Commit to `main`.
4. **Settings → Pages** → Source: "Deploy from a branch" → branch `main`,
   folder `/ (root)` → **Save**.
5. Wait about a minute, refresh that settings page, and your live URL
   will appear. Visitors land on `index.html` (the login page)
   automatically.

---

---

## Part 4 - Optional: real email delivery for launch (custom SMTP)

Skip this section entirely while you're testing solo - with **"Confirm
email" off** (Part 2), no emails get sent at all, so there's nothing to
rate-limit. This section only matters once you turn confirmation back on
so real players' accounts get verified.

**The built-in Supabase mailer only delivers to your own Supabase
account/team, capped at 2 emails/hour.** That's fine for kicking the
tires but not for anyone else signing up. Fixing it means connecting your
own SMTP sender - and every real provider (Mailtrap, Resend, SendGrid,
Postmark, etc.) requires you to **verify a domain you own** first. That's
a spam-prevention measure, not something any provider can skip. If you
don't have a domain yet, get one (any registrar) before starting this.

Using **Mailtrap** (has a native one-click Supabase integration, free
tier of 150 emails/hour / 4,000/month):

1. Create a free account at [mailtrap.io](https://mailtrap.io).
2. In Mailtrap, go to **Integrations**, find **Supabase**, click
   **Integrate** → **Connect Supabase**, and authorize it to access your
   Supabase organization/project.
3. In Mailtrap, verify a **Sending Domain** - this means adding a couple
   of DNS records (SPF/DKIM) at whichever registrar your domain is with.
   Mailtrap shows you exactly which records to add.
4. Back in the integration flow, enter your sender name and sender email
   (using your verified domain), then click **Configure SMTP**. Mailtrap
   pushes the SMTP host/port/username/password into your Supabase
   project automatically - double check under **Authentication → Emails
   → SMTP Settings** in Supabase, where **Enable Custom SMTP** should
   now be on.
5. Turn **Confirm email** back on (Part 2) now that real delivery works,
   and do one test signup to confirm the email actually arrives.

If you'd rather not use Mailtrap specifically, the same idea applies to
any SMTP provider: verify a domain with them, get host/port/username/
password, and paste those into Supabase's SMTP Settings by hand instead
of using an automatic integration.

---

---

## How the roles work

- **Creating** a party makes you its **Dungeon Master** - only the DM can
  start new sessions, and the invite code is shown on the party page for
  the DM to share.
- **Joining** a party with an invite code makes you a **Player**.
- Anyone in the party - DM or player - can roll dice and add notes; both
  land in the same shared log, attributed to whoever's account did them.
- A person can belong to any number of parties, as DM of some and a
  player in others, and the dashboard lists all of them.

## What's not in yet
Rolls and notes save immediately, but if two people have the party page
open at the same time, they won't see each other's entries appear live -
use the **Refresh** button next to the log. Real-time sync is a
reasonable next step if that matters for how you play.

---
