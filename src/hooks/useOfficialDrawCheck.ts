import { useEffect, useRef, useState } from "react";
import type { DrawRow } from "../lib/drawHistory";
import { checkOfficialDrawResult, type OfficialDrawCheck } from "../lib/officialDrawResults";
import { validateDrawEntry } from "../lib/drawHistoryValidation";

export function useOfficialDrawCheck(row: DrawRow) {
  const key = JSON.stringify([row.date, row.mains, row.supps, !!row.isSimulated]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const request = useRef<AbortController | null>(null);
  const [record, setRecord] = useState<{ key: string; result: OfficialDrawCheck } | null>(null);
  const [checkingKey, setCheckingKey] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  useEffect(() => {
    setCheckingKey(null); setRecord(null); setManualKey(null);
    return () => request.current?.abort();
  }, [key]);
  const result = record?.key === key ? record.result : null;
  const checking = checkingKey === key;
  const valid = !row.isSimulated && validateDrawEntry({ date: row.date, mains: row.mains.map(String), supps: row.supps.map(String) },
    { mainCount: 6, suppCount: 2, minNumber: 1, maxNumber: 45, outputDateFormat: "iso" }).ok;
  const check = async () => {
    if (!valid || checking) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setCheckingKey(key); setRecord(null); setManualKey(null);
    const next = await checkOfficialDrawResult(row, controller.signal);
    if (controller.signal.aborted || currentKey.current !== key) return;
    setRecord({ key, result: next }); setCheckingKey(null);
  };
  return { result, checking, valid, check, manualConfirmed: manualKey === key,
    confirmManual: (confirmed: boolean) => setManualKey(confirmed ? key : null),
    allowSave: valid && !checking && (result?.status === "matched" || (result?.status === "unavailable" && manualKey === key)),
  };
}
