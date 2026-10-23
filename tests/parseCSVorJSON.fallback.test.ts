import { describe, expect, it } from "vitest";
import { parseCSVorJSON } from "../src/parseCSVorJSON";

describe("parseCSVorJSON official source fallbacks", () => {
  it("ignores trailing history diagnostics without filling a missing supplementary slot from their digits",()=>{
    const header="date,main1,main2,main3,main4,main5,main6,supp1,supp2,terminal_shape,terminal_runs";
    expect(parseCSVorJSON(`${header}\n10/9/26,28,33,36,15,40,18,44,4,2+2+1+1+1+1,3-4-5-6`)).toEqual([
      {date:"10/9/26",main:[28,33,36,15,40,18],supp:[44,4]},
    ]);
    expect(parseCSVorJSON(`${header}\n10/9/26,28,33,36,15,40,18,44,,2+2+1+1+1+1,3-4-5-6`)).toEqual([
      {date:"10/9/26",main:[28,33,36,15,40,18],supp:[44]},
    ]);
  });
  it("parses theLott-style JSON payloads with DrawResults", () => {
    const input = JSON.stringify({
      DrawResults: [
        {
          DrawDate: "2025-10-27T00:00:00",
          PrimaryNumbers: [1, 2, 3, 4, 5, 6],
          SecondaryNumbers: [7, 8],
        },
      ],
    });

    expect(parseCSVorJSON(input)).toEqual([
      {
        date: "2025-10-27",
        main: [1, 2, 3, 4, 5, 6],
        supp: [7, 8],
      },
    ]);
  });

  it("parses pasted HTML table rows with date and numbers", () => {
    const input = `
      <table>
        <tbody>
          <tr>
            <td>10/27/25</td>
            <td><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span></td>
            <td><span>7</span><span>8</span></td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseCSVorJSON(input)).toEqual([
      {
        date: "10/27/25",
        main: [1, 2, 3, 4, 5, 6],
        supp: [7, 8],
      },
    ]);
  });

  it("parses copied plain-text rows when no CSV header is present", () => {
    const input = `10/27/25 1 2 3 4 5 6 7 8\n10/28/25 9 10 11 12 13 14 15 16`;

    expect(parseCSVorJSON(input)).toEqual([
      {
        date: "10/27/25",
        main: [1, 2, 3, 4, 5, 6],
        supp: [7, 8],
      },
      {
        date: "10/28/25",
        main: [9, 10, 11, 12, 13, 14],
        supp: [15, 16],
      },
    ]);
  });
});
