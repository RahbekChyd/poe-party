WITH ascendancy_map AS (
  SELECT *
  FROM (
    VALUES
      ('Juggernaut', 'Marauder', 1),
      ('Berserker', 'Marauder', 2),
      ('Chieftain', 'Marauder', 3),
      ('Raider', 'Ranger', 1),
      ('Deadeye', 'Ranger', 2),
      ('Pathfinder', 'Ranger', 3),
      ('Necromancer', 'Witch', 1),
      ('Occultist', 'Witch', 2),
      ('Elementalist', 'Witch', 3),
      ('Slayer', 'Duelist', 1),
      ('Gladiator', 'Duelist', 2),
      ('Champion', 'Duelist', 3),
      ('Inquisitor', 'Templar', 1),
      ('Hierophant', 'Templar', 2),
      ('Guardian', 'Templar', 3),
      ('Assassin', 'Shadow', 1),
      ('Saboteur', 'Shadow', 2),
      ('Trickster', 'Shadow', 3),
      ('Ascendant', 'Scion', 1)
  ) AS t(ascendancy_name, base_class, ascendancy_class)
),
updated_characters AS (
  UPDATE public.characters AS c
  SET
    class = m.base_class,
    ascendancy_class = CASE
      WHEN COALESCE(c.ascendancy_class, 0) > 0 THEN c.ascendancy_class
      ELSE m.ascendancy_class
    END
  FROM ascendancy_map AS m
  WHERE c.class = m.ascendancy_name
  RETURNING c.id, m.base_class, m.ascendancy_class
)
UPDATE public.character_profile_snapshots AS cps
SET
  class = m.base_class,
  ascendancy_class = CASE
    WHEN COALESCE(cps.ascendancy_class, 0) > 0 THEN cps.ascendancy_class
    ELSE m.ascendancy_class
  END,
  passive_tree = jsonb_set(
    jsonb_set(
      cps.passive_tree,
      '{classId}',
      to_jsonb(
        CASE m.base_class
          WHEN 'Scion' THEN 0
          WHEN 'Marauder' THEN 1
          WHEN 'Ranger' THEN 2
          WHEN 'Witch' THEN 3
          WHEN 'Duelist' THEN 4
          WHEN 'Templar' THEN 5
          WHEN 'Shadow' THEN 6
          ELSE NULL
        END
      ),
      true
    ),
    '{ascendancyId}',
    to_jsonb(
      CASE
        WHEN COALESCE(cps.ascendancy_class, 0) > 0 THEN cps.ascendancy_class
        ELSE m.ascendancy_class
      END
    ),
    true
  )
FROM ascendancy_map AS m
WHERE cps.class = m.ascendancy_name;
