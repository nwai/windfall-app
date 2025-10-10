import React, { useState, useEffect } from "react";

export function DraggableXOverlay({
  centerDateNum,
  setCenterDateNum,
  yMin,
  setYMin,
  xScale,
  yScale,
  xSpanDays = 14,
  ySpanNumbers = 12,
}) {
  // Track drag state
  const [drag, setDrag] = useState(null);

  // Calculate bounds
  const halfXMs = (xSpanDays * 24 * 60 * 60 * 1000) / 2;
  const halfYN = ySpanNumbers / 2;

  // Top left and bottom right in data coords
  const x0 = centerDateNum - halfXMs;
  const x1 = centerDateNum + halfXMs;
  const y0 = yMin + halfYN;
  const y1 = yMin + ySpanNumbers - halfYN;

  // For a big "X," stretch across the rectangle
  const sx0 = xScale(x0);
  const sx1 = xScale(x1);
  const sy0 = yScale(y0);
  const sy1 = yScale(y1);

  function handleMouseDown(e) {
    setDrag({
      startX: e.clientX,
      startY: e.clientY,
      origCenter: centerDateNum,
      origYMin: yMin,
    });
    e.stopPropagation();
  }

  useEffect(() => {
    function onMove(e) {
      if (!drag) return;
      // Move in data units
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      // Estimate ms per px and numbers per px
      const msPerPx =
        xScale.invert
          ? xScale.invert(xScale(centerDateNum) + 1) - centerDateNum
          : 24 * 60 * 60 * 1000 / 80;
      const nPerPx =
        yScale.invert
          ? yScale.invert(yScale(yMin) + 1) - yMin
          : 1;
      setCenterDateNum(drag.origCenter + dx * msPerPx);
      setYMin(drag.origYMin + dy * nPerPx);
    }
    function onUp() {
      setDrag(null);
    }
    if (drag) {
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
    }
  }, [drag, centerDateNum, yMin, xScale, yScale, setCenterDateNum, setYMin]);

  return (
    <g
      style={{ cursor: "move", pointerEvents: "all" }}
      onMouseDown={handleMouseDown}
    >
      <line
        x1={sx0}
        y1={sy0}
        x2={sx1}
        y2={sy1}
        stroke="deepskyblue"
        strokeWidth={8}
        strokeOpacity={0.7}
      />
      <line
        x1={sx0}
        y1={sy1}
        x2={sx1}
        y2={sy0}
        stroke="deepskyblue"
        strokeWidth={8}
        strokeOpacity={0.7}
      />
    </g>
  );
}