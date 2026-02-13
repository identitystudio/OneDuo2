# Video Processing Queue Stalling & UI Rewind - Fix Summary

## Issues Diagnosed and Fixed

### Issue 1: Queue Stalling (Backend)
**Symptom**: When uploading multiple videos, the first one completes, but the second and third get stuck at specific percentages (e.g., 24% and 12%). They are "queued" but never advance.

**Root Causes Identified**:
1. **Unreliable PostgreSQL 'contains' operator** (Line 3891 in process-course/index.ts)
   - The `contains` operator on JSONB metadata had **false negatives**
   - This caused duplicate queue entries OR failure to detect existing jobs
   - Result: Modules thought they were already queued when they weren't, or duplicate jobs caused conflicts

2. **Missing explicit trigger** after queueing modules (Line 3903)
   - After queueing new modules, the code relied solely on **passive polling** (every 2 minutes via watchdog)
   - No immediate `processNextStep` call to start processing queued modules
   - Result: Modules sat in "pending" status waiting for the next poll cycle

**Fixes Applied**:
1. ✅ **Replaced `contains` with explicit `->>` operator** (lines 3885-3891)
   ```typescript
   // BEFORE (unreliable):
   .contains("metadata", { moduleNumber: mod.module_number })
   
   // AFTER (reliable):
   .filter("metadata->>moduleNumber", "eq", String(mod.module_number))
   ```

2. ✅ **Added immediate processing trigger** (lines 3904-3910)
   ```typescript
   if (queuedCount > 0) {
     console.log(`[stepTrainAiModule] CRITICAL: Queued ${queuedCount} modules, triggering immediate processing`);
     (globalThis as any).EdgeRuntime?.waitUntil?.(processNextStep(supabase, courseId));
   }
   ```

3. ✅ **Added watchdog recovery for idle multi-module courses** (lines 2815-2866)
   - Detects courses with queued modules but no active processing jobs
   - Automatically creates queue entries for up to 3 modules for parallel processing
   - Runs every 2 minutes as part of the watchdog cycle


### Issue 2: UI Rewind (Frontend)
**Symptom**: When a video reaches "Complete," refreshing the page causes it to jump back to ~90% and start "finalizing" again.

**Root Cause Identified**:
The micro-progress simulation (lines 338-364 in Dashboard.tsx) continued to **increment progress** even for completed items, and the **initialization logic** (lines 317-336) didn't forcefully reset completed items to their database value.

**State Flow**:
1. Module completes → DB has `status='completed', progress=100`
2. Micro-simulation increments `displayProgress` to 97%
3. User refreshes page
4. `loadCourses` fetches DB data (progress=100)
5. ❌ **BUG**: Line 327 checks `if (actualProgress > currentDisplay)` → 100 is NOT > 97, so it keeps simulated 97%
6. Result: UI shows 97% instead of 100%, appears to "rewind"

**Fixes Applied**:
1. ✅ **Force completed items to database progress in initialization** (lines 323-329)
   ```typescript
   const isComplete = item.status === 'completed' || item.status === 'failed';
   if (isComplete) {
     initialProgress[item.id] = actualProgress; // Always use DB value
   }
   ```

2. ✅ **Skip micro-simulation for completed items** (lines 353-361)
   ```typescript
   const isComplete = item.status === 'completed' || item.status === 'failed';
   if (isComplete) {
     updated[item.id] = actualProgress; // Force to actual progress
     return; // Don't simulate
   }
   ```

3. ✅ **Reset displayProgress on every poll for completed items** (lines 413-432)
   ```typescript
   setDisplayProgress(prev => {
     const updated = { ...prev };
     newCourses.forEach((course: Course) => {
       if (course.status === 'completed' || course.status === 'failed') {
         updated[course.id] = course.progress;
       }
       // Also reset for modules
       course.modules?.forEach(m => {
         if (m.status === 'completed' || m.status === 'failed') {
           updated[m.id] = m.progress;
         }
       });
     });
     return updated;
   });
   ```


## Testing Recommendations

### Test Case 1: Queue Stalling
1. Upload 3 videos with multi-module processing enabled
2. Observe that:
   - ✅ Module 1 starts processing immediately
   - ✅ When Module 1 completes, Modules 2 and 3 start processing within 2-3 seconds (not minutes)
   - ✅ All modules progress to completion without stalling

### Test Case 2: UI Rewind
1. Upload a video and wait for it to reach "Complete" (100%)
2. Refresh the browser page
3. Observe that:
   - ✅ The module remains at 100% after refresh (no rewind to ~90%)
   - ✅ The status stays "Complete"
   - ✅ No "Finalizing" phase appears after refresh

### Test Case 3: Watchdog Recovery
1. Simulate a stuck queue by manually inserting a module with status='queued' but no queue entry
2. Wait 2 minutes for watchdog cycle
3. Observe that:
   - ✅ Watchdog detects the idle module
   - ✅ Creates queue entry automatically (logs: `[watchdog] IDLE MULTI-MODULE: Queued module X`)
   - ✅ Processing starts within seconds


## Changed Files
- ✅ `supabase/functions/process-course/index.ts` - Backend queue logic fixes
- ✅ `src/pages/Dashboard.tsx` - Frontend UI progress fixes


## Monitoring
Check the Edge Function logs for these success indicators:
- `[stepTrainAiModule] CRITICAL: Queued N modules, triggering immediate processing`
- `[watchdog] IDLE MULTI-MODULE: Course X has Y queued modules but no active jobs`
- `[stepTrainAiModule] Module X already queued (job Y, status: pending)` (confirms duplicate prevention)
