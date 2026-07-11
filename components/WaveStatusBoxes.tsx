"use client";

import { useState, useEffect } from "react";
import type { Entry } from "@/lib/types";
import { formatElapsedTime } from "@/lib/utils";
import { EditIcon } from "@/components/icons";

interface WaveStatusBoxesProps {
  waveStartTimes: { A: Date; B: Date; C: Date };
  entries: Entry[];
  registrants: Map<string, { wave: "A" | "B" | "C" }>;
  onEditWaveTime: (wave: "A" | "B" | "C") => void; // ← ADD THIS LINE
}

export default function WaveStatusBoxes({
  waveStartTimes,
  entries,
  registrants,
  onEditWaveTime,
}: WaveStatusBoxesProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Count total registered riders per wave
  const totalByWave = { A: 0, B: 0, C: 0 };
  registrants.forEach((rider) => {
    totalByWave[rider.wave]++;
  });

  // Count finished riders per wave
  const finishedByWave = {
    A: entries.filter((e) => e.wave === "A").length,
    B: entries.filter((e) => e.wave === "B").length,
    C: entries.filter((e) => e.wave === "C").length,
  };

  const waves: Array<"A" | "B" | "C"> = ["A", "B", "C"];

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      {waves.map((wave) => {
        const elapsed = currentTime.getTime() - waveStartTimes[wave].getTime();
        const elapsedStr = formatElapsedTime(elapsed);
        const finished = finishedByWave[wave];
        const total = totalByWave[wave];
        const startTimeStr = waveStartTimes[wave].toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        });

        return (
          <button
            key={wave}
            onClick={() => onEditWaveTime(wave)}
            className="bg-chalk border-2 border-moss/30 rounded-lg p-3 text-center hover:border-moss transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="font-display uppercase tracking-tight text-sm text-moss-dark">
                Wave {wave}
              </div>
              <div className="text-moss opacity-0 group-hover:opacity-100 transition-opacity">
                <EditIcon className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-ink mb-1 font-mono tabular-nums">
              {elapsedStr}
            </div>
            <div className="text-xs text-moss-dark mb-1 font-semibold">
              {finished}/{total} finished
            </div>
            <div className="text-xs text-ink-soft font-mono">
              Started: {startTimeStr}
            </div>
            <div className="text-xs text-ink-soft/70 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Click to edit start time
            </div>
          </button>
        );
      })}
    </div>
  );
}
