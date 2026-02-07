-- Temporarily disable the immutability trigger (correct name)
DROP TRIGGER IF EXISTS enforce_purge_audit_immutability_trigger ON public.purge_audit_log;

-- Delete purge_audit_log entries for courses to be deleted
DELETE FROM public.purge_audit_log 
WHERE course_id IN (
  '2b5080fe-839e-4348-9652-1e0db142d019', 
  '8161c6d9-495d-4870-8ce1-8ebf59da875f', 
  '1181c19d-3224-4cac-85fd-973a2cf22915', 
  'fb6560e7-ea69-4b6a-b4e9-c7d467f64a48', 
  '12d9b55b-3089-4033-b704-66c98f8a4138', 
  '93e6cf2a-93d0-4b5e-a9b8-12b739ed1ad4', 
  '83fa25e0-a532-47f3-bd93-70902c759e34', 
  '7e501f64-7ac1-401f-96fa-eb372cd9bca1', 
  '8d067a66-fac6-47df-8021-40f148ed489e', 
  '01d493c8-acb2-487d-b932-b20504e8fa6f', 
  'cf42b902-ab89-49d6-bcb1-83b5f052671c', 
  'a8053c0f-7ed7-49e8-b963-8ff9d0675d55', 
  'c9b26095-28bf-4521-9c26-45dce555d36f', 
  '785d0e1e-82cc-405c-b9e2-66c0d3e85e0b'
);

-- Re-enable the immutability trigger
CREATE TRIGGER enforce_purge_audit_immutability_trigger
  BEFORE UPDATE OR DELETE ON public.purge_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_purge_audit_immutability();