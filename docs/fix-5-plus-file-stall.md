# Fix for "Stuck on 3rd File" Issue (5+ Files Upload)

## Problem
When uploading **MORE THAN 5 files**, processing gets stuck on the 3rd file.

## Root Cause

The system had **TWO compounding issues**:

### Issue 1: Limited Initial Queue (MAJOR)
**Location**: `process-course/index.ts` lines 1273-1274 (create-course) and 1445-1446 (add-modules)

```typescript
// BEFORE (BROKEN):
const MAX_PARALLEL_MODULES = 3;
const modulesToQueue = Math.min(modules.length, MAX_PARALLEL_MODULES);
// ❌ Only queues first 3 modules!
```

**What happened when you uploaded 6 files**:
```
Upload complete → 6 modules created
    ↓
Initial queueing runs
    ↓
modulesToQueue = Math.min(6, 3) = 3  ← ❌ ONLY 3!
    ↓
Modules 1, 2, 3: Queue entries created ✅
Modules 4, 5, 6: NO queue entries ❌
    ↓
Modules 1, 2, 3 start processing
Modules 4, 5, 6: Stuck in "queued" status, waiting for completion triggers
    ↓
Module 1 completes → stepTrainAiModule tries to queue Module 4
    ↓
BUT if the completion trigger FAILS or is DELAYED...
    ↓
⚠️ Modules 4, 5, 6 STUCK FOREVER!
```

### Issue 2: Ghost Jobs Blocking Slots (MINOR)
**Location**: `count_active_module_jobs` SQL function

```sql
-- BEFORE (BROKEN):
SELECT COUNT(*) INTO v_count
FROM public.processing_queue
WHERE course_id = p_course_id
  AND status IN ('pending', 'processing', 'awaiting_webhook')
  AND step LIKE '%_module';
  -- ❌ MISSING: AND purged = false
```

**Impact**:
- Purged (deleted) jobs were still counted as "active"
- Example: 2 real active jobs + 1 purged job = 3 "active"
- Result: `slotsAvailable = 3 - 3 = 0` → Can't queue more modules!

---

## Fixes Applied

### Fix 1: Queue ALL Modules Upfront ✅
**Changed**: Lines 1272-1276 (create-course) and 1444-1448 (add-modules)

```typescript
// AFTER (FIXED):
const modulesToQueue = modules.length; // Queue ALL modules
```

**Why this works**:
- The **atomic job claiming system** (`claim_processing_job` RPC) already handles concurrency limits
- All modules get queue entries immediately
- The claiming system processes them 3 at a time automatically
- No reliance on fragile "completion triggers next" logic

**New flow with 6 files**:
```
Upload complete → 6 modules created
    ↓
Initial queueing runs
    ↓
modulesToQueue = 6  ← ✅ ALL modules!
    ↓
Queue entries created for ALL 6 modules ✅
    ↓
Atomic claiming system:
  - Claims 3 jobs (modules 1, 2, 3) → starts processing
  - Modules 4, 5, 6 stay in "pending" status
    ↓
Module 1 completes
    ↓
Atomic claiming system:
  - Automatically claims Module 4 → starts processing
    ↓
⚠️ NO MORE STUCK! All 6 modules process eventually
```

### Fix 2: Exclude Purged Jobs from Count ✅
**Created**: `supabase/migrations/20260213_fix_count_active_module_jobs.sql`

```sql
-- AFTER (FIXED):
SELECT COUNT(*) INTO v_count
FROM public.processing_queue
WHERE course_id = p_course_id
  AND status IN ('pending', 'processing', 'awaiting_webhook')
  AND purged = false  -- ✅ CRITICAL FIX
  AND step LIKE '%_module';
```

**Why this works**:
- Only counts real active jobs
- Purged jobs no longer block available slots
- Example: 2 real active + 1 purged = 2 active (correct!)
- Result: `slotsAvailable = 3 - 2 = 1` → Can  queue 1 more module ✅

---

## Deployment Steps

### 1. Deploy the SQL Migration
```bash
# Apply the migration to fix count_active_module_jobs
supabase db push
```

OR manually run this SQL in your Supabase SQL editor:

```sql
CREATE OR REPLACE FUNCTION public.count_active_module_jobs(p_course_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.processing_queue
  WHERE course_id = p_course_id
    AND status IN ('pending', 'processing', 'awaiting_webhook')
    AND purged = false
    AND step LIKE '%_module';
  
  RETURN COALESCE(v_count, 0);
END;
$function$;
```

### 2. Deploy the Edge Function
The `process-course` function changes are already in your code. Deploy with:

```bash
supabase functions deploy process-course
```

---

## Testing

### Test Case: 6 File Upload
1. Upload 6 video files in one batch
2. **Expected behavior**:
   - ✅ All 6 modules show in Dashboard immediately
   - ✅ Modules 1, 2, 3 start processing (within 2-3 seconds)
   - ✅ When Module 1 completes, Module 4 starts (within 2-3 seconds)
   - ✅ When Module 2 completes, Module 5 starts
   - ✅ When Module 3 completes, Module 6 starts
   - ✅ All 6 modules complete successfully
3. **No more**:
   - ❌ Stuck on 3rd file
   - ❌ Modules 4+ staying at 0% forever
   - ❌ Having to manually "kickstart"

### Monitor Logs
Look for these in Edge Function logs:
- ✅ `[create-course] PARALLEL: Queueing ALL 6 modules for course X (atomic claiming handles concurrency)`
- ✅ `[poll] Worker Y claimed job Z (step: transcribe_and_extract_module)`
- ✅ Modules processing in waves of 3

---

## Why the Previous "Fix" Didn't Fully Work

The earlier fix (in conversation 52f856d1) improved the **completion-based queueing**:
- Fixed the `contains` operator → `->>` operator (more reliable)
- Added immediate `processNextStep()` trigger

**BUT** it still relied on the **completion trigger chain**:
```
Module 1 completes → triggers queue for Module 4
Module 2 completes → triggers queue for Module 5
Module 3 completes → triggers queue for Module 6
```

If **ANY** link in this chain broke (network issue, Edge Function timeout, race condition), the remaining modules got stuck.

**New approach**: Queue everything upfront, let the atomic system handle it. Much more resilient!

---

## Files Changed
- ✅ `supabase/functions/process-course/index.ts` - Queue ALL modules upfront
- ✅ `supabase/migrations/20260213_fix_count_active_module_jobs.sql` - Fix ghost job counting
- ✅ `docs/5-file-stall-analysis.md` - Problem analysis
- ✅ `docs/fix-5-plus-file-stall.md` - This comprehensive fix summary
