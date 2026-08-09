-- Replace old purple accent colors on pets with vibrant non-purple alternatives.
-- Old palette had #9B6DD4 (soft violet) and #C062B8 (fuchsia).
-- New replacements: #E8724A (coral) and #F03E6E (hot coral-pink).

UPDATE pets
SET accent_color = CASE
  WHEN accent_color = '#9B6DD4' THEN '#E8724A'
  WHEN accent_color = '#C062B8' THEN '#F03E6E'
  ELSE accent_color
END
WHERE accent_color IN ('#9B6DD4', '#C062B8');
