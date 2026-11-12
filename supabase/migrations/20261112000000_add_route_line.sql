-- ============================================================================
-- CodoGraph Migration — Add declaration line number to public.routes
-- Idempotent & safe for repeated execution.
-- ============================================================================

alter table public.routes
  add column if not exists line integer;

