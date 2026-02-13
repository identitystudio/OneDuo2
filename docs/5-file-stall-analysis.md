# Queue Stalling on 3rd File (5+ Files Upload) - Analysis

## Issue Discovered
When uploading **MORE THAN 5 files**, the 3rd file gets stuck.

## Root Cause Analysis

### The Limits Stack:
1. **Per-User Global Limit**: 3 concurrent jobs (can_start_job RPC, line 24)
2. **Per-Course Parallel Limit**: 3 modules max (MAX_PARALLEL_MODULES, line 3921)
3. **count_active_module_jobs**: Counts ALL active module jobs for the course

### The Problem Scenario:
You upload **6 files** (6 modules in one course):

```
Time 0: Upload complete
├─ Module 1: queued
├─ Module 2: queued
├─ Module 3: queued
├─ Module 4: queued
├─ Module 5: queued
└─ Module 6: queued

Time 1: Initial batch starts
├─ Module 1: PROCESSING ✅
├─ Module 2: PROCESSING ✅
├─ Module 3: PROCESSING ✅ (hits MAX_PARALLEL_MODULES = 3)
├─ Module 4: waiting (no slots)
├─ Module 5: waiting (no slots)
└─ Module 6: waiting (no slots)

Time 2: Module 1 completes
├─ Module 1: COMPLETED ✅
├─ Module 2: PROCESSING (active)
├─ Module 3: PROCESSING (active)
│
│ stepTrainAiModule() runs:
│   count_active_module_jobs = 2 (modules 2 & 3)
│   slotsAvailable = 3 - 2 = 1 ✅
│   Queues Module 4 ✅
│
├─ Module 4: PROCESSING ✅ (starts immediately)
├─ Module 5: waiting
└─ Module 6: waiting

Time 3: Module 2 completes
├─ Module 2: COMPLETED ✅
├─ Module 3: PROCESSING (active)
├─ Module 4: PROCESSING (active)
│
│ stepTrainAiModule() runs:
│   count_active_module_jobs = 2 (modules 3 & 4)
│   slotsAvailable = 3 - 2 = 1 ✅
│   Queues Module 5 ✅
│
├─ Module 5: PROCESSING ✅
└─ Module 6: waiting

Time 4: Module 3 completes
├─ Module 3: COMPLETED ✅
├─ Module 4: PROCESSING (active)
├─ Module 5: PROCESSING (active)
│
│ stepTrainAiModule() runs:
│   count_active_module_jobs = 2 (modules 4 & 5)
│   slotsAvailable = 3 - 2 = 1 ✅
│   Queues Module 6 ✅
│
└─ Module 6: PROCESSING ✅
```

### Wait, that should work! So why is it stuck?

Let me re-analyze... The issue might be:

## ACTUAL Problem: The `count_active_module_jobs` is NOT filtering by purged!

Looking at line 95-99 of the SQL:
```sql
SELECT COUNT(*) INTO v_count
FROM public.processing_queue
WHERE course_id = p_course_id
  AND status IN ('pending', 'processing', 'awaiting_webhook')
  AND step LIKE '%_module';
  -- ❌ MISSING: AND purged = false
```

If there are ANY purged jobs in the queue, they get counted as "active", reducing available slots!

## Another Potential Issue: Initial Queue Creation

When you upload 6 files, how many get queued initially? Let me check the upload handler...

The issue could be in the **initial batch queueing** - it might only queue 3 modules initially, then rely on the "completion triggers next" logic. But if one of those first 3 stalls, the chain breaks!

## Solution Required

Need to fix:
1. **count_active_module_jobs**: Must filter purged jobs
2. **Verify initial upload queues ALL modules** (or at least enough to keep pipeline full)
3. **Increase limits** if appropriate for your use case
