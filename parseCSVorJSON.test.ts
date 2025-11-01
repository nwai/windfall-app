import { parseCSVorJSON } from "./parseCSVorJSON.js";

// Define a type for expected output
type ExpectedDraw = {
  date: string;
  main: number[];
  supp: number[];
};

function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function runTest(
  testName: string,
  input: string,
  expected: ExpectedDraw[],
): void {
  let result;
  let error;
  try {
    result = parseCSVorJSON(input);
  } catch (e) {
    error = e;
  }
  const pass = deepEqual(result, expected);
  if (pass) {
    console.log(`✅ ${testName}`);
  } else {
    console.error(`❌ ${testName}\nExpected: ${JSON.stringify(expected, null, 2)}\nGot: ${JSON.stringify(result, null, 2)}${error ? "\nError: " + error : ""}`);
  }
}

// --- TEST CASES ---

// Test 1: Standard 9-column CSV
runTest(
  "Standard 9-column CSV",
  `date,main1,main2,main3,main4,main5,main6,supp1,supp2
9/1/25,7,8,27,40,31,44,16,42
8/29/25,19,24,9,6,36,39,26,37
`,
  [
    {
      date: "9/1/25",
      main: [7, 8, 27, 40, 31, 44],
      supp: [16, 42],
    },
    {
      date: "8/29/25",
      main: [19, 24, 9, 6, 36, 39],
      supp: [26, 37],
    },
  ]
);

// Test 2: Compact 3-column CSV
runTest(
  "Compact 3-column CSV",
  `date,main,supp
9/1/25,"7 8 27 40 31 44","16 42"
8/29/25,"19 24 9 6 36 39","26 37"
`,
  [
    {
      date: "9/1/25",
      main: [7, 8, 27, 40, 31, 44],
      supp: [16, 42],
    },
    {
      date: "8/29/25",
      main: [19, 24, 9, 6, 36, 39],
      supp: [26, 37],
    },
  ]
);

// Test 3: Handles trailing commas
runTest(
  "Handles trailing commas",
  `date,main1,main2,main3,main4,main5,main6,supp1,supp2
9/1/25,7,8,27,40,31,44,16,42,
8/29/25,19,24,9,6,36,39,26,37,
`,
  [
    {
      date: "9/1/25",
      main: [7, 8, 27, 40, 31, 44],
      supp: [16, 42],
    },
    {
      date: "8/29/25",
      main: [19, 24, 9, 6, 36, 39],
      supp: [26, 37],
    },
  ]
);

// Test 4: JSON array input
runTest(
  "JSON array input",
  `[{"date":"9/1/25","main":[7,8,27,40,31,44],"supp":[16,42]},
    {"date":"8/29/25","main":[19,24,9,6,36,39],"supp":[26,37]}]`,
  [
    {
      date: "9/1/25",
      main: [7, 8, 27, 40, 31, 44],
      supp: [16, 42],
    },
    {
      date: "8/29/25",
      main: [19, 24, 9, 6, 36, 39],
      supp: [26, 37],
    },
  ]
);

// Test 5: Handles blank/invalid rows gracefully
runTest(
  "Handles blank/invalid rows gracefully",
  `date,main1,main2,main3,main4,main5,main6,supp1,supp2

9/1/25,7,8,27,40,31,44,16,42
,,,,,,,,,`,
  [
    {
      date: "",
      main: [],
      supp: [],
    },
    {
      date: "9/1/25",
      main: [7, 8, 27, 40, 31, 44],
      supp: [16, 42],
    },
    {
      date: "",
      main: [],
      supp: [],
    },
  ]
);