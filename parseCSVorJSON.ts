export function parseCSVorJSON(input: string) {
  input = input.trimEnd();

  // Try JSON first
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      // Validate the expected structure
      return parsed.map((x) => ({
        date: typeof x.date === "string" ? x.date : "",
        main: Array.isArray(x.main) ? x.main.map(Number) : [],
        supp: Array.isArray(x.supp) ? x.supp.map(Number) : [],
      }));
    }
  } catch {
    // not JSON, try CSV
  }

  const lines = input.split(/\r?\n/);

  if (lines.length === 0) return [];

  // Remove blank lines at the end and preserve blank rows elsewhere
  let headerLineIdx = lines.findIndex(line => line.trim() !== "");
  if (headerLineIdx === -1) return [];

  const header = lines[headerLineIdx].split(",").map(h => h.trim());
  const out: {date: string, main: number[], supp: number[]}[] = [];

  // Determine format
  const isCompact =
    header.length === 3 &&
    header[0] === "date" &&
    header[1] === "main" &&
    header[2] === "supp";
  const isStandard =
    header.length >= 3 &&
    header[0] === "date" &&
    header.slice(1, 7).every((h, i) => h.startsWith("main") || h === "") &&
    header.slice(-2).every((h, i) => h.startsWith("supp") || h === "");

  for (let i = headerLineIdx + 1; i < lines.length; ++i) {
    const raw = lines[i];
    // Preserve blank rows (even those with just commas)
    if (raw.trim() === "") {
      out.push({ date: "", main: [], supp: [] });
      continue;
    }
    // Keep trailing empty fields
    const row = raw.split(",").map(x => x.trim());
    // If row is empty but has some commas, treat as blank
    if (row.every(x => x === "")) {
      out.push({ date: "", main: [], supp: [] });
      continue;
    }

    if (isCompact) {
      // Handles quoted fields with possible spaces
      // e.g. 9/1/25,"7 8 27 40 31 44","16 42"
      const [date, mainStr, suppStr] = row;
      out.push({
        date: date || "",
        main: mainStr ? mainStr.replace(/^"|"$/g, "").split(/\s+/).filter(Boolean).map(Number) : [],
        supp: suppStr ? suppStr.replace(/^"|"$/g, "").split(/\s+/).filter(Boolean).map(Number) : [],
      });
    } else if (isStandard) {
      // Handles standard columnar
      // Allow for trailing empty columns
      const date = row[0] ?? "";
      const main = [];
      const supp = [];
      for (let j = 1; j < header.length; ++j) {
        const h = header[j];
        const v = row[j];
        if (h.startsWith("main")) {
          if (v !== undefined && v !== "") main.push(Number(v));
        } else if (h.startsWith("supp")) {
          if (v !== undefined && v !== "") supp.push(Number(v));
        }
      }
      // If all fields except date are blank, but row is not fully blank, treat as blank row
      if (
        date === "" &&
        main.length === 0 &&
        supp.length === 0 &&
        row.slice(1).every(x => x === "")
      ) {
        out.push({ date: "", main: [], supp: [] });
      } else {
        out.push({ date, main, supp });
      }
    }
  }
  return out;
}