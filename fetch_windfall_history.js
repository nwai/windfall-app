const fs = require("fs");
const https = require("https");

const postData = JSON.stringify({
  CompanyId: "Tatts",
  MaxDrawCount: 1000,
  OptionalProductFilter: [],
  ProductFilter: ["WeekdayWindfall"],
});

const options = {
  hostname: "api.thelott.com",
  path: "/sales/vmax/web/data/lotto/results",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(postData),
    "User-Agent": "Mozilla/5.0",
    Accept: "application/json",
  },
};

function fetchJson() {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

function drawToCsv(draw) {
  return [
    draw.DrawDate.split("T")[0],
    ...draw.PrimaryNumbers,
    ...draw.SecondaryNumbers,
  ].join(",");
}

(async () => {
  try {
    console.log("Fetching draws...");
    const data = await fetchJson();

    if (
      !data ||
      !data.DrawResults ||
      !Array.isArray(data.DrawResults) ||
      data.DrawResults.length === 0
    ) {
      throw new Error("No results found in response.");
    }

    const draws = data.DrawResults;

    // Sort by date descending
    draws.sort(
      (a, b) =>
        new Date(b.DrawDate).getTime() - new Date(a.DrawDate).getTime()
    );

    // Filter draws with 6 mains and 2 supps
    const filtered = draws.filter(
      (d) =>
        Array.isArray(d.PrimaryNumbers) &&
        Array.isArray(d.SecondaryNumbers) &&
        d.PrimaryNumbers.length === 6 &&
        d.SecondaryNumbers.length === 2
    );

    const csvRows = [
      "date,main1,main2,main3,main4,main5,main6,supp1,supp2",
      ...filtered.map(drawToCsv),
    ];

    fs.writeFileSync("windfall_history.csv", csvRows.join("\n"));
    console.log(
      `Done! Wrote ${filtered.length} draws to windfall_history.csv`
    );
  } catch (err) {
    console.error("ERROR:", err.message || err);
    process.exit(1);
  }
})();