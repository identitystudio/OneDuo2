# Pipeline Troubleshooting Guide: "Stuck at X%" & Concurrency Issues

This guide helps you diagnose and fix issues where course processing is stuck (e.g., at 12%) or failing with database errors.

## 1. Quick Diagnosis (SQL Editor)

Run these queries in the Supabase SQL Editor to see what's happening in the background.

### Check for "Zombie" Jobs
A "Zombie" job is a job marked as `processing` but whose worker has died or timed out, blocking others from starting.
```sql
SELECT id, course_id, step, status, started_at, attempt_count, error_message 
FROM processing_queue 
WHERE status = 'processing' 
  AND purged = false
  AND started_at < now() - interval '15 minutes';
```

### Check Course Status
```sql
SELECT id, title, status, progress, updated_at 
FROM courses 
WHERE progress > 0 AND progress < 100 
ORDER BY updated_at DESC;
```

---

## 2. Common Symptoms & Fixes

### Symptom: Stuck at 12% (Head-of-Line Blocking)
**Cause**: The oldest job in the queue is stuck in a loop (failing and retrying) or is locked by a crashed process. Because the pipeline processes the oldest jobs first, one stuck job can block all newer courses.

**Fix**:
1. Identify the stuck job using the "Zombie" query above.
2. If it has many `attempt_count` (e.g., 5+), manually fail it to let the queue move:
   ```sql
   UPDATE processing_queue 
   SET status = 'failed', error_message = 'Manually failed to unblock queue' 
   WHERE id = 'STUCK_JOB_ID';
   ```

### Symptom: "Duplicate key value violates unique constraint"
**Cause**: Multiple workers are trying to process the same course step at the same time.

**Fix**: 
- Ensure the `claim_processing_job` SQL function has the `EXCEPTION WHEN unique_violation` block.
- **File to check**: `supabase/migrations/[latest_migration_on_queue].sql` or `master_schema.sql`.

### Symptom: "Column updated_at does not exist"
**Cause**: SQL logic is trying to update a column that wasn't created in the `processing_queue` table.

**Fix**:
- Check the table definition in `master_schema.sql`. 
- Most tables use `created_at` but some might lack `updated_at`. Ensure your SQL functions only target existing columns.
- Corrected logic for `claim_processing_job` should remove `updated_at = now()` if the column is missing.

---

---

## 4. Advanced: Using Pipeline Health Edge Function

There is a dedicated Edge Function for diagnosing and recovering the pipeline: `pipeline-health`. 

You can call these actions via `POST` requests to `https://<project-ref>.supabase.co/functions/v1/pipeline-health`.

### A. Run a System-Wide Health Check
Returns a summary of stuck courses, SLA breaches, and critical issues.
*   **Action**: `health`
*   **Command**:
    ```bash
    curl -X POST https://<project-ref>.supabase.co/functions/v1/pipeline-health \
      -H "Authorization: Bearer YOUR_ANON_KEY" \
      -H "Content-Type: application/json" \
      -d '{"action": "health"}'
    ```

### B. Recover a Specific Stuck Course
Attempts to detect missing data and backfill it automatically.
*   **Action**: `recover`
*   **Command**:
    ```bash
    curl -X POST https://<project-ref>.supabase.co/functions/v1/pipeline-health \
      -H "Authorization: Bearer YOUR_ANON_KEY" \
      -H "Content-Type: application/json" \
      -d '{"action": "recover", "courseId": "YOUR_COURSE_ID"}'
    ```

---

---

## 7. Forensic Debugging (Deep Dive)

If a job is behaving unexpectedly, check the `job_logs` table. This table contains a high-resolution trail of events for every job.

### View Recent Events for a Job
```sql
SELECT created_at, step, level, message, metadata 
FROM job_logs 
WHERE job_id = 'YOUR_COURSE_ID' 
ORDER BY created_at DESC;
```

---

## 8. Critical Files to Inspect

| Component | File Path | What to look for |
| :--- | :--- | :--- |
| **Database Logic** | `master_schema.sql` | The definition of `claim_processing_job` (RPC) and table constraints. |
| **Worker Logic** | `supabase/functions/process-course/index.ts` | How the Edge Function polls the queue and handles module processing. |
| **Reliability Logic** | `supabase/functions/_shared/reliability.ts` | The core recovery and verification logic used by the health function. |
| **Health Monitor** | `supabase/functions/pipeline-health/index.ts` | The API surface for diagnosis and recovery. |

## 9. How to Reset the Pipeline
If things are severely broken, you can clear the active queue (WARNING: This resets current progress):
```sql
UPDATE processing_queue 
SET status = 'failed' 
WHERE status = 'processing';
```
Then, re-trigger the course from the UI or by setting a course status back to `queued`.
