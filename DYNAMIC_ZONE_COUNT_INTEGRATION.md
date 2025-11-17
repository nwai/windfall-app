# Dynamic Zone Count Integration Guide

## Overview

This guide explains how to integrate the dynamic zone count helpers from `zpaStorage.ts` into `App.tsx` and related components once merge conflicts are resolved.

## What Was Implemented

### zpaStorage.ts Changes ✅

1. **Removed hardcoded 9-zone validations**:
   - `getSavedSelectedZones()` now accepts any length array
   - `setSavedSelectedZones()` now accepts any length array

2. **Added new helper functions**:
   - `groupsFromZoneRanges()`: Derives zone groups from ZONE_RANGES
   - `getEffectiveGroups()`: Returns saved or derived groups
   - `getEffectiveSelectedZones(expectedLength?)`: Auto-adjusts selectedZones

## Required Changes in App.tsx

### Location: buildSnapshot() function

**Current code (around line 557-565)**:
```typescript
function buildSnapshot(): AppPresetSnapshot {
  // Read ZPA persisted settings (panels read these on mount)
  const zpaSelected = getSavedSelectedZones() ?? Array(9).fill(true);
  const zpaNorm = getSavedNormalizeMode() ?? "all";
  const zpaGroups = getSavedGroups() ?? [
    [1,2,3,4,5],[6,7,8,9,10],[11,12,13,14,15],
    [16,17,18,19,20],[21,22,23,24,25],
    [26,27,28,29,30],[31,32,33,34,35],
    [36,37,38,39,40],[41,42,43,44,45]
  ];
```

**Should be replaced with**:
```typescript
function buildSnapshot(): AppPresetSnapshot {
  // Read ZPA persisted settings (panels read these on mount)
  // Use dynamic helpers that derive from ZONE_RANGES
  const zpaGroups = getEffectiveGroups();
  const zpaSelected = getEffectiveSelectedZones(zpaGroups.length);
  const zpaNorm = getSavedNormalizeMode() ?? "all";
```

### Location: GroupPatternPanel rendering

**Current code (around line 2926)**:
```typescript
<GroupPatternPanel key={zpaReloadKey} history={filteredHistory} groups={custom} />
```

**Should be updated to**:
```typescript
const zpaGroupsForUI = useMemo(() => getEffectiveGroups(), [zpaReloadKey]);

// Then in render:
<GroupPatternPanel key={zpaReloadKey} history={filteredHistory} groups={zpaGroupsForUI} />
```

### Required imports

Add to the imports section at the top of App.tsx:
```typescript
import {
  getSavedGroups,
  setSavedGroups,
  getSavedSelectedZones,
  setSavedSelectedZones,
  getSavedNormalizeMode,
  setSavedNormalizeMode,
  getEffectiveGroups,        // NEW
  getEffectiveSelectedZones, // NEW
} from "./lib/zpaStorage";
```

## Changes in GroupPatternPanel.tsx

### Update hardcoded assumptions

**Location: Around line 28, 42, 61**

Current code assumes 9 zones in several places:
```typescript
title = "Zone Pattern Analysis (9 × 5)",
// ...
if (saved && Array.isArray(saved) && saved.length === 9) setCustomGroups(saved);
// ...
const lastPatternMain = lastDraw ? computePatternForDraw(lastDraw.main, localGroups) : Array(9).fill(0);
```

Should use dynamic zone count:
```typescript
// Get zone count from local groups
const zoneCount = localGroups.length;

title = `Zone Pattern Analysis (${zoneCount} zones)`,
// ...
if (saved && Array.isArray(saved) && saved.length > 0) setCustomGroups(saved);
// ...
const lastPatternMain = lastDraw ? computePatternForDraw(lastDraw.main, localGroups) : Array(zoneCount).fill(0);
const lastPatternSupp = lastDraw ? computePatternForDraw(lastDraw.supp, localGroups) : Array(zoneCount).fill(0);
```

## Benefits

1. **Automatic adaptation**: The app will automatically work with 15 zones (or any other count) without hardcoded assumptions
2. **Backward compatibility**: Existing saved data will be migrated automatically
3. **Single source of truth**: ZONE_RANGES in zoneAnalysis.ts is the only place that defines zones
4. **Auto-initialization**: Missing or mismatched data is automatically fixed and persisted

## Testing Checklist

After integration, verify:

- [ ] ZPA panel displays 15 zones correctly
- [ ] Selecting/deselecting zones works
- [ ] Zone weights are calculated for all zones
- [ ] Preset save/load preserves all zone data
- [ ] Migration from old 9-zone data works smoothly
- [ ] Pattern analysis uses correct zone count
- [ ] No console errors about array length mismatches

## Current Status

- ✅ zpaStorage.ts implementation complete
- ❌ App.tsx integration blocked by merge conflicts
- ❌ GroupPatternPanel updates pending
- ❌ Testing pending

## Notes

The current ZONE_RANGES defines 15 zones (3 numbers each: 1-3, 4-6, ..., 43-45).
The implementation is fully flexible and will work with any zone configuration
as long as ZONE_RANGES is updated accordingly.
