-- Lock down execute permissions so only the backend service role can call these helpers
REVOKE ALL ON FUNCTION public.complete_step_and_queue_next(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_step_and_queue_next(uuid, uuid, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.detect_stuck_intermediate_states() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_stuck_intermediate_states() TO service_role;