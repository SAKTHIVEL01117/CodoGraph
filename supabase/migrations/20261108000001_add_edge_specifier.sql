-- ==============================================================================
-- CodoGraph — Phase 7: Add specifier column to edges table
-- ==============================================================================
alter table public.edges add column if not exists specifier text;

