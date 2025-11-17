/**
 * Tests for dynamic zone count helpers in zpaStorage.ts
 * Run with: npx tsx zpaStorage.test.ts
 */

import { ZONE_RANGES } from './zoneAnalysis';

// Mock localStorage for testing
const storage: Record<string, string> = {};
global.localStorage = {
  getItem: (key: string) => storage[key] || null,
  setItem: (key: string, value: string) => { storage[key] = value; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
  length: 0,
  key: () => null,
} as Storage;

import {
  groupsFromZoneRanges,
  getEffectiveGroups,
  getEffectiveSelectedZones,
  getSavedSelectedZones,
  setSavedSelectedZones,
  getSavedGroups,
  setSavedGroups,
} from './zpaStorage';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function testGroupsFromZoneRanges() {
  console.log('\n🧪 Testing groupsFromZoneRanges()...');
  
  const groups = groupsFromZoneRanges();
  
  // Should have same length as ZONE_RANGES
  assert(groups.length === ZONE_RANGES.length, 
    `Expected ${ZONE_RANGES.length} groups, got ${groups.length}`);
  
  // Check first group (1-3)
  assert(groups[0].length === 3, 'First group should have 3 numbers');
  assert(groups[0][0] === 1 && groups[0][2] === 3, 'First group should be [1,2,3]');
  
  // Check last group (43-45)
  const lastIdx = groups.length - 1;
  assert(groups[lastIdx].length === 3, 'Last group should have 3 numbers');
  assert(groups[lastIdx][0] === 43 && groups[lastIdx][2] === 45, 
    'Last group should be [43,44,45]');
  
  console.log('✅ groupsFromZoneRanges() passed');
}

function testGetEffectiveGroups() {
  console.log('\n🧪 Testing getEffectiveGroups()...');
  
  // Clear storage
  localStorage.clear();
  
  // First call should derive and save
  const groups1 = getEffectiveGroups();
  assert(groups1.length === ZONE_RANGES.length,
    'Should return groups matching ZONE_RANGES length');
  
  // Should have saved to localStorage
  const saved = getSavedGroups();
  assert(saved !== null, 'Should have saved groups');
  assert(saved!.length === groups1.length, 'Saved groups should match returned groups');
  
  // Second call should return saved groups
  const groups2 = getEffectiveGroups();
  assert(JSON.stringify(groups2) === JSON.stringify(groups1),
    'Should return same groups on second call');
  
  console.log('✅ getEffectiveGroups() passed');
}

function testGetEffectiveSelectedZones() {
  console.log('\n🧪 Testing getEffectiveSelectedZones()...');
  
  localStorage.clear();
  
  // Test 1: No saved data - should initialize to all true
  const selected1 = getEffectiveSelectedZones(15);
  assert(selected1.length === 15, 'Should return array of length 15');
  assert(selected1.every(v => v === true), 'Should initialize to all true');
  
  // Test 2: Saved data matches - should return as-is
  setSavedSelectedZones([true, false, true, false, true, false, true, false, true, false, true, false, true, false, true]);
  const selected2 = getEffectiveSelectedZones(15);
  assert(selected2.length === 15, 'Should return array of length 15');
  assert(selected2[1] === false && selected2[0] === true, 
    'Should preserve saved pattern');
  
  // Test 3: Saved data shorter - should pad with true
  setSavedSelectedZones([true, false, true]);
  const selected3 = getEffectiveSelectedZones(10);
  assert(selected3.length === 10, 'Should pad to length 10');
  assert(selected3[0] === true && selected3[1] === false && selected3[2] === true,
    'Should preserve existing values');
  assert(selected3.slice(3).every(v => v === true), 
    'Should pad with true');
  
  // Test 4: Saved data longer - should truncate
  setSavedSelectedZones(new Array(20).fill(false));
  const selected4 = getEffectiveSelectedZones(5);
  assert(selected4.length === 5, 'Should truncate to length 5');
  assert(selected4.every(v => v === false), 'Should preserve first 5 values');
  
  // Test 5: No expectedLength - should use groups length
  localStorage.clear();
  getEffectiveGroups(); // Initialize groups
  const selected5 = getEffectiveSelectedZones();
  assert(selected5.length === ZONE_RANGES.length,
    'Should use groups length when no expectedLength provided');
  
  console.log('✅ getEffectiveSelectedZones() passed');
}

function testDynamicLengthSupport() {
  console.log('\n🧪 Testing dynamic length support...');
  
  localStorage.clear();
  
  // Test that getSavedSelectedZones accepts any length
  setSavedSelectedZones(new Array(15).fill(true));
  const zones15 = getSavedSelectedZones();
  assert(zones15 !== null && zones15.length === 15,
    'Should accept and return 15-element array');
  
  setSavedSelectedZones(new Array(9).fill(false));
  const zones9 = getSavedSelectedZones();
  assert(zones9 !== null && zones9.length === 9,
    'Should accept and return 9-element array');
  
  setSavedSelectedZones(new Array(20).fill(true));
  const zones20 = getSavedSelectedZones();
  assert(zones20 !== null && zones20.length === 20,
    'Should accept and return 20-element array');
  
  console.log('✅ Dynamic length support passed');
}

function testMigrationScenario() {
  console.log('\n🧪 Testing migration scenario (9 zones → 15 zones)...');
  
  localStorage.clear();
  
  // Simulate old 9-zone data
  const old9ZoneGroups = [
    [1,2,3,4,5], [6,7,8,9,10], [11,12,13,14,15],
    [16,17,18,19,20], [21,22,23,24,25], [26,27,28,29,30],
    [31,32,33,34,35], [36,37,38,39,40], [41,42,43,44,45]
  ];
  const old9ZoneSelected = [true, true, false, true, false, true, true, false, true];
  
  setSavedGroups(old9ZoneGroups);
  setSavedSelectedZones(old9ZoneSelected);
  
  // Now user updates to 15-zone system
  // Clear saved groups to trigger re-initialization
  localStorage.removeItem('zpa:groups:v1');
  
  const newGroups = getEffectiveGroups();
  assert(newGroups.length === ZONE_RANGES.length,
    'Should migrate to new zone count');
  
  // getEffectiveGroups should have initialized selectedZones to all true since groups changed
  // Let's test that getEffectiveSelectedZones properly handles the old 9-zone selected array
  localStorage.removeItem('zpa:groups:v1'); // Reset
  setSavedGroups(old9ZoneGroups); // Old groups
  setSavedSelectedZones(old9ZoneSelected); // Old selections
  
  // Now switch to new zones
  localStorage.removeItem('zpa:groups:v1');
  const newGroups2 = getEffectiveGroups(); // This resets to 15 zones
  
  // Set the old selections back to simulate migration
  setSavedSelectedZones(old9ZoneSelected);
  
  const newSelected = getEffectiveSelectedZones(newGroups2.length);
  assert(newSelected.length === newGroups2.length,
    'Selected zones should match new group count');
  assert(newSelected.slice(0, 9).every((v, i) => v === old9ZoneSelected[i]),
    `Should preserve first 9 selections. Got: ${JSON.stringify(newSelected.slice(0, 9))}, Expected: ${JSON.stringify(old9ZoneSelected)}`);
  assert(newSelected.slice(9).every(v => v === true),
    'Should initialize new zones to true');
  
  console.log('✅ Migration scenario passed');
}

// Run all tests
function runAllTests() {
  console.log('🚀 Running zpaStorage dynamic zone count tests...\n');
  
  try {
    testGroupsFromZoneRanges();
    testGetEffectiveGroups();
    testGetEffectiveSelectedZones();
    testDynamicLengthSupport();
    testMigrationScenario();
    
    console.log('\n✅ All tests passed! 🎉\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runAllTests();
