-- Step 1: Build a canonical-casing map (most frequently used casing wins per lowercase tag)
WITH tag_usage AS (
  SELECT t AS tag, lower(t) AS key, COUNT(*) AS cnt
  FROM crm_contacts, unnest(tags) AS t
  WHERE t IS NOT NULL AND btrim(t) <> ''
  GROUP BY t, lower(t)
),
ranked AS (
  SELECT key, tag,
         ROW_NUMBER() OVER (PARTITION BY key ORDER BY cnt DESC, tag ASC) AS rn
  FROM tag_usage
),
canonical AS (
  SELECT key, tag AS canonical_tag FROM ranked WHERE rn = 1
)
-- Step 2: Rewrite tags array using canonical casing + drop junk
UPDATE crm_contacts c
SET tags = (
  SELECT public.normalize_crm_multi_array(
    array_agg(DISTINCT canon.canonical_tag)
  )
  FROM unnest(c.tags) AS orig_tag
  JOIN canonical canon ON canon.key = lower(btrim(orig_tag))
  WHERE btrim(orig_tag) <> ''
    -- Drop junk URL fragments and noise
    AND lower(btrim(orig_tag)) NOT IN ('https:', 'http:', '/', '//', 'www', '-')
    AND btrim(orig_tag) !~* '^https?://'
    AND btrim(orig_tag) !~* '^www\.'
    AND btrim(orig_tag) NOT LIKE '%.com'
    AND btrim(orig_tag) NOT LIKE '%.com/'
    AND btrim(orig_tag) NOT LIKE '%.ca'
    AND btrim(orig_tag) NOT LIKE '%.ca/'
)
WHERE c.tags IS NOT NULL AND array_length(c.tags, 1) > 0;

-- Replace any NULLs introduced by all-junk rows with empty arrays
UPDATE crm_contacts SET tags = '{}'::text[] WHERE tags IS NULL;