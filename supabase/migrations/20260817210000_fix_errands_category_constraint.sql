-- E2E TEST FOUND A REAL BUG: errands.category's CHECK constraint (from
-- Phase 1, 20260817150000) used the spec's original 7-value list
-- ('grocery','pharmacy','pet','household','package','return','other') —
-- but the category taxonomy added later (20260817190000) defines the
-- 'errand' domain's subcategories as grocery/pharmacy/pet_store/package/
-- return/dry_cleaning/other. 'pet' vs 'pet_store' don't match, and
-- 'dry_cleaning' didn't exist in the original constraint at all.
-- resolve-and-assign passes family-ai's taxonomy-driven category guess
-- straight into errands.category, so any AI extraction landing on
-- dry_cleaning (or a caller passing pet_store, matching the real
-- taxonomy) would fail this constraint. Confirmed live via a real e2e
-- test call to resolve-and-assign with a dry-cleaning errand, which
-- failed with "violates check constraint errands_category_check" before
-- this fix.
--
-- Widened to match the real taxonomy subcategory list exactly, keeping
-- 'household' as an additional allowed value since errands.category's
-- design intent (per the original spec comment) always included
-- household-adjacent errands, not just the narrow original 7.

alter table public.errands drop constraint if exists errands_category_check;
alter table public.errands add constraint errands_category_check
  check (category in ('grocery','pharmacy','pet_store','household','package','return','dry_cleaning','other'));
