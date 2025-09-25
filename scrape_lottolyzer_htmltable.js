const fs = require("fs");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

const BASE_URL = "https://en.lottolyzer.com/history/australia/weekday-windfall/page";
const PAGE_COUNT = 4;

async function scrapePage(pageNum) {
  const url = `${BASE_URL}/${pageNum}/per-page/50/summary-view`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const rows = [];
  $("#summary-table tbody tr").each((_, el) => {
    const tds = $(el).find("td");
    const date = $(tds[1]).text().trim();
    const mains = $(tds[2]).text().split(",").map(n => parseInt(n.trim(), 10)).filter(Boolean);
    const supps = $(tds[3]).text().split(",").map(n => parseInt(n.trim(), 10)).filter(Boolean);
    if (date && mains.length === 6 && supps.length === 2) {
      rows.push([date, ...mains, ...supps]);
    }
  });
  return rows;
}

(async () => {
  let allRows = [];
  for (let i = 1; i <= PAGE_COUNT; ++i) {
    console.log(`Scraping page ${i}...`);
    const pageRows = await scrapePage(i);
    allRows = allRows.concat(pageRows);
  }
  const outRows = [
    "date,main1,main2,main3,main4,main5,main6,supp1,supp2",
    ...allRows.map((r) => r.join(",")),
  ];
  fs.writeFileSync("windfall_history_lottolyzer.csv", outRows.join("\n"));
  console.log(`Done! Saved ${allRows.length} draws to windfall_history_lottolyzer.csv`);
})();