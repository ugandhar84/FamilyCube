-- parse-grocery-receipt now accepts two distinct kinds of photo: a real
-- printed receipt, or a plain photo of groceries/items with no receipt
-- [live-requested: "we should not treat this as receipt right if it's
-- groceries .. just to clarify" / "we send that receipt / list tag in the
-- request as these are 2 separate call pages"]. The client now tells the
-- function which one it is instead of the AI re-guessing every time.
alter table public.grocery_receipts add column if not exists source text not null default 'receipt';
