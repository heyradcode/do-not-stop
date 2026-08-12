-- Record a season's token decimals so a client can render its amounts.
--
-- Display only. The reward leaf binds `token` and `amount` in the token's smallest unit, and
-- neither changes here, so adding this column cannot move a merkle root or invalidate a
-- proof. It exists because the amount alone is unreadable: 1250000000000000000 of an
-- 18-decimal ERC-20 is 1.25 tokens, and a client with no decimals can only show the former.
--
-- Nullable, and null means "unknown" rather than zero. Seasons built before this column
-- existed have no recorded decimals, and rendering those as if they were 0-decimal would
-- overstate every amount by orders of magnitude. A client showing base units with a label is
-- the honest fallback; guessing is not.

ALTER TABLE "reward_season" ADD COLUMN "token_decimals" INTEGER;

-- No RLS statement: this migration creates no table. `reward_season` already has row level
-- security enabled with zero policies.
