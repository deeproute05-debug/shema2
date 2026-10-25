CREATE TABLE IF NOT EXISTS public._selftest_results (
  id serial PRIMARY KEY,
  label text NOT NULL
);
TRUNCATE public._selftest_results;
