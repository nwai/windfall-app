import { useEffect, useRef, useState } from "react";

/** Persist committed state, never the first render's closure. */
export function useSettingsPersistence<T>(key: string, snapshot: () => T, restore: (value: T) => void) {
  const callbacks = useRef({ snapshot, restore });
  const restored = useRef(false);
  const lastSaved = useRef<string | null>(null);
  const [status, setStatus] = useState("Started from defaults; subsequent edits use current controls");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { callbacks.current = { snapshot, restore }; });
  useEffect(() => {
    if (!restored.current) {
      restored.current = true;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const value: unknown = JSON.parse(raw);
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid settings snapshot");
          callbacks.current.restore(value as T);
          lastSaved.current = raw;
          setStatus("Restored autosave; subsequent edits use current controls");
        }
      } catch {
        setError("Saved settings could not be restored. Current controls are in use.");
      }
    }
    const save = () => {
      try {
        const raw = JSON.stringify(callbacks.current.snapshot());
        if (raw !== lastSaved.current) {
          localStorage.setItem(key, raw);
          lastSaved.current = raw;
        }
      } catch {
        setError("Settings could not be saved in this browser. Export a state preset before closing.");
      }
    };
    const timer = window.setInterval(save, 2000);
    window.addEventListener("pagehide", save);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", save);
    };
  }, [key]);
  return { status, error, setStatus };
}
