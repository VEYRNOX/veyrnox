-- Server-side referral code generation.
-- Creates a unique VYX-XXXXXX code in Postgres and inserts it into the
-- referrals table in one atomic step. Called from the app on first load.
--
-- Run via Supabase dashboard SQL editor.

create or replace function generate_referral_code()
returns text
language plpgsql
security definer
as $$
declare
  chars   text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result  text;
  i       int;
  byte_val int;
  raw     bytea;
  attempt int := 0;
begin
  loop
    attempt := attempt + 1;
    if attempt > 10 then
      raise exception 'Could not generate unique code after 10 attempts'
        using errcode = 'P0002';
    end if;

    raw := gen_random_bytes(6);
    result := 'VYX-';
    for i in 0..5 loop
      byte_val := get_byte(raw, i);
      result := result || substr(chars, (byte_val % length(chars)) + 1, 1);
    end loop;

    begin
      insert into referrals (code) values (result);
      return result;
    exception when unique_violation then
      -- collision on the primary key — retry with new random bytes
      continue;
    end;
  end loop;
end;
$$;
