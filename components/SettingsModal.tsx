"use client";

import { useState } from "react";
import { verifySystemClock } from "@/lib/utils";
import type { ClockCheckResult } from "@/lib/types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportBackup: () => void;
  onImportBackup: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onResetApp: () => void;
  entryCount: number;
  registrantCount: number;
}

export default function SettingsModal({
  isOpen,
  onClose,
  onExportBackup,
  onImportBackup,
  onResetApp,
  entryCount,
  registrantCount,
}: SettingsModalProps) {
  const [clockCheck, setClockCheck] = useState<ClockCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetTyped, setResetTyped] = useState("");

  if (!isOpen) return null;

  const handleClockCheck = async () => {
    setChecking(true);
    const result = await verifySystemClock();
    setClockCheck(result);
    setChecking(false);
  };

  const handleResetConfirm = () => {
    if (resetTyped !== "RESET") {
      alert('Please type "RESET" to confirm');
      return;
    }
    onResetApp();
    setShowResetConfirm(false);
    setResetTyped("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">⚙️ Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          {/* Clock Verification */}
          <div className="border-2 border-gray-200 rounded-lg p-4">
            <h3 className="font-bold mb-3">⏰ System Clock Check</h3>

            {!clockCheck ? (
              <button
                onClick={handleClockCheck}
                disabled={checking}
                className="w-full py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50"
              >
                {checking ? "Checking..." : "Verify System Clock"}
              </button>
            ) : (
              <div
                className={`p-3 rounded-lg ${
                  clockCheck.ok === true
                    ? "bg-green-50 border border-green-300"
                    : clockCheck.ok === false
                    ? "bg-red-50 border border-red-300"
                    : "bg-yellow-50 border border-yellow-300"
                }`}
              >
                <div className="font-bold mb-2">
                  {clockCheck.ok === true
                    ? "✅ Clock OK"
                    : clockCheck.ok === false
                    ? "⚠️ Clock Drift Detected"
                    : "⚠️ Unable to Verify"}
                </div>

                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Your Computer:</span>
                    <span className="font-mono">{clockCheck.localTime}</span>
                  </div>
                  {clockCheck.serverTime && (
                    <>
                      <div className="flex justify-between">
                        <span>Internet Time:</span>
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
                  {clockCheck.error && (
                    <div className="text-gray-600 italic">
                      {clockCheck.error}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleClockCheck}
                  className="mt-3 w-full py-1 bg-gray-200 rounded font-semibold hover:bg-gray-300 text-sm"
                >
                  Recheck
                </button>
              </div>
            )}
          </div>

          {/* Data Backup */}
          <div className="border-2 border-gray-200 rounded-lg p-4">
            <h3 className="font-bold mb-3">💾 Data Backup</h3>

            <div className="text-sm text-gray-600 mb-3">
              Current data: {registrantCount} registrants, {entryCount} timing
              entries
            </div>

            <div className="space-y-2">
              <button
                onClick={onExportBackup}
                className="w-full py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700"
              >
                📥 Download Backup JSON
              </button>

              <label className="block">
                <span className="w-full py-2 bg-yellow-500 text-gray-900 rounded-lg font-semibold hover:bg-yellow-600 cursor-pointer flex items-center justify-center">
                  📤 Import Backup JSON
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

          {/* Danger Zone */}
          <div className="border-2 border-red-300 rounded-lg p-4 bg-red-50">
            <h3 className="font-bold mb-3 text-red-700">🚨 Danger Zone</h3>

            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="w-full py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
              >
                Reset App & Clear All Data
              </button>
            ) : (
              <div className="space-y-3">
                <div className="text-red-700 text-sm">
                  This will permanently delete:
                  <ul className="list-disc ml-5 mt-1">
                    <li>{registrantCount} registrants</li>
                    <li>{entryCount} timing entries</li>
                    <li>All wave start times</li>
                  </ul>
                </div>

                <div>
                  <label className="block mb-1 font-bold text-sm text-red-700">
                    Type "RESET" to confirm:
                  </label>
                  <input
                    type="text"
                    value={resetTyped}
                    onChange={(e) =>
                      setResetTyped(e.target.value.toUpperCase())
                    }
                    placeholder="RESET"
                    className="w-full p-2 border-2 border-red-300 rounded-lg focus:border-red-500 focus:outline-none"
                    autoFocus
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleResetConfirm}
                    disabled={resetTyped !== "RESET"}
                    className="flex-1 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Confirm Reset
                  </button>
                  <button
                    onClick={() => {
                      setShowResetConfirm(false);
                      setResetTyped("");
                    }}
                    className="flex-1 py-2 bg-gray-400 text-white rounded-lg font-bold hover:bg-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="mt-6 w-full py-2 bg-gray-200 rounded-lg font-semibold hover:bg-gray-300"
        >
          Close
        </button>
      </div>
    </div>
  );
}
