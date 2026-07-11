"use client";

import { useEffect, useState, type ReactNode } from "react";
import TrailHero from "./TrailHero";

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
      <div className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-sm w-full rounded-2xl overflow-hidden shadow-xl border border-ink/10">
          <TrailHero title="Operator Access" compact />
          <form onSubmit={handleSubmit} className="bg-chalk p-6 sm:p-8">
            <p className="text-ink-soft text-sm text-center mb-6">
              Enter the operator passphrase to continue.
            </p>

            <input
              type="password"
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Passphrase"
              className="w-full border-2 border-ink/15 bg-sand rounded-lg px-3 py-2 mb-3 focus:border-clay focus:outline-none"
            />

            {error && <p className="text-danger text-sm mb-3">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !input}
              className="w-full py-3 bg-clay text-chalk rounded-lg font-bold hover:bg-clay-dark disabled:opacity-50"
            >
              {submitting ? "Checking…" : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
