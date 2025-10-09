import React from "react";

interface UserSelectedNumbersPanelProps {
  userSelectedNumbers: number[];
  setUserSelectedNumbers: React.Dispatch<React.SetStateAction<number[]>>;
  title?: string;
  persistKey?: string; // optional localStorage key
}

export const UserSelectedNumbersPanel: React.FC<UserSelectedNumbersPanelProps> = ({
  userSelectedNumbers,
  setUserSelectedNumbers,
  title = "User Selected Numbers (Highlight Only)",
  persistKey = "userSelectedNumbers"
}) => {

  // Optional persistence
  React.useEffect(() => {
    try {
      localStorage.setItem(persistKey, JSON.stringify(userSelectedNumbers));
    } catch { /* ignore storage errors */ }
  }, [userSelectedNumbers, persistKey]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setUserSelectedNumbers(parsed.filter((n: any) => Number.isInteger(n) && n >= 1 && n <= 45));
        }
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (n: number) => {
    setUserSelectedNumbers(prev =>
      prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]
    );
  };

  const clearAll = () => setUserSelectedNumbers([]);

  return (
    <section style={{
      border: "1px solid #eee",
      borderRadius: 8,
      padding: 16,
      background: "#fff",
      marginTop: 16
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
        <div style={{ fontSize: 12, color: "#555" }}>
          Selected: {userSelectedNumbers.length} &nbsp;
          <button
            type="button"
            onClick={clearAll}
            style={{
              padding: "4px 10px",
              border: "1px solid #ccc",
              background: "#fafafa",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12
            }}
            title="Clear all selected highlight numbers"
          >
            Clear
          </button>
        </div>
      </div>
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 10
      }}>
        {Array.from({ length: 45 }, (_, i) => i + 1).map(n => {
          const active = userSelectedNumbers.includes(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => toggle(n)}
                style={{
                  width: 40,
                  padding: "6px 0",
                  borderRadius: 6,
                  border: active ? "2px solid #1976d2" : "1px solid #bbb",
                  background: active ? "#1976d2" : "#fff",
                  color: active ? "#fff" : "#222",
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                  fontSize: 12,
                  transition: "background 0.15s,border 0.15s"
                }}
                title={active ? "Click to remove" : "Click to add"}
              >
                {n}
              </button>
            );
        })}
      </div>
      <div style={{ fontSize: 11, color: "#666", marginTop: 8, lineHeight: 1.4 }}>
        These selections highlight matches in Generated Candidates and show a SelHits count. They DO NOT force inclusion or
        affect weighting (different from forced/trend lists and manual simulation).
      </div>
    </section>
  );
};