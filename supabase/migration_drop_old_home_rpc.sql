-- Drop both overloads so there's no ambiguity, then re-create the single text version
DROP FUNCTION IF EXISTS get_home_dashboard(uuid, uuid, date);
DROP FUNCTION IF EXISTS get_home_dashboard(uuid, uuid, text);
