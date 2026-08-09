-- Enable horse and bird species in app_config
INSERT INTO app_config (key, value, updated_at) 
VALUES (
  'species_enabled', 
  jsonb_build_object(
    'dog', true,
    'cat', true,
    'rabbit', true,
    'horse', true,
    'bird', true,
    'fish', false,
    'hamster', true,
    'turtle', true,
    'other', true
  ),
  now()
)
ON CONFLICT (key) DO UPDATE SET 
  value = jsonb_set(
    jsonb_set(app_config.value, '{horse}', 'true'::jsonb),
    '{bird}',
    'true'::jsonb
  ),
  updated_at = now();
