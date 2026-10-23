import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Draw } from "../types";
import { clearCsvHistoryTarget, loadCsvHistoryTarget, newerCachedHistoryThanCsv, parseCsvHistoryTarget, readCsvHistoryTarget, saveCsvHistoryTarget, type CsvHistoryTarget } from "../lib/csvHistoryTarget";
import { chooseInitialDrawHistory, type InitialDrawHistoryChoice } from "../lib/initialDrawHistory";
import { loadCachedDrawHistory } from "../lib/historyPersistence";
import { drawsFromRows } from "../lib/drawHistoryReview";
import { loadCsvFallbackDraws } from "../lib/fetchDraws";
import { strictValidateDraws } from "../lib/strictDrawValidation";

export function useCsvHistoryTarget({ onLoad, onMissing, setTrace, historyRevision }: {
  onLoad: (history: Draw[]) => void;
  onMissing: (choice: InitialDrawHistoryChoice) => void;
  setTrace: Dispatch<SetStateAction<string[]>>;
  historyRevision: MutableRefObject<number>;
}) {
  const [target, setTarget] = useState<CsvHistoryTarget | null>(null);
  const [message, setMessage] = useState("Checking remembered CSV target...");
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const revision = useRef(0);

  const loadFallback = useCallback(() => {
    const cached = loadCachedDrawHistory();
    const choice = chooseInitialDrawHistory(cached?.length ? drawsFromRows(cached) : null, loadCsvFallbackDraws(strictValidateDraws));
    if (choice.history.length) onLoad(choice.history); else onMissing(choice);
    const label = choice.source === "cache" ? "saved browser history" : choice.source === "bundled-csv" ? "bundled CSV (src/windfall_history_lottolyzer.csv)" : "no history";
    setTrace(lines => [...lines, `[TRACE] Startup fallback: ${label}; ${choice.history.length} draws. ${choice.reason}`]);
    return choice.history.length ? `Loaded ${label} (${choice.history.length} draws).` : "No draw history loaded.";
  }, [onLoad, onMissing, setTrace]);

  useEffect(() => {
    let cancelled = false;
    const token = revision.current;
    const historyToken = historyRevision.current;
    const isCurrent = () => {
      if (!cancelled && token === revision.current && historyToken !== historyRevision.current) {
        setMessage("Startup CSV preload skipped because draw history was changed during this visit.");
      }
      return !cancelled && token === revision.current && historyToken === historyRevision.current;
    };
    void (async () => {
      let issue = "";
      try {
        const stored = await loadCsvHistoryTarget();
        if (!isCurrent()) return;
        if (stored) {
          setTarget(stored);
          const readable = await readCsvHistoryTarget(stored.handle);
          if (!isCurrent()) return;
          if (readable) {
            const result = parseCsvHistoryTarget(readable.csvText!);
            setTarget(readable);
            const cachedRows = loadCachedDrawHistory();
            const cached = cachedRows?.length ? drawsFromRows(cachedRows) : [];
            const keepNewerCache = newerCachedHistoryThanCsv(result.history, cached);
            onLoad(keepNewerCache ? cached : result.history);
            const sourceNote = keepNewerCache ? ` Using newer saved browser history (${cached.length} draws) so unsynced results are not discarded; update the CSV to sync them.` : "";
            setMessage(`Preloaded CSV target ${readable.fileName}: ${result.history.length} real draws.${sourceNote}${result.removedDuplicates ? ` ${result.removedDuplicates} exact duplicates ignored in memory; file unchanged.` : ""} Startup reads only; no CSV was written.`);
            setTrace(lines => [...lines, `[TRACE] Preloaded remembered CSV target ${readable.fileName}: ${result.history.length} real draws; ${result.removedDuplicates} exact duplicates ignored.${sourceNote} No file write.`]);
            return;
          }
          setNeedsReconnect(true);
          issue = `Remembered CSV target ${stored.fileName} needs file-access permission. Press Reconnect CSV. `;
        }
      } catch (error) {
        if (!isCurrent()) return;
        setNeedsReconnect(true);
        issue = `CSV target was not preloaded: ${error instanceof Error ? error.message : String(error)} `;
      }
      if (isCurrent()) setMessage(issue + loadFallback());
    })();
    return () => { cancelled = true; };
  }, [historyRevision, loadFallback, onLoad, setTrace]);

  const remember = useCallback(async (next: CsvHistoryTarget) => {
    const token = ++revision.current;
    setTarget(next); setNeedsReconnect(false);
    setMessage(`CSV target ${next.fileName} selected for saves and startup. Selecting a target does not replace currently loaded history.`);
    try {
      await saveCsvHistoryTarget(next.handle);
      if (token === revision.current) setMessage(`CSV target ${next.fileName} remembered for startup in this browser address/profile. Selecting a target does not replace currently loaded history.`);
    } catch (error) {
      if (token === revision.current) setMessage(`CSV target ${next.fileName} is available for this visit only; it could not be remembered. ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  const reload = useCallback(async () => {
    if (!target) return;
    const token = ++revision.current;
    const historyToken = historyRevision.current;
    try {
      const readable = await readCsvHistoryTarget(target.handle, true);
      if (token !== revision.current || historyToken !== historyRevision.current) return;
      if (!readable) { setNeedsReconnect(true); setMessage(`Permission was not granted for ${target.fileName}. Loaded history was not changed.`); return; }
      const result = parseCsvHistoryTarget(readable.csvText!);
      setTarget(readable); setNeedsReconnect(false);
      onLoad(result.history);
      setMessage(`Loaded CSV target ${readable.fileName}: ${result.history.length} real draws. No CSV was written.`);
      setTrace(lines => [...lines, `[TRACE] Reloaded CSV target ${readable.fileName}: ${result.history.length} real draws; ${result.removedDuplicates} exact duplicates ignored; no file write.`]);
    } catch (error) {
      if (token !== revision.current) return;
      setNeedsReconnect(true);
      setMessage(`CSV target could not be loaded. Loaded history was not changed. ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [historyRevision, onLoad, setTrace, target]);

  const forget = useCallback(async () => {
    const token = ++revision.current;
    try {
      await clearCsvHistoryTarget();
      if (token !== revision.current) return;
      setTarget(null); setNeedsReconnect(false);
      setMessage("CSV target forgotten. The file and currently loaded draw history were not changed; next startup uses the normal bundled/cache fallback.");
    } catch (error) { setMessage(`Could not forget the CSV target. ${error instanceof Error ? error.message : String(error)}`); }
  }, []);

  return { target, message, needsReconnect, remember, reload, forget };
}
