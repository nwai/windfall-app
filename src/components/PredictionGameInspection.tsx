import React, { useMemo, useState } from "react";
import type { Draw } from "../types";
import type { PredictionGameHistory } from "../lib/predictionGameHistory";
import { analyzePredictionGameHistory } from "../lib/predictionGameHistory";
import { predictionCaptureGameReasons, scorePredictionCaptureBatch, type PredictionCaptureBatch, type PredictionCapturePlayedGame } from "../lib/predictionCapture";
import { formatPredictionSelectionReasons } from "../lib/predictionSelectionReasons";
import { HigButton } from "./shared/HigControls";
import { InlineCollapsibleCard } from "./shared/InlineCollapsibleCard";
import "./PredictionGameInspection.css";

export const PredictionGameHistoryOverview: React.FC<{ analysis: PredictionGameHistory; games: PredictionCapturePlayedGame[] }> = ({ analysis, games }) => {
  const matchingGames = games.filter(game => analysis.matchesByGame[game.mainKey]?.length);
  return <section className="prediction-game-history" aria-label="Per-game matches and across-games coverage">
    <strong>{matchingGames.length ? `Historical D1/D2 match in ${matchingGames.length} individual game${matchingGames.length === 1 ? "" : "s"}` : "No individual game has a historical D1/D2 match"}</strong>
    <div>{analysis.checkedDraws} valid real draws through {analysis.cutoffDate ?? "unavailable cutoff"}. {analysis.skippedDraws} invalid, simulated, off-schedule or duplicate-date rows excluded.</div>
    {analysis.portfolioCoverage.length ? <InlineCollapsibleCard
      title="Historical winning numbers covered across multiple games"
      subtitle={`${analysis.portfolioCoverage.length} historical draw${analysis.portfolioCoverage.length === 1 ? "" : "s"} · coverage only, not a prize`}>
      <div className="prediction-game-history__scroll">
        {analysis.portfolioCoverage.map(row => <div key={row.date} className="prediction-game-history__record">
          <strong>{row.date}</strong> · {row.mainHits.length} mains / {row.suppHits.length} supps across the games
          <div><span className="prediction-game-history__main">Mains covered: {row.mainHits.join(", ")}</span>{" · "}<span className="prediction-game-history__supp">Supps covered: {row.suppHits.join(", ") || "none"}</span></div>
          <div>Contributing games: {row.contributingGames.map(game => `Game ${games.findIndex(item => item.mainKey === game.gameKey) + 1}`).join(", ")}.</div>
          {row.contributingGames.map(game => <div key={game.gameKey}>
            Game {games.findIndex(item => item.mainKey === game.gameKey) + 1}: <span className="prediction-game-history__main">main hits {game.numbers.filter(number => row.mainHits.includes(number)).join(", ") || "none"}</span>{" · "}
            <span className="prediction-game-history__supp">supp hits {game.numbers.filter(number => row.suppHits.includes(number)).join(", ") || "none"}</span>
          </div>)}
        </div>)}
      </div>
    </InlineCollapsibleCard> : <div>No combined-pool coverage meeting the 6-main or 5-main-plus-supp threshold was found without an individual D1/D2 match.</div>}
    <div className="prediction-game-history__note">Across-games coverage counts distinct numbers once, even if repeated in several games. It is not a prize. Larger combined pools cover more numbers; neither this observation nor a historical match establishes a predictive advantage.</div>
  </section>;
};

export const PredictionGameInspection: React.FC<{
  game: PredictionCapturePlayedGame;
  index: number;
  batch: PredictionCaptureBatch;
  analysis: PredictionGameHistory;
  targetDraw?: Draw;
  onSimulate?: (numbers: number[]) => void;
}> = ({ game, index, batch, analysis, targetDraw, onSimulate }) => {
  const hits = analysis.matchesByGame[game.mainKey] ?? [];
  const targetScore = targetDraw ? scorePredictionCaptureBatch(batch, targetDraw)?.gameScores.find(row => row.gameId === game.id) : undefined;
  return <section className="prediction-game-inspection" aria-label={`Inspect game ${index + 1}`}>
    <div className="prediction-game-inspection__heading"><strong>Game {index + 1}: <span className="prediction-game-history__main">{game.numbers.join(", ")}</span></strong>
      {onSimulate ? <HigButton size="compact" onClick={() => onSimulate(game.numbers.slice())}>Simulate in DGA</HigButton> : null}</div>
    <div><strong>{game.selectionReasonOverride !== undefined ? "Custom reasons" : "Shared reasons"}:</strong> {formatPredictionSelectionReasons(predictionCaptureGameReasons(batch, game)) || "No reasons recorded"}</div>
    <div><strong>Source:</strong> {game.provenance.status === "matched" ? `Exact captured-row match; ${game.provenance.runIds.length} recorded run link(s).` : "External / unknown; reasons are user-declared."}</div>
    {targetScore ? <div><strong>Real target {targetDraw!.date}:</strong> {targetScore.mainHits} main / {targetScore.suppHits} supp · {targetScore.division === "—" ? "No prize" : targetScore.division}</div> : <div>Target score: pending a real target draw.</div>}
    <div><strong>Historical D1/D2 matches for this game:</strong> {hits.length}</div>
    {hits.length ? <div className="prediction-game-history__scroll">{hits.slice().reverse().map(hit => <div key={hit.date} className="prediction-game-history__record">
      <strong>{hit.division} · {hit.date}</strong> · {hit.mainHits.length} main / {hit.suppHits.length} supp
      <div><span className="prediction-game-history__main">Drawn mains: {hit.drawnMain.join(", ")}</span>{" · "}<span className="prediction-game-history__supp">Drawn supps: {hit.drawnSupp.join(", ")}</span></div>
    </div>)}</div> : <div>No individual D1/D2 match through {analysis.cutoffDate ?? "the available cutoff"}.</div>}
    {onSimulate ? <div className="prediction-game-history__note">Simulation uses these six mains only. No supplementary choices are invented, and no real history or saved entry is changed.</div> : null}
  </section>;
};

export const PredictionGameReview: React.FC<{
  batch: PredictionCaptureBatch;
  history: Draw[];
  cutoffDate: string;
  targetDraw?: Draw;
  onSimulate?: (numbers: number[]) => void;
}> = ({ batch, history, cutoffDate, targetDraw, onSimulate }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const analysis = useMemo(() => analyzePredictionGameHistory(history, batch.games, cutoffDate), [history, batch.games, cutoffDate]);
  const game = batch.games.find(row => row.mainKey === selected);
  return <div className="prediction-game-review">
    <PredictionGameHistoryOverview analysis={analysis} games={batch.games} />
    <div className="prediction-game-review__choices" role="group" aria-label="Choose a game to inspect">
      {batch.games.map((row, index) => <HigButton key={row.mainKey} size="compact" aria-pressed={selected === row.mainKey}
        aria-label={`Inspect game ${index + 1}: ${row.numbers.join(", ")}`} onClick={() => setSelected(current => current === row.mainKey ? null : row.mainKey)}>
        Game {index + 1} · <span className="prediction-game-history__main">{row.numbers.join(", ")}</span>
      </HigButton>)}
    </div>
    {game ? <PredictionGameInspection game={game} index={batch.games.indexOf(game)} batch={batch} analysis={analysis} targetDraw={targetDraw} onSimulate={onSimulate} /> : null}
  </div>;
};
