-- Drop the self-test results table.
-- It was created solely for ad-hoc DB self-tests during development,
-- has no RLS, is not referenced by any function, policy, trigger, or
-- application code, and should not exist in production.

DROP TABLE IF EXISTS public._selftest_results CASCADE;
