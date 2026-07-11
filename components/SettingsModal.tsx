"use client";

import { getClockSeverity } from "@/lib/utils";
import type { ClockCheckResult } from "@/lib/types";
import { CheckIcon, WarningIcon } from "@/components/icons";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportBackup: () => void;
  onImportBackup: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSwitchRace: () => void;
  onLock: () => void;
  entryCount: number;
  registrantCount: number;
  raceLabel: string;
  clockCheck: ClockCheckResult | null;
  checkingClock: boolean;
  onCheckClock: () => void;
  isDev: boolean;
  onDevResetOnboarding: () => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  onExportBackup,
  onImportBackup,
  onSwitchRace,
  onLock,
  entryCount,
  registrantCount,
  raceLabel,
  clockCheck,
  checkingClock,
  onCheckClock,
  isDev,
  onDevResetOnboarding,
}: SettingsModalProps) {
  if (!isOpen) return null;

  const clockSeverity = getClockSeverity(clockCheck);

  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
      <div className="bg-chalk rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-display uppercase tracking-tight text-xl text-moss-dark">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="text-ink-soft hover:text-ink text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          {/* Clock Verification */}
          <div className="border-2 border-ink/10 rounded-lg p-4">
            <h3 className="font-bold mb-3 text-ink">System clock check</h3>

            {!clockCheck ? (
              <button
                onClick={onCheckClock}
                disabled={checkingClock}
                className="w-full py-2 bg-clay text-chalk rounded-lg font-semibold hover:bg-clay-dark disabled:opacity-50"
              >
                {checkingClock ? "Checking..." : "Verify system clock"}
              </button>
            ) : (
              <div
                className={`p-3 rounded-lg ${
                  clockSeverity === "fine"
                    ? "bg-success-soft border border-success/40"
                    : clockSeverity === "caution"
                    ? "bg-warning-soft border border-warning/40"
                    : clockSeverity === "alert"
                    ? "bg-danger-soft border border-danger/40"
                    : "bg-sand border border-ink/10"
                }`}
              >
                <div className="font-bold mb-2 flex items-center gap-1.5">
                  {clockSeverity === "fine" ? (
                    <>
                      <CheckIcon className="w-4 h-4 text-success shrink-0" />
                      Clock OK
                    </>
                  ) : clockSeverity === "caution" ? (
                    <>
                      <WarningIcon className="w-4 h-4 text-warning shrink-0" />
                      Minor clock drift
                    </>
                  ) : clockSeverity === "alert" ? (
                    <>
                      <WarningIcon className="w-4 h-4 text-danger shrink-0" />
                      Significant clock drift
                    </>
                  ) : (
                    <>
                      <WarningIcon className="w-4 h-4 text-ink-soft shrink-0" />
                      Unable to verify
                    </>
                  )}
                </div>

                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Your computer:</span>
                    <span className="font-mono">{clockCheck.localTime}</span>
                  </div>
                  {clockCheck.serverTime && (
                    <>
                      <div className="flex justify-between">
                        <span>Internet time:</span>
                        <span className="font-mono">
                          {clockCheck.serverTime}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Difference:</span>
                        <span className="font-mono">
                          {clockCheck.diffSeconds}s
                        </span>
                      </div>
                    </>
                  )}
                  {(clockSeverity === "caution" ||
                    clockSeverity === "alert") && (
                    <div className="text-danger font-semibold">
                      Every recorded finish time will be off by about this
                      much. Fix your device&apos;s clock before scoring.
                    </div>
                  )}
                  {clockCheck.error && (
                    <div className="text-ink-soft italic">
                      {clockCheck.error}
                    </div>
                  )}
                </div>

                <button
                  onClick={onCheckClock}
                  disabled={checkingClock}
                  className="mt-3 w-full py-1 bg-ink/10 rounded font-semibold hover:bg-ink/15 text-sm disabled:opacity-50"
                >
                  {checkingClock ? "Checking..." : "Recheck"}
                </button>
              </div>
            )}
          </div>

          {/* Data Backup */}
          <div className="border-2 border-ink/10 rounded-lg p-4">
            <h3 className="font-bold mb-3 text-ink">Data backup</h3>

            <div className="text-sm text-ink-soft mb-3">
              Current data: {registrantCount} registrants, {entryCount} timing
              entries
            </div>

            <div className="space-y-2">
              <button
                onClick={onExportBackup}
                className="w-full py-2 bg-clay text-chalk rounded-lg font-semibold hover:bg-clay-dark"
              >
                Download backup JSON
              </button>

              <label className="block">
                <span className="w-full py-2 border-2 border-warning text-clay-dark rounded-lg font-semibold hover:bg-warning-soft cursor-pointer flex items-center justify-center">
                  Import backup JSON
                </span>
                <input
                  type="file"
                  accept=".json"
                  onChange={onImportBackup}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Session */}
          <div className="border-2 border-ink/10 rounded-lg p-4">
            <h3 className="font-bold mb-3 text-ink">Session</h3>
            <button
              onClick={onLock}
              className="w-full py-2 bg-moss-dark text-chalk rounded-lg font-semibold hover:bg-moss"
            >
              Lock operator app
            </button>
            <p className="text-xs text-ink-soft mt-2">
              Requires the operator passphrase to unlock again. Data already
              saved locally is unaffected.
            </p>
          </div>

          {/* Danger Zone */}
          <div className="border-2 border-danger/40 rounded-lg p-4 bg-danger-soft">
            <h3 className="font-bold mb-3 text-danger">Danger zone</h3>

            <div className="text-sm text-ink mb-2">
              Currently on: <strong>{raceLabel}</strong> ({registrantCount}{" "}
              registrants, {entryCount} timing entries)
            </div>
            <button
              onClick={onSwitchRace}
              className="w-full py-2 bg-clay text-chalk rounded-lg font-semibold hover:bg-clay-dark"
            >
              Switch to a different race
            </button>
            <p className="text-xs text-ink-soft mt-2">
              On the wrong race, or starting fresh? This clears the local
              working copy and returns to the race menu — this race&apos;s
              cloud backup is untouched and can still be reopened later.
              Warns first if there are unsynced changes.
            </p>

            {isDev && (
              <>
                <button
                  onClick={onDevResetOnboarding}
                  className="w-full py-2 mt-3 bg-moss-dark text-chalk rounded-lg font-semibold hover:bg-moss"
                >
                  [Dev] Reset to blank slate
                </button>
                <p className="text-xs text-ink-soft mt-2">
                  Dev-only, not in production builds. Clears registrants AND
                  finish times, and resets the Check Clock / Load
                  Registrants / Set Wave Times checklist — same state as a
                  freshly created race, but stays on this race id (no new
                  race minted, no trip through the race menu).
                </p>
              </>
            )}
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="mt-6 w-full py-2 bg-ink/10 rounded-lg font-semibold hover:bg-ink/15 text-ink"
        >
          Close
        </button>
      </div>
    </div>
  );
}
