-- The original constraint made "no right side" and "status = unmatched"
-- equivalent. Two legitimate statuses break that: a duplicate register row has
-- no counterpart because another row already consumed it, and a residual is by
-- definition unexplained. Both must be recordable.
--
-- The rule that actually matters is the other direction: a matched row must
-- have something on the right. That is what is enforced here.

alter table matches drop constraint matches_unmatched_has_no_right;

alter table matches add constraint matches_right_side_agrees_with_status check (
    case status
        when 'matched'   then right_id is not null
        when 'unmatched' then right_id is null
        when 'duplicate' then right_id is null
        when 'residual'  then right_id is null
        else true                       -- 'disputed' may or may not have a pair
    end
);
