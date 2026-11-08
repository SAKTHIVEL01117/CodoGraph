-- ==============================================================================
-- CodoGraph — Phase 7: Realtime Pipeline Broadcast Migration
--
-- 1. Updates analyses table status check constraint to include 'selecting' and 'storing'.
-- 2. Index on analyses(org_id, repository_url) for rapid one-analysis-per-repo resolution.
-- 3. Database trigger on public.analyses that broadcasts stage transitions:
--    a. To per-analysis channel 'analysis:<id>' (for the progress page).
--    b. To per-org channel 'org:<org_id>' (for dashboard live updates in other tabs).
-- 4. RLS authorization policies on realtime.messages ensuring only authenticated
--    members of the analysis's organization can subscribe.
-- ==============================================================================

-- 1. Update status check constraint on analyses
ALTER TABLE public.analyses DROP CONSTRAINT IF EXISTS analyses_status_check;
ALTER TABLE public.analyses ADD CONSTRAINT analyses_status_check
  CHECK (status in ('pending', 'fetching', 'selecting', 'parsing', 'storing', 'completed', 'failed'));

-- 2. Index for one-analysis-per-repository lookups
CREATE INDEX IF NOT EXISTS idx_analyses_org_repo
  ON public.analyses(org_id, repository_url);

-- 3. Trigger Function: Broadcast stage change
CREATE OR REPLACE FUNCTION public.broadcast_analysis_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- 1. Per-analysis channel: 'analysis:<id>'
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object(
        'analysis_id', NEW.id,
        'status', NEW.status,
        'stage', NEW.stage,
        'error_message', NEW.error_message
      ),
      'stage_change',
      'analysis:' || NEW.id::text,
      true -- private channel: requires realtime authorization
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 2. Per-organization channel: 'org:<org_id>' (for live dashboard updates)
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object(
        'analysis_id', NEW.id,
        'org_id', NEW.org_id,
        'repository_url', NEW.repository_url,
        'branch', NEW.branch,
        'commit_hash', NEW.commit_hash,
        'status', NEW.status,
        'stage', NEW.stage,
        'error_message', NEW.error_message,
        'updated_at', NEW.updated_at
      ),
      'analysis_updated',
      'org:' || NEW.org_id,
      true -- private channel
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_broadcast_analysis_stage ON public.analyses;
CREATE TRIGGER trigger_broadcast_analysis_stage
AFTER INSERT OR UPDATE OF status, stage, error_message ON public.analyses
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_analysis_stage_change();

-- 4. Realtime Authorization Policies on realtime.messages
DO $$
BEGIN
  ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- Allow org members to subscribe to analysis-specific channels
DROP POLICY IF EXISTS "org_members_can_receive_analysis_broadcast" ON realtime.messages;
CREATE POLICY "org_members_can_receive_analysis_broadcast"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND EXISTS (
    SELECT 1 FROM public.analyses
    WHERE ('analysis:' || analyses.id::text) = realtime.topic()
      AND analyses.org_id = (SELECT public.requesting_org_id())
  )
);

-- Allow org members to subscribe to their organization dashboard broadcast
DROP POLICY IF EXISTS "org_members_can_receive_org_broadcast" ON realtime.messages;
CREATE POLICY "org_members_can_receive_org_broadcast"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND realtime.topic() = ('org:' || (SELECT public.requesting_org_id()))
);
