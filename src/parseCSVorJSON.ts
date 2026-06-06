export type ParsedDrawInput = { date: string; main: number[]; supp: number[] };

const DATE_PATTERN = /(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/;

function mapJsonRow(value: unknown): ParsedDrawInput | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const date = typeof candidate.date === "string"
    ? candidate.date
    : typeof candidate.DrawDate === "string"
      ? candidate.DrawDate.split("T")[0]
      : "";

  const mainSource = Array.isArray(candidate.main)
    ? candidate.main
    : Array.isArray(candidate.PrimaryNumbers)
      ? candidate.PrimaryNumbers
      : Array.isArray(candidate.mains)
        ? candidate.mains
        : [];

  const suppSource = Array.isArray(candidate.supp)
    ? candidate.supp
    : Array.isArray(candidate.SecondaryNumbers)
      ? candidate.SecondaryNumbers
      : Array.isArray(candidate.supps)
        ? candidate.supps
        : [];

  return {
    date,
    main: mainSource.map(Number),
    supp: suppSource.map(Number),
  };
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripMarkup(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLooseTextRows(input: string): ParsedDrawInput[] {
  const segments = input.match(/<tr[\s\S]*?<\/tr>/gi) ?? input.split(/\r?\n/);
  const results: ParsedDrawInput[] = [];

  segments.forEach((segment) => {
    const text = stripMarkup(segment);
    if (!text) {
      return;
    }
    const dateMatch = DATE_PATTERN.exec(text);
    if (!dateMatch || typeof dateMatch.index !== "number") {
      return;
    }

    const afterDate = text.slice(dateMatch.index + dateMatch[0].length);
    const numbers = (afterDate.match(/\b\d{1,2}\b/g) ?? []).map(Number);
    if (numbers.length < 8) {
      return;
    }

    results.push({
      date: dateMatch[0],
      main: numbers.slice(0, 6),
      supp: numbers.slice(6, 8),
    });
  });

  return results;
}

export function parseCSVorJSON(input: string): ParsedDrawInput[] {
  input = input.trimEnd();

  // Try JSON first
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => mapJsonRow(entry)).filter((entry): entry is ParsedDrawInput => entry !== null);
    }
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { DrawResults?: unknown[] }).DrawResults)) {
      return ((parsed as { DrawResults: unknown[] }).DrawResults)
        .map((entry) => mapJsonRow(entry))
        .filter((entry): entry is ParsedDrawInput => entry !== null);
    }
  } catch {
    // not JSON, try CSV or loose text
  }

  const lines = input.split(/\r?\n/);

  if (lines.length === 0) return [];

  const headerLineIdx = lines.findIndex((line) => line.trim() !== "");
  if (headerLineIdx === -1) return [];

  const header = lines[headerLineIdx].split(",").map((h) => h.trim());
  const out: ParsedDrawInput[] = [];

  const isCompact =
    header.length === 3 &&
    header[0] === "date" &&
    header[1] === "main" &&
    header[2] === "supp";
  const isStandard =
    header.length >= 3 &&
    header[0] === "date" &&
    header.slice(1, 7).every((h) => h.startsWith("main") || h === "") &&
    header.slice(-2).every((h) => h.startsWith("supp") || h === "");

  if (isCompact || isStandard) {
    for (let i = headerLineIdx + 1; i < lines.length; ++i) {
      const raw = lines[i];
      if (raw.trim() === "") {
        out.push({ date: "", main: [], supp: [] });
        continue;
      }

      const row = raw.split(",").map((x) => x.trim());
      if (row.every((x) => x === "")) {
        out.push({ date: "", main: [], supp: [] });
        continue;
      }

      if (isCompact) {
        const [date, mainStr, suppStr] = row;
        out.push({
          date: date || "",
          main: mainStr ? mainStr.replace(/^"|"$/g, "").split(/\s+/).filter(Boolean).map(Number) : [],
          supp: suppStr ? suppStr.replace(/^"|"$/g, "").split(/\s+/).filter(Boolean).map(Number) : [],
        });
      } else {
        const date = row[0] ?? "";
        const main: number[] = [];
        const supp: number[] = [];
        for (let j = 1; j < header.length; ++j) {
          const h = header[j];
          const v = row[j];
          if (h.startsWith("main")) {
            if (v !== undefined && v !== "") main.push(Number(v));
          } else if (h.startsWith("supp")) {
            if (v !== undefined && v !== "") supp.push(Number(v));
          }
        }
        if (date === "" && main.length === 0 && supp.length === 0 && row.slice(1).every((x) => x === "")) {
          out.push({ date: "", main: [], supp: [] });
        } else {
          out.push({ date, main, supp });
        }
      }
    }
    return out;
  }

  return parseLooseTextRows(input);
}