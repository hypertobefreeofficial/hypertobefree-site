-- HTBF Current Production Baseline
-- Squashed migration history — 2026-08-16
-- Reproduces production public schema + HTBF storage config immediately BEFORE
-- Journey Private Media Phase 1 (20260816183100).
--
-- DO NOT run against existing production. Repair-mark applied only on production.
-- DO NOT replay archived July migrations on top of this baseline.
--
-- Sources:
--   supabase/production_public_schema.sql (schema-only public dump)
--   live production storage bucket/policy introspection (2026-08-16)
--   live production auth.users trigger introspection (2026-08-16)
--
-- Intentionally excluded:
--   journey-private-media bucket (Phase 1)
--   prayer_hidden_stories (not in production)
--   protect_prayer_video_response_audit_fields trigger (not in production)
--   mark_my_prayer_answered RPC/trigger (not in production)
--   production data, auth users, storage objects, grants/owners

BEGIN;

-- Name: public; Type: SCHEMA; Schema: -; Owner: -






-- Name: admin_dismiss_content_report(uuid); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.admin_dismiss_content_report(report_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if (auth.jwt() ->> 'email') <> 'hypertobefree@gmail.com' then
    raise exception 'Not authorized';
  end if;

  update public.content_reports
  set
    status = 'dismissed',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    admin_notes = coalesce(admin_notes, 'Report dismissed by admin.')
  where id = report_id;
end;
$$;


-- Name: admin_mark_report_reviewing(uuid); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.admin_mark_report_reviewing(report_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if (auth.jwt() ->> 'email') <> 'hypertobefree@gmail.com' then
    raise exception 'Not authorized';
  end if;

  update public.content_reports
  set
    status = 'reviewing',
    reviewed_by = auth.uid(),
    admin_notes = coalesce(admin_notes, 'Report marked as reviewing by admin.')
  where id = report_id;
end;
$$;


-- Name: admin_remove_reported_story(uuid); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.admin_remove_reported_story(report_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  target_story_id uuid;
begin
  if (auth.jwt() ->> 'email') <> 'hypertobefree@gmail.com' then
    raise exception 'Not authorized';
  end if;

  select story_id
  into target_story_id
  from public.content_reports
  where id = report_id;

  if target_story_id is null then
    raise exception 'Report not found';
  end if;

  update public.stories
  set status = 'removed'
  where id = target_story_id;

  update public.content_reports
  set
    status = 'action_taken',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    admin_notes = coalesce(admin_notes, 'Reported content removed by admin.')
  where id = report_id;
end;
$$;


-- Name: assert_target_not_owner(uuid, text); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.assert_target_not_owner(target_user_id uuid, action text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if target_user_id is null then
    raise exception 'Target user ID is required'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.profiles
    where id = target_user_id
      and is_owner = true
  ) then
    raise exception 'Owner accounts cannot be %', coalesce(action, 'modified')
      using errcode = '42501';
  end if;
end;
$$;


-- Name: create_welcome_inbox_message(); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.create_welcome_inbox_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.inbox_messages (
    user_id,
    title,
    body
  )
  values (
    new.id,
    'Welcome to Hyper to Be Free',
    'Welcome to Hyper to Be Free.

We created this platform to be a place for faith, testimony, prayer, encouragement, healing, and honest connection.

Here’s what you can do here:

• Share your testimony through video or written posts
• Ask for prayer and encourage others
• React to stories and connect with the community
• Share moments of healing, growth, faith, and hope
• Support others through encouragement and kindness

Please help protect the spirit of this community:

• Be encouraging and respectful
• Do not harass, shame, or attack others
• Only upload content you own or have permission to share
• Report harmful or inappropriate content when necessary

This platform is still growing, and we are thankful you are part of the journey from the beginning.

Thank you for being here.

— The Hyper to Be Free Team'
  );

  return new;
end;
$$;


-- Name: current_user_is_admin(); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.current_user_is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (is_owner = true or is_admin = true)
  );
$$;


-- Name: current_user_is_owner(); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.current_user_is_owner() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_owner = true
  );
$$;


-- Name: edit_my_story(uuid, text); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.edit_my_story(story_id uuid, new_story_text text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.stories
  set
    story_text = nullif(trim(new_story_text), ''),
    edited_at = now()
  where id = story_id
    and user_id = auth.uid()
    and status in ('pending', 'submitted', 'approved');
end;
$$;


-- Name: enforce_username_safety(); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.enforce_username_safety() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  duplicate_exists boolean;
  next_change_at timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.username is null then
      new.username_changed_at := null;
      return new;
    end if;

    if new.username !~ '^[a-z0-9_]{3,24}$' then
      raise exception
        'Username must contain only lowercase letters, numbers, or underscores and must be 3 to 24 characters long.'
        using errcode = '23514';
    end if;

    if public.is_reserved_username(new.username)
       and not new.is_owner
       and not new.can_use_reserved_username then
      raise exception
        'That username is reserved for HTBF or approved official accounts.'
        using errcode = '23514';
    end if;

    select exists (
      select 1
      from public.profiles p
      where lower(p.username) = lower(new.username)
        and p.id <> new.id
    )
    into duplicate_exists;

    if duplicate_exists then
      raise exception
        'That username is already taken. Please choose another username.'
        using errcode = '23505';
    end if;

    new.username_changed_at := now();
    return new;
  end if;

  if new.username is not distinct from old.username then
    new.username_changed_at := old.username_changed_at;
    return new;
  end if;

  if old.username is not null and new.username is null then
    raise exception
      'An established username cannot be removed. Please choose a replacement username.'
      using errcode = '23514';
  end if;

  if new.username !~ '^[a-z0-9_]{3,24}$' then
    raise exception
      'Username must contain only lowercase letters, numbers, or underscores and must be 3 to 24 characters long.'
      using errcode = '23514';
  end if;

  if public.is_reserved_username(new.username)
     and not new.is_owner
     and not new.can_use_reserved_username then
    raise exception
      'That username is reserved for HTBF or approved official accounts.'
      using errcode = '23514';
  end if;

  if old.username is not null
     and old.username_changed_at is not null
     and old.username_changed_at > now() - interval '30 days' then
    next_change_at := old.username_changed_at + interval '30 days';

    raise exception
      'Username changes are limited to once every 30 days. You can change it again after %.',
      to_char(
        next_change_at at time zone 'UTC',
        'YYYY-MM-DD HH24:MI UTC'
      )
      using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.profiles p
    where lower(p.username) = lower(new.username)
      and p.id <> new.id
  )
  into duplicate_exists;

  if duplicate_exists then
    raise exception
      'That username is already taken. Please choose another username.'
      using errcode = '23505';
  end if;

  new.username_changed_at := now();

  return new;
end;
$_$;


-- Name: handle_new_user_profile(); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.handle_new_user_profile() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    username,
    location,
    age_confirmed,
    terms_accepted_at,
    privacy_accepted_at,
    guidelines_accepted_at,
    profile_status,
    role,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'username', ''),
    nullif(new.raw_user_meta_data ->> 'location', ''),
    coalesce((new.raw_user_meta_data ->> 'age_confirmed')::boolean, false),
    coalesce((new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz, now()),
    coalesce((new.raw_user_meta_data ->> 'privacy_accepted_at')::timestamptz, now()),
    coalesce((new.raw_user_meta_data ->> 'guidelines_accepted_at')::timestamptz, now()),
    'active',
    'user',
    now(),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, profiles.display_name),
    username = coalesce(excluded.username, profiles.username),
    location = coalesce(excluded.location, profiles.location),
    age_confirmed = coalesce(excluded.age_confirmed, profiles.age_confirmed),
    terms_accepted_at = coalesce(profiles.terms_accepted_at, excluded.terms_accepted_at),
    privacy_accepted_at = coalesce(profiles.privacy_accepted_at, excluded.privacy_accepted_at),
    guidelines_accepted_at = coalesce(profiles.guidelines_accepted_at, excluded.guidelines_accepted_at),
    profile_status = coalesce(profiles.profile_status, 'active'),
    role = coalesce(profiles.role, 'user'),
    updated_at = now();

  return new;
end;
$$;


-- Name: hide_prayer_video_response(uuid); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.hide_prayer_video_response(response_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.prayer_video_responses as response
  set hidden_at = now()
  where response.id = response_id
    and exists (
      select 1
      from public.stories
      where stories.id = response.story_id
        and stories.user_id = auth.uid()
    );

  if not found then
    raise exception 'Prayer video response not found or prayer not owned by user';
  end if;
end;
$$;


-- Name: is_reserved_username(text); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.is_reserved_username(candidate text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  compact text;
  reserved_terms constant text[] := array[
    'htbf',
    'hypertobefree',
    'hyper2befree',
    'admin',
    'support',
    'moderator',
    'official',
    'team',
    'prayerteam',
    'staff'
  ];
begin
  compact := regexp_replace(
    lower(coalesce(candidate, '')),
    '[^a-z0-9]',
    '',
    'g'
  );

  return exists (
    select 1
    from unnest(reserved_terms) as reserved_term
    where strpos(compact, reserved_term) > 0
  );
end;
$$;


-- Name: list_prayer_video_responses_for_admin(); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.list_prayer_video_responses_for_admin() RETURNS TABLE(response_id uuid, story_id uuid, response_user_id uuid, video_url text, body text, status text, created_at timestamp with time zone, moderated_at timestamp with time zone, moderated_by uuid, hidden_at timestamp with time zone, removed_at timestamp with time zone, prayer_text text, prayer_owner_user_id uuid, prayer_owner_name text, prayer_owner_display_name text, prayer_owner_username text, prayer_owner_avatar_url text, response_author_display_name text, response_author_username text, response_author_avatar_url text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid() is null
     or lower(coalesce(auth.jwt() ->> 'email', ''))
        <> 'hypertobefree@gmail.com'
  then
    raise exception 'Admin access required'
      using errcode = '42501';
  end if;

  return query
  select
    response.id as response_id,
    response.story_id,
    response.user_id as response_user_id,
    response.video_url,
    response.body,
    response.status,
    response.created_at,
    response.moderated_at,
    response.moderated_by,
    response.hidden_at,
    response.removed_at,
    prayer.story_text as prayer_text,
    prayer.user_id as prayer_owner_user_id,
    prayer.name as prayer_owner_name,
    owner_profile.display_name as prayer_owner_display_name,
    owner_profile.username as prayer_owner_username,
    owner_profile.avatar_url as prayer_owner_avatar_url,
    author_profile.display_name as response_author_display_name,
    author_profile.username as response_author_username,
    author_profile.avatar_url as response_author_avatar_url
  from public.prayer_video_responses as response
  join public.stories as prayer
    on prayer.id = response.story_id
  left join public.profiles as owner_profile
    on owner_profile.id = prayer.user_id
  left join public.profiles as author_profile
    on author_profile.id = response.user_id
  where response.status in (
    'submitted',
    'approved',
    'rejected',
    'removed'
  )
  order by response.created_at desc;
end;
$$;


-- Name: moderate_prayer_video_response(uuid, text); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.moderate_prayer_video_response(response_id uuid, next_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid() is null
     or lower(coalesce(auth.jwt() ->> 'email', ''))
        <> 'hypertobefree@gmail.com'
  then
    raise exception 'Admin access required'
      using errcode = '42501';
  end if;

  if next_status not in ('approved', 'rejected', 'removed') then
    raise exception 'Invalid moderation status'
      using errcode = '22023';
  end if;

  update public.prayer_video_responses
  set
    status = next_status,
    moderated_at = now(),
    moderated_by = auth.uid(),
    removed_at = case
      when next_status = 'removed' then now()
      else null
    end
  where id = response_id;

  if not found then
    raise exception 'Prayer video response not found'
      using errcode = 'P0002';
  end if;
end;
$$;


-- Name: protect_profile_roles(); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.protect_profile_roles() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  actor_user_id uuid := auth.uid();
  actor_is_owner boolean;
  owner_count bigint;
  owner_changed boolean;
  admin_changed boolean;
begin
  if tg_op = 'DELETE' then
    if old.is_owner then
      raise exception 'Owner profiles cannot be deleted'
        using errcode = '42501';
    end if;

    return old;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.is_owner, false)
       or coalesce(new.is_admin, false) then
      raise exception 'Role access must be granted through an owner RPC'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if old.is_owner and (
    (to_jsonb(new) -> 'is_suspended')
      is distinct from (to_jsonb(old) -> 'is_suspended')
    or
    (to_jsonb(new) -> 'suspended_at')
      is distinct from (to_jsonb(old) -> 'suspended_at')
    or
    (to_jsonb(new) -> 'account_status')
      is distinct from (to_jsonb(old) -> 'account_status')
  ) then
    raise exception 'Owner accounts cannot be suspended'
      using errcode = '42501';
  end if;

  owner_changed := new.is_owner is distinct from old.is_owner;
  admin_changed := new.is_admin is distinct from old.is_admin;

  if not owner_changed and not admin_changed then
    return new;
  end if;

  actor_is_owner := public.current_user_is_owner();

  if actor_user_id is null or not actor_is_owner then
    raise exception 'Only an owner can change owner or admin access'
      using errcode = '42501';
  end if;

  if owner_changed then
    perform pg_advisory_xact_lock(
      hashtext('htbf_owner_role_change')::bigint
    );

    if old.is_owner and not new.is_owner then
      if old.id = actor_user_id then
        raise exception 'Owners cannot revoke their own owner role'
          using errcode = '42501';
      end if;

      select count(*)
      into owner_count
      from public.profiles
      where is_owner = true;

      if owner_count <= 1 then
        raise exception 'The final remaining owner cannot be revoked'
          using errcode = '42501';
      end if;

      new.is_admin := true;
    elsif not old.is_owner and new.is_owner then
      new.is_admin := true;
    end if;
  end if;

  if new.is_owner and not new.is_admin then
    raise exception 'Owners must retain admin access'
      using errcode = '42501';
  end if;

  admin_changed := new.is_admin is distinct from old.is_admin;

  if owner_changed then
    insert into public.admin_action_logs (
      actor_user_id,
      action,
      target_user_id,
      target_type,
      metadata
    )
    values (
      actor_user_id,
      case when new.is_owner then 'grant_owner' else 'revoke_owner' end,
      new.id,
      'profile_role',
      jsonb_build_object(
        'previous_is_owner', old.is_owner,
        'is_owner', new.is_owner,
        'previous_is_admin', old.is_admin,
        'is_admin', new.is_admin
      )
    );
  end if;

  if admin_changed then
    insert into public.admin_action_logs (
      actor_user_id,
      action,
      target_user_id,
      target_type,
      metadata
    )
    values (
      actor_user_id,
      case when new.is_admin then 'grant_admin' else 'revoke_admin' end,
      new.id,
      'profile_role',
      jsonb_build_object(
        'previous_is_owner', old.is_owner,
        'is_owner', new.is_owner,
        'previous_is_admin', old.is_admin,
        'is_admin', new.is_admin
      )
    );
  end if;

  return new;
end;
$$;


-- Name: protect_reserved_username_access(); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.protect_reserved_username_access() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  actor_user_id uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.can_use_reserved_username
       and (
         actor_user_id is null
         or not public.current_user_is_owner()
       ) then
      raise exception
        'Only an owner can grant reserved username access.'
        using errcode = '42501';
    end if;

    if new.username is not null
       and public.is_reserved_username(new.username)
       and not new.is_owner
       and not new.can_use_reserved_username then
      raise exception
        'That username is reserved for HTBF or approved official accounts.'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if new.can_use_reserved_username
     is distinct from old.can_use_reserved_username then
    if actor_user_id is null
       or not public.current_user_is_owner() then
      raise exception
        'Only an owner can grant or revoke reserved username access.'
        using errcode = '42501';
    end if;

    if not new.can_use_reserved_username
       and not new.is_owner
       and new.username is not null
       and public.is_reserved_username(new.username) then
      raise exception
        'Reserved username access cannot be revoked until the profile chooses a non-reserved username.'
        using errcode = '23514';
    end if;

    insert into public.admin_action_logs (
      actor_user_id,
      action,
      target_user_id,
      target_type,
      metadata
    )
    values (
      actor_user_id,
      case
        when new.can_use_reserved_username
          then 'grant_reserved_username_access'
        else 'revoke_reserved_username_access'
      end,
      new.id,
      'profile_role',
      jsonb_build_object(
        'previous_can_use_reserved_username',
        old.can_use_reserved_username,
        'can_use_reserved_username',
        new.can_use_reserved_username,
        'username',
        new.username
      )
    );
  end if;

  if new.username is not null
     and public.is_reserved_username(new.username)
     and not new.is_owner
     and not new.can_use_reserved_username then
    raise exception
      'That username is reserved for HTBF or approved official accounts.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;


-- Name: remove_my_prayer_video_response(uuid); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.remove_my_prayer_video_response(response_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.prayer_video_responses
  set
    status = 'removed',
    removed_at = now()
  where id = response_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Prayer video response not found or not owned by user';
  end if;
end;
$$;


-- Name: remove_my_story(uuid); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.remove_my_story(story_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.stories
  set
    status = 'removed',
    removed_at = now(),
    removed_by = auth.uid()
  where id = story_id
    and user_id = auth.uid();
end;
$$;


-- Name: remove_my_video_story(uuid); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.remove_my_video_story(story_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.stories
  set
    status = 'removed',
    removed_at = now(),
    removed_by = auth.uid()
  where id = story_id
    and user_id = auth.uid()
    and video_url is not null;
end;
$$;


-- Name: set_admin_access(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.set_admin_access(target_user_id uuid, grant_admin boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid() is null or not public.current_user_is_owner() then
    raise exception 'Only an owner can grant or revoke admin access'
      using errcode = '42501';
  end if;

  if target_user_id is null or grant_admin is null then
    raise exception 'Target user and admin decision are required'
      using errcode = '22023';
  end if;

  if not grant_admin and exists (
    select 1
    from public.profiles
    where id = target_user_id
      and is_owner = true
  ) then
    raise exception 'Admin access cannot be revoked from an owner'
      using errcode = '42501';
  end if;

  update public.profiles
  set is_admin = grant_admin
  where id = target_user_id;

  if not found then
    raise exception 'Target profile was not found'
      using errcode = 'P0002';
  end if;
end;
$$;


-- Name: set_owner_access(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.set_owner_access(target_user_id uuid, grant_owner boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid() is null or not public.current_user_is_owner() then
    raise exception 'Only an owner can grant or revoke owner access'
      using errcode = '42501';
  end if;

  if target_user_id is null or grant_owner is null then
    raise exception 'Target user and owner decision are required'
      using errcode = '22023';
  end if;

  if not grant_owner and target_user_id = auth.uid() then
    raise exception 'Owners cannot revoke their own owner role'
      using errcode = '42501';
  end if;

  update public.profiles
  set is_owner = grant_owner
  where id = target_user_id;

  if not found then
    raise exception 'Target profile was not found'
      using errcode = 'P0002';
  end if;
end;
$$;


-- Name: set_prayer_written_response_timestamps(); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.set_prayer_written_response_timestamps() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.updated_at := now();

  IF NEW.status IN ('hidden', 'removed')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.hidden_at := coalesce(NEW.hidden_at, now());
  ELSIF NEW.status = 'visible' THEN
    NEW.hidden_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;


-- Name: set_reserved_username_access(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.set_reserved_username_access(target_user_id uuid, grant_access boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid() is null
     or not public.current_user_is_owner() then
    raise exception
      'Only an owner can grant or revoke reserved username access.'
      using errcode = '42501';
  end if;

  if target_user_id is null or grant_access is null then
    raise exception
      'Target user and access decision are required.'
      using errcode = '22023';
  end if;

  update public.profiles
  set can_use_reserved_username = grant_access
  where id = target_user_id;

  if not found then
    raise exception
      'Target profile was not found.'
      using errcode = 'P0002';
  end if;
end;
$$;


-- Name: submit_prayer_video_response(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.submit_prayer_video_response(prayer_story_id uuid, response_video_url text, response_body text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    SET row_security TO 'off'
    AS $$
declare
  current_user_id uuid;
  clean_video_url text;
  parent_status text;
  parent_story_type text;
  parent_user_id uuid;
  inserted_response_id uuid;
begin
  current_user_id := auth.uid();
  clean_video_url := nullif(btrim(response_video_url), '');

  if current_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if clean_video_url is null then
    raise exception 'Response video URL is required'
      using errcode = '22023';
  end if;

  select
    stories.status,
    stories.story_type,
    stories.user_id
  into
    parent_status,
    parent_story_type,
    parent_user_id
  from public.stories
  where stories.id = prayer_story_id;

  if not found then
    raise exception 'Prayer story not found'
      using errcode = 'P0002';
  end if;

  if parent_status is distinct from 'approved' then
    raise exception 'Prayer story must be approved'
      using errcode = '22023';
  end if;

  if lower(coalesce(parent_story_type, '')) not like '%prayer%' then
    raise exception 'Story is not a prayer request'
      using errcode = '22023';
  end if;

  if parent_user_id is not distinct from current_user_id then
    raise exception 'Users cannot respond to their own prayer request'
      using errcode = '42501';
  end if;

  insert into public.prayer_video_responses (
    story_id,
    user_id,
    video_url,
    body,
    status
  )
  values (
    prayer_story_id,
    current_user_id,
    clean_video_url,
    nullif(btrim(response_body), ''),
    'submitted'
  )
  returning id into inserted_response_id;

  return inserted_response_id;
end;
$$;


-- Name: touch_prayer_video_responses_updated_at(); Type: FUNCTION; Schema: public; Owner: -

CREATE OR REPLACE FUNCTION public.touch_prayer_video_responses_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;




-- Name: account_deletion_requests; Type: TABLE; Schema: public; Owner: -

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text,
    reason text,
    status text DEFAULT 'submitted'::text NOT NULL,
    admin_notes text,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


-- Name: admin_action_logs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE IF NOT EXISTS public.admin_action_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid,
    action text NOT NULL,
    target_user_id uuid,
    target_type text DEFAULT 'user'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


-- Name: blocked_users; Type: TABLE; Schema: public; Owner: -

CREATE TABLE IF NOT EXISTS public.blocked_users (
    blocker_user_id uuid NOT NULL,
    blocked_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT blocked_users_no_self_block CHECK ((blocker_user_id <> blocked_user_id))
);


-- Name: content_reports; Type: TABLE; Schema: public; Owner: -

CREATE TABLE IF NOT EXISTS public.content_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_id uuid,
    reporter_user_id uuid,
    reported_user_id uuid,
    reason text NOT NULL,
    details text,
    status text DEFAULT 'open'::text NOT NULL,
    admin_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    prayer_video_response_id uuid,
    CONSTRAINT content_reports_reason_check CHECK ((reason = ANY (ARRAY['spam'::text, 'harassment'::text, 'hate'::text, 'violence'::text, 'sexual'::text, 'self_harm'::text, 'misinformation'::text, 'copyright'::text, 'other'::text, 'bug'::text, 'inappropriate'::text, 'abuse'::text, 'technical_issue'::text]))),
    CONSTRAINT content_reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'reviewing'::text, 'dismissed'::text, 'action_taken'::text])))
);


-- Name: inbox_messages; Type: TABLE; Schema: public; Owner: -

CREATE TABLE IF NOT EXISTS public.inbox_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sender_user_id uuid,
    message_type text,
    story_id uuid,
    prayer_request_id uuid,
    video_url text,
    image_url text,
    action_url text,
    hidden_at timestamp with time zone,
    category text,
    thread_id text,
    parent_message_id uuid,
    prayer_update_id uuid
);


-- Name: prayer_follows; Type: TABLE; Schema: public; Owner: -

CREATE TABLE IF NOT EXISTS public.prayer_follows (
    user_id uuid NOT NULL,
    story_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


-- Name: prayer_search_preferences; Type: TABLE; Schema: public; Owner: -

CREATE TABLE IF NOT EXISTS public.prayer_search_preferences (
    user_id uuid NOT NULL,
    preferences jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


-- Name: prayer_updates; Type: TABLE; Schema: public; Owner: -

CREATE TABLE IF NOT EXISTS public.prayer_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_id uuid NOT NULL,
    author_user_id uuid NOT NULL,
    body text NOT NULL,
    update_type text DEFAULT 'update'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    edited_at timestamp with time zone,
    hidden_at timestamp with time zone,
    CONSTRAINT prayer_updates_update_type_check CHECK ((update_type = ANY (ARRAY['update'::text, 'answered'::text, 'praise'::text])))
);


-- Name: prayer_video_responses; Type: TABLE; Schema: public; Owner: -

CREATE TABLE IF NOT EXISTS public.prayer_video_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_id uuid NOT NULL,
    user_id uuid NOT NULL,
    video_url text NOT NULL,
    body text,
    status text DEFAULT 'submitted'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    moderated_at timestamp with time zone,
    moderated_by uuid,
    hidden_at timestamp with time zone,
    removed_at timestamp with time zone,
    thumbnail_url text,
    response_context text,
    ai_review_status text,
    ai_risk_level text,
    ai_suggested_action text,
    ai_summary text,
    ai_flags jsonb,
    duration_verification_status text DEFAULT 'unavailable'::text NOT NULL,
    duration_seconds numeric(8,2),
    duration_verified_at timestamp with time zone,
    removed_by_user_id uuid,
    removal_source text,
    removal_reason text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT prayer_video_responses_duration_verification_status_check CHECK ((duration_verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'failed'::text, 'unavailable'::text]))),
    CONSTRAINT prayer_video_responses_removal_source_check CHECK (((removal_source IS NULL) OR (removal_source = ANY (ARRAY['prayer_owner'::text, 'response_author'::text, 'moderator'::text, 'administrator'::text])))),
    CONSTRAINT prayer_video_responses_response_context_check CHECK (((response_context IS NULL) OR (response_context = ANY (ARRAY['feed_post'::text, 'prayer_request'::text, 'video_post'::text])))),
    CONSTRAINT prayer_video_responses_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text, 'removed'::text]))),
    CONSTRAINT prayer_video_responses_video_url_check CHECK ((length(btrim(video_url)) > 0))
);


-- Name: prayer_written_responses; Type: TABLE; Schema: public; Owner: -

CREATE TABLE IF NOT EXISTS public.prayer_written_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_id uuid NOT NULL,
    author_user_id uuid NOT NULL,
    body text NOT NULL,
    status text DEFAULT 'visible'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    hidden_at timestamp with time zone,
    CONSTRAINT prayer_written_responses_body_check CHECK (((char_length(TRIM(BOTH FROM body)) >= 1) AND (char_length(TRIM(BOTH FROM body)) <= 2000))),
    CONSTRAINT prayer_written_responses_status_check CHECK ((status = ANY (ARRAY['visible'::text, 'hidden'::text, 'removed'::text])))
);


-- Name: profiles; Type: TABLE; Schema: public; Owner: -

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    display_name text,
    location text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    username text,
    bio text,
    age_confirmed boolean DEFAULT false,
    terms_accepted_at timestamp with time zone,
    privacy_accepted_at timestamp with time zone,
    guidelines_accepted_at timestamp with time zone,
    profile_status text DEFAULT 'active'::text,
    role text DEFAULT 'user'::text,
    deletion_requested_at timestamp with time zone,
    status text DEFAULT 'active'::text,
    profile_visibility text DEFAULT 'public'::text,
    allow_prayer_notifications boolean DEFAULT true,
    allow_story_notifications boolean DEFAULT true,
    show_location boolean DEFAULT true,
    show_real_name boolean DEFAULT false,
    journey_focus text DEFAULT 'encouragement'::text,
    real_name text,
    avatar_url text,
    profile_completed boolean DEFAULT false,
    username_last_changed_at timestamp with time zone,
    notify_replies boolean DEFAULT true NOT NULL,
    notify_prayers boolean DEFAULT true NOT NULL,
    notify_praise boolean DEFAULT true NOT NULL,
    notify_journey_updates boolean DEFAULT true NOT NULL,
    notify_email_updates boolean DEFAULT false NOT NULL,
    allow_video_responses boolean DEFAULT true NOT NULL,
    allow_prayer_messages boolean DEFAULT true NOT NULL,
    allow_journey_messages boolean DEFAULT true NOT NULL,
    is_owner boolean DEFAULT false NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    username_changed_at timestamp with time zone,
    can_use_reserved_username boolean DEFAULT false NOT NULL,
    CONSTRAINT profiles_profile_visibility_check CHECK ((profile_visibility = ANY (ARRAY['public'::text, 'community'::text, 'private'::text]))),
    CONSTRAINT profiles_username_format_check CHECK (((username IS NULL) OR (username ~ '^[a-z0-9_]{3,24}$'::text)))
);


-- Name: saved_content; Type: TABLE; Schema: public; Owner: -

CREATE TABLE IF NOT EXISTS public.saved_content (
    user_id uuid NOT NULL,
    story_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


-- Name: stories; Type: TABLE; Schema: public; Owner: -

CREATE TABLE IF NOT EXISTS public.stories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text,
    email text,
    location text,
    story_type text,
    video_url text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    story_text text,
    prayer_status text DEFAULT 'active'::text,
    answered_at timestamp with time zone,
    answered_text text,
    thumbnail_url text,
    text_size text,
    text_style text,
    text_position text,
    text_background text,
    removed_at timestamp with time zone,
    removed_by uuid,
    edited_at timestamp with time zone,
    ai_review_status text,
    ai_reviewed_at timestamp with time zone,
    ai_risk_level text,
    ai_suggested_action text,
    ai_flags text[] DEFAULT '{}'::text[],
    ai_summary text,
    image_url text,
    caption_style text,
    overlay_text text,
    overlay_x numeric,
    overlay_y numeric,
    caption_color text,
    caption_size text,
    caption_align text,
    caption_font text,
    caption_background text,
    caption_template text,
    video_template text,
    htbf_watermark_enabled boolean DEFAULT true,
    silhouette_watermark_enabled boolean DEFAULT false,
    shared_htbf_intro_enabled boolean DEFAULT false,
    content_type text,
    topics text[] DEFAULT '{}'::text[] NOT NULL,
    creation_mode text DEFAULT 'quick'::text NOT NULL,
    ai_suggestions jsonb DEFAULT '{}'::jsonb NOT NULL,
    faith_streams text[] DEFAULT '{}'::text[] NOT NULL,
    public_lat numeric(5,2),
    public_lng numeric(5,2),
    public_location_label text,
    location_visibility text,
    CONSTRAINT stories_ai_review_status_check CHECK (((ai_review_status IS NULL) OR (ai_review_status = ANY (ARRAY['completed'::text, 'failed'::text])))),
    CONSTRAINT stories_ai_risk_level_check CHECK (((ai_risk_level IS NULL) OR (ai_risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))),
    CONSTRAINT stories_ai_suggested_action_check CHECK (((ai_suggested_action IS NULL) OR (ai_suggested_action = ANY (ARRAY['approve'::text, 'review'::text, 'reject'::text])))),
    CONSTRAINT stories_location_none_is_private_chk CHECK (((location_visibility IS DISTINCT FROM 'none'::text) OR ((public_lat IS NULL) AND (public_lng IS NULL) AND (public_location_label IS NULL)))),
    CONSTRAINT stories_location_visibility_chk CHECK (((location_visibility IS NULL) OR (location_visibility = ANY (ARRAY['none'::text, 'country'::text, 'state'::text, 'city'::text, 'approximate'::text, 'map-place'::text])))),
    CONSTRAINT stories_prayer_status_check CHECK ((prayer_status = ANY (ARRAY['active'::text, 'answered'::text]))),
    CONSTRAINT stories_public_coordinate_pair_chk CHECK (((public_lat IS NULL) = (public_lng IS NULL))),
    CONSTRAINT stories_public_lat_range_chk CHECK (((public_lat IS NULL) OR ((public_lat >= ('-90'::integer)::numeric) AND (public_lat <= (90)::numeric)))),
    CONSTRAINT stories_public_lng_range_chk CHECK (((public_lng IS NULL) OR ((public_lng >= ('-180'::integer)::numeric) AND (public_lng <= (180)::numeric)))),
    CONSTRAINT stories_public_location_label_length_chk CHECK (((public_location_label IS NULL) OR (char_length(public_location_label) <= 160))),
    CONSTRAINT stories_video_template_check CHECK (((video_template IS NULL) OR (video_template = ANY (ARRAY['none'::text, 'htbf-logo'::text, 'freedom-silhouette'::text, 'shared-through-htbf'::text, 'freedom-story'::text, 'prayer-moment'::text, 'praise-report'::text, 'god-did-it'::text]))))
);


-- Name: COLUMN stories.public_lat; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.stories.public_lat IS 'Application-adjusted approximate latitude for prayer radius search; never exact residential GPS.';


-- Name: COLUMN stories.public_lng; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.stories.public_lng IS 'Application-adjusted approximate longitude for prayer radius search; never exact residential GPS.';


-- Name: COLUMN stories.public_location_label; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.stories.public_location_label IS 'Public-facing approximate location label such as city, region, or country.';


-- Name: COLUMN stories.location_visibility; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.stories.location_visibility IS 'Poster-selected public location granularity.';


-- Name: story_reactions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE IF NOT EXISTS public.story_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reaction_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT story_reactions_reaction_type_check CHECK ((reaction_type = ANY (ARRAY['amen'::text, 'praise_god'::text, 'encouraged'::text, 'praying'::text])))
);


-- Name: story_video_replies; Type: TABLE; Schema: public; Owner: -

CREATE TABLE IF NOT EXISTS public.story_video_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_id uuid NOT NULL,
    user_id uuid NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recipient_user_id uuid,
    parent_reply_id uuid,
    deleted_by_sender boolean DEFAULT false NOT NULL,
    deleted_by_recipient boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone
);


-- Name: account_deletion_requests account_deletion_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.account_deletion_requests
    ADD CONSTRAINT account_deletion_requests_pkey PRIMARY KEY (id);


-- Name: admin_action_logs admin_action_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.admin_action_logs
    ADD CONSTRAINT admin_action_logs_pkey PRIMARY KEY (id);


-- Name: blocked_users blocked_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_pkey PRIMARY KEY (blocker_user_id, blocked_user_id);


-- Name: content_reports content_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_pkey PRIMARY KEY (id);


-- Name: inbox_messages inbox_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_pkey PRIMARY KEY (id);


-- Name: prayer_follows prayer_follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prayer_follows
    ADD CONSTRAINT prayer_follows_pkey PRIMARY KEY (user_id, story_id);


-- Name: prayer_search_preferences prayer_search_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prayer_search_preferences
    ADD CONSTRAINT prayer_search_preferences_pkey PRIMARY KEY (user_id);


-- Name: prayer_updates prayer_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prayer_updates
    ADD CONSTRAINT prayer_updates_pkey PRIMARY KEY (id);


-- Name: prayer_video_responses prayer_video_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prayer_video_responses
    ADD CONSTRAINT prayer_video_responses_pkey PRIMARY KEY (id);


-- Name: prayer_written_responses prayer_written_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prayer_written_responses
    ADD CONSTRAINT prayer_written_responses_pkey PRIMARY KEY (id);


-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


-- Name: profiles profiles_username_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_unique UNIQUE (username);


-- Name: saved_content saved_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.saved_content
    ADD CONSTRAINT saved_content_pkey PRIMARY KEY (user_id, story_id);


-- Name: stories stories_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_pkey PRIMARY KEY (id);


-- Name: story_reactions story_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.story_reactions
    ADD CONSTRAINT story_reactions_pkey PRIMARY KEY (id);


-- Name: story_reactions story_reactions_story_id_user_id_reaction_type_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.story_reactions
    ADD CONSTRAINT story_reactions_story_id_user_id_reaction_type_key UNIQUE (story_id, user_id, reaction_type);


-- Name: story_video_replies story_video_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.story_video_replies
    ADD CONSTRAINT story_video_replies_pkey PRIMARY KEY (id);


-- Name: admin_action_logs_actor_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS admin_action_logs_actor_idx ON public.admin_action_logs USING btree (actor_user_id);


-- Name: admin_action_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS admin_action_logs_created_at_idx ON public.admin_action_logs USING btree (created_at DESC);


-- Name: admin_action_logs_target_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS admin_action_logs_target_idx ON public.admin_action_logs USING btree (target_user_id);


-- Name: blocked_users_blocked_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS blocked_users_blocked_idx ON public.blocked_users USING btree (blocked_user_id);


-- Name: blocked_users_blocker_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS blocked_users_blocker_idx ON public.blocked_users USING btree (blocker_user_id);


-- Name: content_reports_admin_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS content_reports_admin_created_idx ON public.content_reports USING btree (created_at DESC, id DESC);


-- Name: content_reports_created_at_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS content_reports_created_at_idx ON public.content_reports USING btree (created_at DESC);


-- Name: content_reports_open_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS content_reports_open_created_idx ON public.content_reports USING btree (created_at DESC, id DESC) WHERE (status = ANY (ARRAY['open'::text, 'reviewing'::text]));


-- Name: content_reports_prayer_video_response_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS content_reports_prayer_video_response_id_idx ON public.content_reports USING btree (prayer_video_response_id) WHERE (prayer_video_response_id IS NOT NULL);


-- Name: content_reports_prayer_video_response_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS content_reports_prayer_video_response_idx ON public.content_reports USING btree (prayer_video_response_id) WHERE (prayer_video_response_id IS NOT NULL);


-- Name: content_reports_reporter_user_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS content_reports_reporter_user_id_idx ON public.content_reports USING btree (reporter_user_id);


-- Name: content_reports_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS content_reports_status_idx ON public.content_reports USING btree (status);


-- Name: content_reports_story_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS content_reports_story_id_idx ON public.content_reports USING btree (story_id);


-- Name: idx_content_reports_prayer_video_response_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS idx_content_reports_prayer_video_response_id ON public.content_reports USING btree (prayer_video_response_id) WHERE (prayer_video_response_id IS NOT NULL);


-- Name: inbox_messages_parent_message_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS inbox_messages_parent_message_id_idx ON public.inbox_messages USING btree (parent_message_id);


-- Name: inbox_messages_recipient_prayer_update_uidx; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_recipient_prayer_update_uidx ON public.inbox_messages USING btree (user_id, prayer_update_id) WHERE (prayer_update_id IS NOT NULL);


-- Name: inbox_messages_thread_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS inbox_messages_thread_id_idx ON public.inbox_messages USING btree (thread_id);


-- Name: prayer_follows_story_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS prayer_follows_story_id_idx ON public.prayer_follows USING btree (story_id);


-- Name: prayer_updates_author_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS prayer_updates_author_idx ON public.prayer_updates USING btree (author_user_id);


-- Name: prayer_updates_story_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS prayer_updates_story_created_idx ON public.prayer_updates USING btree (story_id, created_at);


-- Name: prayer_video_responses_context_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS prayer_video_responses_context_status_idx ON public.prayer_video_responses USING btree (response_context, status);


-- Name: prayer_video_responses_duration_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS prayer_video_responses_duration_status_idx ON public.prayer_video_responses USING btree (duration_verification_status) WHERE (status = ANY (ARRAY['submitted'::text, 'approved'::text]));


-- Name: prayer_video_responses_public_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS prayer_video_responses_public_idx ON public.prayer_video_responses USING btree (story_id) WHERE ((status = 'approved'::text) AND (removed_at IS NULL));


-- Name: prayer_video_responses_story_approved_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS prayer_video_responses_story_approved_idx ON public.prayer_video_responses USING btree (story_id, created_at DESC) WHERE ((status = 'approved'::text) AND (removed_at IS NULL));


-- Name: prayer_video_responses_story_status_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS prayer_video_responses_story_status_created_idx ON public.prayer_video_responses USING btree (story_id, status, created_at);


-- Name: prayer_video_responses_thumbnail_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS prayer_video_responses_thumbnail_idx ON public.prayer_video_responses USING btree (story_id) WHERE (thumbnail_url IS NOT NULL);


-- Name: prayer_video_responses_user_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS prayer_video_responses_user_created_idx ON public.prayer_video_responses USING btree (user_id, created_at DESC);


-- Name: prayer_written_responses_author_user_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS prayer_written_responses_author_user_id_idx ON public.prayer_written_responses USING btree (author_user_id, created_at DESC);


-- Name: prayer_written_responses_story_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS prayer_written_responses_story_id_idx ON public.prayer_written_responses USING btree (story_id, created_at DESC);


-- Name: profiles_username_unique_ci; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_ci ON public.profiles USING btree (lower(username)) WHERE (username IS NOT NULL);


-- Name: stories_admin_pending_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS stories_admin_pending_created_idx ON public.stories USING btree (created_at DESC, id DESC) WHERE (status = ANY (ARRAY['submitted'::text, 'pending'::text]));


-- Name: stories_faith_streams_gin_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS stories_faith_streams_gin_idx ON public.stories USING gin (faith_streams);


-- Name: stories_feed_approved_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS stories_feed_approved_created_idx ON public.stories USING btree (created_at DESC, id DESC) WHERE ((status = 'approved'::text) AND (removed_at IS NULL));


-- Name: stories_prayer_approved_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS stories_prayer_approved_created_idx ON public.stories USING btree (created_at DESC, id DESC) WHERE ((status = 'approved'::text) AND (removed_at IS NULL) AND (lower(COALESCE(story_type, ''::text)) ~~ '%prayer%'::text));


-- Name: stories_prayer_public_geo_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS stories_prayer_public_geo_idx ON public.stories USING btree (public_lat, public_lng) WHERE ((status = 'approved'::text) AND (removed_at IS NULL) AND (public_lat IS NOT NULL) AND (public_lng IS NOT NULL) AND (location_visibility IS DISTINCT FROM 'none'::text) AND (lower(COALESCE(story_type, ''::text)) ~~ '%prayer%'::text));


-- Name: stories_story_type_lower_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS stories_story_type_lower_idx ON public.stories USING btree (lower(story_type));


-- Name: stories_topics_gin_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS stories_topics_gin_idx ON public.stories USING gin (topics);


-- Name: story_reactions_feed_encouragement_unique_idx; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX IF NOT EXISTS story_reactions_feed_encouragement_unique_idx ON public.story_reactions USING btree (story_id, user_id, reaction_type) WHERE ((reaction_type = ANY (ARRAY['amen'::text, 'praise_god'::text, 'encouraged'::text])) AND (user_id IS NOT NULL));


-- Name: story_reactions_prayer_user_type_unique_idx; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX IF NOT EXISTS story_reactions_prayer_user_type_unique_idx ON public.story_reactions USING btree (story_id, user_id, reaction_type) WHERE ((reaction_type = ANY (ARRAY['praying'::text, 'encouraged'::text])) AND (user_id IS NOT NULL));


-- Name: story_reactions_story_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX IF NOT EXISTS story_reactions_story_id_idx ON public.story_reactions USING btree (story_id);


-- Name: story_reactions_story_user_reaction_uidx; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX IF NOT EXISTS story_reactions_story_user_reaction_uidx ON public.story_reactions USING btree (story_id, user_id, reaction_type);


-- Name: prayer_video_responses prayer_video_responses_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER prayer_video_responses_touch_updated_at BEFORE UPDATE ON public.prayer_video_responses FOR EACH ROW EXECUTE FUNCTION public.touch_prayer_video_responses_updated_at();


-- Name: prayer_written_responses prayer_written_responses_set_timestamps; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER prayer_written_responses_set_timestamps BEFORE UPDATE ON public.prayer_written_responses FOR EACH ROW EXECUTE FUNCTION public.set_prayer_written_response_timestamps();


-- Name: profiles profiles_reserved_username_access_trigger; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER profiles_reserved_username_access_trigger BEFORE INSERT OR UPDATE OF username, is_owner, can_use_reserved_username ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_reserved_username_access();


-- Name: profiles profiles_username_safety_trigger; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER profiles_username_safety_trigger BEFORE INSERT OR UPDATE OF username, username_changed_at ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_username_safety();


-- Name: profiles protect_profile_roles_trigger; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER protect_profile_roles_trigger BEFORE INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_roles();


-- Name: account_deletion_requests account_deletion_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.account_deletion_requests
    ADD CONSTRAINT account_deletion_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- Name: admin_action_logs admin_action_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.admin_action_logs
    ADD CONSTRAINT admin_action_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- Name: admin_action_logs admin_action_logs_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.admin_action_logs
    ADD CONSTRAINT admin_action_logs_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- Name: blocked_users blocked_users_blocked_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_blocked_user_id_fkey FOREIGN KEY (blocked_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- Name: blocked_users blocked_users_blocker_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_blocker_user_id_fkey FOREIGN KEY (blocker_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- Name: content_reports content_reports_prayer_video_response_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_prayer_video_response_id_fkey FOREIGN KEY (prayer_video_response_id) REFERENCES public.prayer_video_responses(id) ON DELETE SET NULL;


-- Name: content_reports content_reports_reporter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- Name: content_reports content_reports_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


-- Name: inbox_messages inbox_messages_parent_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_parent_message_id_fkey FOREIGN KEY (parent_message_id) REFERENCES public.inbox_messages(id) ON DELETE SET NULL;


-- Name: inbox_messages inbox_messages_prayer_update_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_prayer_update_id_fkey FOREIGN KEY (prayer_update_id) REFERENCES public.prayer_updates(id) ON DELETE CASCADE;


-- Name: inbox_messages inbox_messages_sender_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- Name: inbox_messages inbox_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- Name: prayer_follows prayer_follows_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prayer_follows
    ADD CONSTRAINT prayer_follows_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


-- Name: prayer_follows prayer_follows_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prayer_follows
    ADD CONSTRAINT prayer_follows_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- Name: prayer_search_preferences prayer_search_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prayer_search_preferences
    ADD CONSTRAINT prayer_search_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- Name: prayer_updates prayer_updates_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prayer_updates
    ADD CONSTRAINT prayer_updates_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- Name: prayer_updates prayer_updates_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prayer_updates
    ADD CONSTRAINT prayer_updates_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


-- Name: prayer_video_responses prayer_video_responses_moderated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prayer_video_responses
    ADD CONSTRAINT prayer_video_responses_moderated_by_fkey FOREIGN KEY (moderated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


-- Name: prayer_video_responses prayer_video_responses_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prayer_video_responses
    ADD CONSTRAINT prayer_video_responses_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


-- Name: prayer_video_responses prayer_video_responses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prayer_video_responses
    ADD CONSTRAINT prayer_video_responses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- Name: prayer_written_responses prayer_written_responses_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prayer_written_responses
    ADD CONSTRAINT prayer_written_responses_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- Name: prayer_written_responses prayer_written_responses_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prayer_written_responses
    ADD CONSTRAINT prayer_written_responses_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


-- Name: saved_content saved_content_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.saved_content
    ADD CONSTRAINT saved_content_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


-- Name: saved_content saved_content_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.saved_content
    ADD CONSTRAINT saved_content_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- Name: story_reactions story_reactions_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.story_reactions
    ADD CONSTRAINT story_reactions_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


-- Name: story_reactions story_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.story_reactions
    ADD CONSTRAINT story_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- Name: story_video_replies story_video_replies_parent_reply_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.story_video_replies
    ADD CONSTRAINT story_video_replies_parent_reply_id_fkey FOREIGN KEY (parent_reply_id) REFERENCES public.story_video_replies(id) ON DELETE CASCADE;


-- Name: story_video_replies story_video_replies_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.story_video_replies
    ADD CONSTRAINT story_video_replies_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- Name: story_video_replies story_video_replies_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.story_video_replies
    ADD CONSTRAINT story_video_replies_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


-- Name: story_video_replies story_video_replies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.story_video_replies
    ADD CONSTRAINT story_video_replies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- Name: account_deletion_requests Admin can manage deletion requests; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Admin can manage deletion requests" ON public.account_deletion_requests TO authenticated USING (((auth.jwt() ->> 'email'::text) = 'hypertobefree@gmail.com'::text)) WITH CHECK (((auth.jwt() ->> 'email'::text) = 'hypertobefree@gmail.com'::text));


-- Name: content_reports Admin can update content reports; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Admin can update content reports" ON public.content_reports FOR UPDATE TO authenticated USING (((auth.jwt() ->> 'email'::text) = 'hypertobefree@gmail.com'::text)) WITH CHECK (((auth.jwt() ->> 'email'::text) = 'hypertobefree@gmail.com'::text));


-- Name: content_reports Admin can update reports; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Admin can update reports" ON public.content_reports FOR UPDATE TO authenticated USING (((auth.jwt() ->> 'email'::text) = 'hypertobefree@gmail.com'::text)) WITH CHECK (((auth.jwt() ->> 'email'::text) = 'hypertobefree@gmail.com'::text));


-- Name: stories Admin can update stories; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Admin can update stories" ON public.stories FOR UPDATE TO authenticated USING (((auth.jwt() ->> 'email'::text) = 'hypertobefree@gmail.com'::text)) WITH CHECK (((auth.jwt() ->> 'email'::text) = 'hypertobefree@gmail.com'::text));


-- Name: content_reports Admin can view all content reports; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Admin can view all content reports" ON public.content_reports FOR SELECT TO authenticated USING (((auth.jwt() ->> 'email'::text) = 'hypertobefree@gmail.com'::text));


-- Name: stories Admin can view all stories; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Admin can view all stories" ON public.stories FOR SELECT TO authenticated USING (((auth.jwt() ->> 'email'::text) = 'hypertobefree@gmail.com'::text));


-- Name: content_reports Admin can view reports; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Admin can view reports" ON public.content_reports FOR SELECT TO authenticated USING (((auth.jwt() ->> 'email'::text) = 'hypertobefree@gmail.com'::text));


-- Name: admin_action_logs Admins can read admin action logs; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Admins can read admin action logs" ON public.admin_action_logs FOR SELECT TO authenticated USING (public.current_user_is_admin());


-- Name: inbox_messages Allow authenticated users to send inbox messages; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Allow authenticated users to send inbox messages" ON public.inbox_messages FOR INSERT TO authenticated WITH CHECK ((sender_user_id = auth.uid()));


-- Name: stories Anyone can view approved stories; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Anyone can view approved stories" ON public.stories FOR SELECT TO authenticated, anon USING ((status = 'approved'::text));


-- Name: prayer_updates Authenticated users can read visible prayer updates; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Authenticated users can read visible prayer updates" ON public.prayer_updates FOR SELECT TO authenticated USING (((hidden_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.stories
  WHERE ((stories.id = prayer_updates.story_id) AND (stories.status = 'approved'::text) AND (lower(COALESCE(stories.story_type, ''::text)) ~~ '%prayer%'::text))))));


-- Name: content_reports Authenticated users can report prayer video responses; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Authenticated users can report prayer video responses" ON public.content_reports FOR INSERT TO authenticated WITH CHECK (((reporter_user_id = auth.uid()) AND (prayer_video_response_id IS NOT NULL) AND (status = 'open'::text) AND (EXISTS ( SELECT 1
   FROM public.prayer_video_responses response
  WHERE ((response.id = content_reports.prayer_video_response_id) AND (response.story_id = content_reports.story_id) AND (response.user_id = content_reports.reported_user_id) AND (response.user_id <> auth.uid()) AND (response.status = 'approved'::text) AND (response.hidden_at IS NULL) AND (response.removed_at IS NULL))))));


-- Name: prayer_updates Prayer owners can create updates; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Prayer owners can create updates" ON public.prayer_updates FOR INSERT TO authenticated WITH CHECK (((author_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.stories
  WHERE ((stories.id = prayer_updates.story_id) AND (stories.user_id = auth.uid()) AND (lower(COALESCE(stories.story_type, ''::text)) ~~ '%prayer%'::text))))));


-- Name: prayer_updates Prayer owners can delete their updates; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Prayer owners can delete their updates" ON public.prayer_updates FOR DELETE TO authenticated USING (((author_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.stories
  WHERE ((stories.id = prayer_updates.story_id) AND (stories.user_id = auth.uid()))))));


-- Name: prayer_updates Prayer owners can read all their updates; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Prayer owners can read all their updates" ON public.prayer_updates FOR SELECT TO authenticated USING (((author_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.stories
  WHERE ((stories.id = prayer_updates.story_id) AND (stories.user_id = auth.uid()))))));


-- Name: prayer_updates Prayer owners can update their updates; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Prayer owners can update their updates" ON public.prayer_updates FOR UPDATE TO authenticated USING (((author_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.stories
  WHERE ((stories.id = prayer_updates.story_id) AND (stories.user_id = auth.uid())))))) WITH CHECK (((author_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.stories
  WHERE ((stories.id = prayer_updates.story_id) AND (stories.user_id = auth.uid()))))));


-- Name: prayer_video_responses Read approved owned or attached prayer responses; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Read approved owned or attached prayer responses" ON public.prayer_video_responses FOR SELECT TO authenticated USING ((((status = 'approved'::text) AND (hidden_at IS NULL) AND (removed_at IS NULL)) OR (user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.stories parent_prayer
  WHERE ((parent_prayer.id = prayer_video_responses.story_id) AND (parent_prayer.user_id = auth.uid()))))));


-- Name: story_reactions Users can add story reactions; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can add story reactions" ON public.story_reactions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


-- Name: story_video_replies Users can add video replies; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can add video replies" ON public.story_video_replies FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


-- Name: content_reports Users can create content reports; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can create content reports" ON public.content_reports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = reporter_user_id));


-- Name: content_reports Users can create reports; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can create reports" ON public.content_reports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = reporter_user_id));


-- Name: account_deletion_requests Users can create their own deletion request; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can create their own deletion request" ON public.account_deletion_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


-- Name: inbox_messages Users can delete their own inbox messages; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can delete their own inbox messages" ON public.inbox_messages FOR DELETE USING ((auth.uid() = user_id));


-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


-- Name: story_reactions Users can remove own story reactions; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can remove own story reactions" ON public.story_reactions FOR DELETE TO authenticated USING ((auth.uid() = user_id));


-- Name: inbox_messages Users can send private prayer inbox replies; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can send private prayer inbox replies" ON public.inbox_messages FOR INSERT TO authenticated WITH CHECK ((sender_user_id = auth.uid()));


-- Name: stories Users can submit their own stories; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can submit their own stories" ON public.stories FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


-- Name: inbox_messages Users can update their own inbox messages; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can update their own inbox messages" ON public.inbox_messages FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


-- Name: stories Users can update their own stories; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can update their own stories" ON public.stories FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


-- Name: story_video_replies Users can update their video replies; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can update their video replies" ON public.story_video_replies FOR UPDATE TO authenticated USING (((auth.uid() = user_id) OR (auth.uid() = recipient_user_id))) WITH CHECK (((auth.uid() = user_id) OR (auth.uid() = recipient_user_id)));


-- Name: story_reactions Users can view story reactions; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can view story reactions" ON public.story_reactions FOR SELECT TO authenticated USING (true);


-- Name: account_deletion_requests Users can view their own deletion request; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can view their own deletion request" ON public.account_deletion_requests FOR SELECT TO authenticated USING ((auth.uid() = user_id));


-- Name: inbox_messages Users can view their own inbox messages; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can view their own inbox messages" ON public.inbox_messages FOR SELECT USING ((auth.uid() = user_id));


-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


-- Name: content_reports Users can view their own reports; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can view their own reports" ON public.content_reports FOR SELECT TO authenticated USING ((auth.uid() = reporter_user_id));


-- Name: stories Users can view their own stories; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can view their own stories" ON public.stories FOR SELECT TO authenticated USING ((auth.uid() = user_id));


-- Name: story_video_replies Users can view their video replies; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users can view their video replies" ON public.story_video_replies FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR (auth.uid() = recipient_user_id)));


-- Name: blocked_users Users create their blocks; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users create their blocks" ON public.blocked_users FOR INSERT TO authenticated WITH CHECK ((blocker_user_id = auth.uid()));


-- Name: blocked_users Users delete their blocks; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users delete their blocks" ON public.blocked_users FOR DELETE TO authenticated USING ((blocker_user_id = auth.uid()));


-- Name: saved_content Users remove saved content; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users remove saved content" ON public.saved_content FOR DELETE TO authenticated USING ((user_id = auth.uid()));


-- Name: saved_content Users save content; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users save content" ON public.saved_content FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


-- Name: saved_content Users view saved content; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users view saved content" ON public.saved_content FOR SELECT TO authenticated USING ((user_id = auth.uid()));


-- Name: blocked_users Users view their blocks; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "Users view their blocks" ON public.blocked_users FOR SELECT TO authenticated USING ((blocker_user_id = auth.uid()));


-- Name: account_deletion_requests; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Name: admin_action_logs; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.admin_action_logs ENABLE ROW LEVEL SECURITY;

-- Name: blocked_users; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

-- Name: content_reports; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- Name: inbox_messages; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;

-- Name: prayer_follows; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.prayer_follows ENABLE ROW LEVEL SECURITY;

-- Name: prayer_follows prayer_follows_delete_own; Type: POLICY; Schema: public; Owner: -

CREATE POLICY prayer_follows_delete_own ON public.prayer_follows FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


-- Name: prayer_follows prayer_follows_insert_own; Type: POLICY; Schema: public; Owner: -

CREATE POLICY prayer_follows_insert_own ON public.prayer_follows FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM public.stories s
  WHERE ((s.id = prayer_follows.story_id) AND (s.status = 'approved'::text) AND (s.removed_at IS NULL) AND (lower(COALESCE(s.story_type, ''::text)) ~~ '%prayer%'::text) AND (COALESCE((to_jsonb(s.*) ->> 'prayer_status'::text), 'active'::text) = ANY (ARRAY['active'::text, 'answered'::text])))))));


-- Name: prayer_follows prayer_follows_select_own; Type: POLICY; Schema: public; Owner: -

CREATE POLICY prayer_follows_select_own ON public.prayer_follows FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


-- Name: prayer_search_preferences; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.prayer_search_preferences ENABLE ROW LEVEL SECURITY;

-- Name: prayer_search_preferences prayer_search_preferences_delete_own; Type: POLICY; Schema: public; Owner: -

CREATE POLICY prayer_search_preferences_delete_own ON public.prayer_search_preferences FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


-- Name: prayer_search_preferences prayer_search_preferences_select_own; Type: POLICY; Schema: public; Owner: -

CREATE POLICY prayer_search_preferences_select_own ON public.prayer_search_preferences FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


-- Name: prayer_search_preferences prayer_search_preferences_update_own; Type: POLICY; Schema: public; Owner: -

CREATE POLICY prayer_search_preferences_update_own ON public.prayer_search_preferences FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


-- Name: prayer_search_preferences prayer_search_preferences_upsert_own; Type: POLICY; Schema: public; Owner: -

CREATE POLICY prayer_search_preferences_upsert_own ON public.prayer_search_preferences FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


-- Name: prayer_updates; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.prayer_updates ENABLE ROW LEVEL SECURITY;

-- Name: prayer_video_responses; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.prayer_video_responses ENABLE ROW LEVEL SECURITY;

-- Name: prayer_video_responses prayer_video_responses_select_admin; Type: POLICY; Schema: public; Owner: -

CREATE POLICY prayer_video_responses_select_admin ON public.prayer_video_responses FOR SELECT TO authenticated USING ((public.current_user_is_admin() = true));


-- Name: prayer_video_responses prayer_video_responses_select_approved_public; Type: POLICY; Schema: public; Owner: -

CREATE POLICY prayer_video_responses_select_approved_public ON public.prayer_video_responses FOR SELECT TO authenticated, anon USING (((status = 'approved'::text) AND (removed_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.stories s
  WHERE ((s.id = prayer_video_responses.story_id) AND (s.status = 'approved'::text) AND (s.removed_at IS NULL))))));


-- Name: prayer_video_responses prayer_video_responses_select_own; Type: POLICY; Schema: public; Owner: -

CREATE POLICY prayer_video_responses_select_own ON public.prayer_video_responses FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


-- Name: prayer_written_responses; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.prayer_written_responses ENABLE ROW LEVEL SECURITY;

-- Name: prayer_written_responses prayer_written_responses_delete_own; Type: POLICY; Schema: public; Owner: -

CREATE POLICY prayer_written_responses_delete_own ON public.prayer_written_responses FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = author_user_id));


-- Name: prayer_written_responses prayer_written_responses_insert_own; Type: POLICY; Schema: public; Owner: -

CREATE POLICY prayer_written_responses_insert_own ON public.prayer_written_responses FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = author_user_id) AND (EXISTS ( SELECT 1
   FROM public.stories s
  WHERE ((s.id = prayer_written_responses.story_id) AND (s.status = 'approved'::text) AND (s.removed_at IS NULL) AND (lower(COALESCE(s.story_type, ''::text)) ~~ '%prayer%'::text) AND (COALESCE((to_jsonb(s.*) ->> 'prayer_status'::text), 'active'::text) = 'active'::text))))));


-- Name: prayer_written_responses prayer_written_responses_select_visible_or_own; Type: POLICY; Schema: public; Owner: -

CREATE POLICY prayer_written_responses_select_visible_or_own ON public.prayer_written_responses FOR SELECT TO authenticated, anon USING (((( SELECT auth.uid() AS uid) = author_user_id) OR ((status = 'visible'::text) AND (EXISTS ( SELECT 1
   FROM public.stories s
  WHERE ((s.id = prayer_written_responses.story_id) AND (s.status = 'approved'::text) AND (s.removed_at IS NULL) AND (lower(COALESCE(s.story_type, ''::text)) ~~ '%prayer%'::text) AND (COALESCE((to_jsonb(s.*) ->> 'prayer_status'::text), 'active'::text) = ANY (ARRAY['active'::text, 'answered'::text]))))))));


-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Name: saved_content; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.saved_content ENABLE ROW LEVEL SECURITY;

-- Name: stories; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

-- Name: story_reactions; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;

-- Name: story_reactions story_reactions_delete_feed_encouragement_own; Type: POLICY; Schema: public; Owner: -

CREATE POLICY story_reactions_delete_feed_encouragement_own ON public.story_reactions FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) AND (reaction_type = ANY (ARRAY['amen'::text, 'praise_god'::text, 'encouraged'::text]))));


-- Name: story_reactions story_reactions_insert_feed_encouragement_own; Type: POLICY; Schema: public; Owner: -

CREATE POLICY story_reactions_insert_feed_encouragement_own ON public.story_reactions FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (reaction_type = ANY (ARRAY['amen'::text, 'praise_god'::text, 'encouraged'::text])) AND (EXISTS ( SELECT 1
   FROM public.stories s
  WHERE ((s.id = story_reactions.story_id) AND (s.status = 'approved'::text) AND (s.removed_at IS NULL))))));


-- Name: story_reactions story_reactions_select_public; Type: POLICY; Schema: public; Owner: -

CREATE POLICY story_reactions_select_public ON public.story_reactions FOR SELECT TO authenticated, anon USING (true);


-- Name: story_video_replies; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.story_video_replies ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HTBF Storage bucket configuration (production parity)
-- Do NOT CREATE storage.buckets / storage.objects tables.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'profile-avatars',
    'profile-avatars',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'story-images',
    'story-images',
    false,
    NULL,
    NULL
  ),
  (
    'story-thumbnails',
    'story-thumbnails',
    true,
    NULL,
    NULL
  ),
  (
    'story-videos',
    'story-videos',
    true,
    52428800,
    ARRAY['video/mp4', 'video/quicktime', 'video/webm']
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- HTBF Storage RLS policies on storage.objects (production parity)
-- ============================================================

DROP POLICY IF EXISTS "Admin can view all story videos" ON storage.objects;
CREATE POLICY "Admin can view all story videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'story-videos'
    AND (auth.jwt() ->> 'email') = 'hypertobefree@gmail.com'
  );

DROP POLICY IF EXISTS "Allow authenticated prayer video reads" ON storage.objects;
CREATE POLICY "Allow authenticated prayer video reads"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'story-videos');

DROP POLICY IF EXISTS "Allow authenticated prayer video uploads" ON storage.objects;
CREATE POLICY "Allow authenticated prayer video uploads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'story-videos'
    AND name ~~ 'prayer-videos/%'
  );

DROP POLICY IF EXISTS "Allow public story video reads" ON storage.objects;
CREATE POLICY "Allow public story video reads"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'story-videos');

DROP POLICY IF EXISTS "Authenticated update public prayer responses" ON storage.objects;
CREATE POLICY "Authenticated update public prayer responses"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'story-videos'
    AND name ~~ 'prayer-public-responses/%'
  )
  WITH CHECK (
    bucket_id = 'story-videos'
    AND name ~~ 'prayer-public-responses/%'
  );

DROP POLICY IF EXISTS "Authenticated upload public prayer responses" ON storage.objects;
CREATE POLICY "Authenticated upload public prayer responses"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'story-videos'
    AND name ~~ 'prayer-public-responses/%'
  );

DROP POLICY IF EXISTS "Authenticated users can upload story images" ON storage.objects;
CREATE POLICY "Authenticated users can upload story images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'story-images');

DROP POLICY IF EXISTS "Authenticated users can view story images" ON storage.objects;
CREATE POLICY "Authenticated users can view story images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'story-images');

DROP POLICY IF EXISTS "Authenticated users can view story videos" ON storage.objects;
CREATE POLICY "Authenticated users can view story videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'story-videos');

DROP POLICY IF EXISTS "Profile avatars are publicly readable" ON storage.objects;
CREATE POLICY "Profile avatars are publicly readable"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'profile-avatars');

DROP POLICY IF EXISTS "Public can read story thumbnails" ON storage.objects;
CREATE POLICY "Public can read story thumbnails"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'story-thumbnails');

DROP POLICY IF EXISTS "Users can delete their own profile avatar" ON storage.objects;
CREATE POLICY "Users can delete their own profile avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can delete their own story images" ON storage.objects;
CREATE POLICY "Users can delete their own story images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'story-images' AND owner = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own story thumbnails" ON storage.objects;
CREATE POLICY "Users can delete their own story thumbnails"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'story-thumbnails'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can delete their own story videos" ON storage.objects;
CREATE POLICY "Users can delete their own story videos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'story-videos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can update their own profile avatar" ON storage.objects;
CREATE POLICY "Users can update their own profile avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can update their own story images" ON storage.objects;
CREATE POLICY "Users can update their own story images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'story-images' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'story-images' AND owner = auth.uid());

DROP POLICY IF EXISTS "Users can update their own story thumbnails" ON storage.objects;
CREATE POLICY "Users can update their own story thumbnails"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'story-thumbnails'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'story-thumbnails'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can update their own story videos" ON storage.objects;
CREATE POLICY "Users can update their own story videos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'story-videos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'story-videos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can upload prayer video replies" ON storage.objects;
CREATE POLICY "Users can upload prayer video replies"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'story-videos'
    AND name ~~ 'prayer-video-replies/%'
  );

DROP POLICY IF EXISTS "Users can upload prayer videos" ON storage.objects;
CREATE POLICY "Users can upload prayer videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'story-videos'
    AND name ~~ 'prayer-videos/%'
  );

DROP POLICY IF EXISTS "Users can upload their own profile avatar" ON storage.objects;
CREATE POLICY "Users can upload their own profile avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can upload their own story thumbnails" ON storage.objects;
CREATE POLICY "Users can upload their own story thumbnails"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'story-thumbnails'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can upload their own story videos" ON storage.objects;
CREATE POLICY "Users can upload their own story videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'story-videos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can view prayer video replies" ON storage.objects;
CREATE POLICY "Users can view prayer video replies"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'story-videos'
    AND name ~~ 'prayer-video-replies/%'
  );

DROP POLICY IF EXISTS "Users can view prayer videos" ON storage.objects;
CREATE POLICY "Users can view prayer videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'story-videos'
    AND name ~~ 'prayer-videos/%'
  );


-- ============================================================
-- HTBF auth.users trigger attachments (production parity)
-- Requires public trigger functions created above.
-- Does NOT CREATE auth.users.
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_created_create_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_create_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

DROP TRIGGER IF EXISTS on_auth_user_created_welcome_message ON auth.users;
CREATE TRIGGER on_auth_user_created_welcome_message
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_welcome_inbox_message();


COMMIT;
