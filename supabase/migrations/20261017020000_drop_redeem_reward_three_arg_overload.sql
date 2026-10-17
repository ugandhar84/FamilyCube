-- redeem_reward existed in two overloads: (reward, member, wallet) and (reward, member, wallet, note). A call that
-- names fewer than all four arguments matched both, and PostgREST failed it with "Could not choose the best
-- candidate function" (any older app build that omits p_note hit this). The four-argument version has a default
-- for p_note, so it serves every call the three-argument one did. Drop the old overload.
drop function if exists public.redeem_reward(text, text, text);
