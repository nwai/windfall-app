import React, { useMemo } from "react";
import type { Draw } from "../types";
import { drawHistoryTerminalComposition } from "../lib/drawHistory";
import { sortDrawsChronologically } from "../lib/recentDraws";
import { datePartsToIso, parseDrawDateParts } from "../lib/planningDrawContext";
import { InfoHelp } from "./shared/HigControls";
import "./DrawHistoryTable.css";

interface Props {
  draws: Draw[];
  ogaHistory: Draw[];
  ogaScores: readonly (number | null | undefined)[];
}

function DrawHistoryTable({ draws, ogaHistory, ogaScores }: Props) {
  const rows = useMemo(() => {
    const scores = new Map(ogaHistory.map((draw, index) => [draw, ogaScores[index]]));
    return sortDrawsChronologically(draws).reverse().map((draw) => {
      const { shape, runs } = drawHistoryTerminalComposition(draw.main, draw.supp);
      const score = draw.isSimulated ? null : scores.get(draw);
      const odd = [...draw.main, ...draw.supp].filter((number) => number % 2 === 1).length;
      return { draw, shape, runs, ratio: shape ? `${odd}:${8 - odd}` : null,
        oga: typeof score === "number" && Number.isFinite(score) ? score : null };
    });
  }, [draws, ogaHistory, ogaScores]);
  return <div className="draw-history-table">
    <div className="draw-history-table__scope">
      <span>{draws.length} rows in the active WFMQYH view</span>
      <InfoHelp label="About draw history columns">
        Terminal shape and terminal runs describe all six mains plus two supplementary numbers. They use the same definitions as Draw Composition Quotas: repetitions form the shape, and runs are exact, maximal and circular. Separate runs are never split into overlapping sub-runs. None means the valid draw has no run of two or more endings; a dash means the value is unavailable.
        OGA is calculated using the active real history and is not stored in the draw-history CSV. Simulated rows are explicitly labelled and are never written as official CSV history. The CSV stores terminal_shape and terminal_runs as derived fields and recalculates them when saving; imported diagnostic text is not treated as draw numbers or trusted evidence. CSV files contain data, not alignment. This table supplies the right-aligned display.
      </InfoHelp>
    </div>
    <div className="draw-history-table__scroll" role="region" aria-label="Draw history results" tabIndex={0}>
      <table>
        <thead><tr>{["Date", "Mains (6)", "Supps (2)", "OGA", "Odd/Even", "Terminal shape", "Terminal runs"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(({ draw, shape, runs, oga, ratio }, index) => {
          const date = parseDrawDateParts(draw.date);
          return <tr key={`${draw.date}-${index}`} data-history-date={draw.date}>
            <th scope="row">{date ? <time dateTime={datePartsToIso(date)}>{draw.date}</time> : draw.date}{draw.isSimulated && <span className="draw-history-table__simulated">Simulated</span>}</th>
            <td className="draw-history-table__mains">{draw.main.join(", ")}</td><td className="draw-history-table__supps">{draw.supp.join(", ")}</td>
            <td>{oga === null ? "\u2014" : oga.toFixed(2)}</td><td>{ratio ?? "\u2014"}</td>
            <td>{shape ?? "\u2014"}</td><td>{runs === null ? "\u2014" : runs.length ? runs.join(" \u00b7 ") : "None"}</td>
          </tr>;
        })}</tbody>
      </table>
      {!rows.length && <p className="draw-history-table__empty">No draw rows in the active view.</p>}
    </div>
  </div>;
}

export default React.memo(DrawHistoryTable);
