-- Real CoreMotion-based driving/crash detection (native modules/core-motion
-- module) escalates the original speed-only heuristic. Additive columns —
-- existing rows keep detection_method NULL (predates this distinction);
-- new trips populate it so the report UI can show which trips used the
-- more reliable detector.
alter table driving_trips add column if not exists detection_method text check (detection_method in ('speed_heuristic', 'motion_classifier'));
alter table driving_trips add column if not exists hard_brake_count integer not null default 0;
