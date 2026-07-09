"use client";

import { useEffect, useState, type ReactNode } from "react";

// Client-side hygiene only — the real boundary is the server validating this
// same passphrase on every privileged request (see docs/race-readiness-design.md
// "Auth model"). Once unlocked, the passphrase is cached locally so the
// operator app keeps working offline; it is not re-checked on every load.
const STORAGE_KEY = "ebdc_operator_passphrase";

export function getStoredPassphrase(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function clearStoredPassphrase(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export default function OperatorGate({ children }: { children: ReactNode }) {
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setPassphrase(getStoredPassphrase());
    setChecked(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: input }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        window.localStorage.setItem(STORAGE_KEY, input);
        setPassphrase(input);
      } else {
        setError(data.error || "Incorrect passphrase.");
      }
    } catch {
      setError(
        "Couldn't reach the server — check your connection and try again. " +
          "The operator app must be unlocked online the first time."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Avoid a flash of the gate before we've had a chance to read localStorage.
  if (!checked) return null;

  if (!passphrase) {
    return (
      <div
        className="min-h-screen p-4 bg-cover bg-center bg-no-repeat bg-fixed flex items-center justify-center"
        style={{ backgroundImage: "url(/timing_bg.webp)" }}
      >
        <form
          onSubmit={handleSubmit}
          className="max-w-sm w-full bg-white rounded-xl shadow-2xl p-8"
        >
          <div className="text-4xl font-bold text-purple-600 mb-1 text-center">
            C510
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-1 text-center">
            Operator Access
          </h1>
          <p className="text-gray-600 text-sm text-center mb-6">
            Enter the operator passphrase to continue.
          </p>

          <input
            type="password"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Passphrase"
            className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 mb-3 focus:border-purple-500 focus:outline-none"
          />

          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !input}
            className="w-full py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50"
          >
            {submitting ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
