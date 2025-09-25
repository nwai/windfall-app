import React, { useState } from "react";

/**
 * Usage:
 * <CsvWindfallImporter onData={setHistory} />
 *
 * Expects CSV with header: date,1,2,3,4,5,6,7,8
 * Each row: date, 6 main numbers, 2 supps
 */
function parseWindfallCsv(csvText) {
  const lines = csvText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.toLowerCase().startsWith("date"));

  const draws = [];
  for (const line of lines) {
    const [date, ...nums] = line.split(",");
    if (
      date &&
      nums.length === 8 &&
      nums.every((n) => /^\d+$/.test(n.trim()))
    ) {
      draws.push({
        date: date.trim(),
        mains: nums.slice(0, 6).map((n) => parseInt(n, 10)),
        supps: nums.slice(6, 8).map((n) => parseInt(n, 10))
      });
    }
  }
  return draws;
}

export default function CsvWindfallImporter({ onData }) {
  const [status, setStatus] = useState("");

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setStatus("Reading file...");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const draws = parseWindfallCsv(text);
        setStatus(`Loaded ${draws.length} valid draws`);
        if (onData) onData(draws);
      } catch (err) {
        setStatus("Error parsing CSV.");
        if (onData) onData([]);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label>
        Import Windfall CSV:{" "}
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
        />
      </label>
      <div style={{ marginTop: 8, color: "#555" }}>{status}</div>
    </div>
  );
}