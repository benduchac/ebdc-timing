"use client";

import { useState } from "react";
import type { Registrant } from "@/lib/types";
import { calculateAge, getGenderLabel } from "@/lib/categories";
import { normalizeBib, toDateString } from "@/lib/utils";
import {
  importRegistrants,
  getRegistrantIssues,
  type ImportResult,
} from "@/lib/csvImport";
import { EditIcon, TrashIcon, WarningIcon } from "@/components/icons";
import BibChip from "@/components/BibChip";
import ImportSummaryPanel from "@/components/ImportSummaryPanel";

interface RegistrationTabProps {
  registrants: Map<string, Registrant>;
  onUpdateRegistrants: (registrants: Map<string, Registrant>) => void;
  hasTimingData: boolean;
  // YYYY-MM-DD — anchors the displayed age column to race day rather than
  // today, so it doesn't drift as setup happens over several days. Falls
  // back to today when a race hasn't confirmed wave times yet.
  raceDate?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface EditingRegistrant {
  bib: string;
  status?: "registered" | "spare";
  firstName: string;
  lastName: string;
  wave: "A" | "B" | "C" | null;
  dob: string;
  gender: string;
  firstGravelRace?: string;
  isParent?: string;
  rigidBike?: string;
  steelBike?: string;
  isNew: boolean;
  originalBib?: string; // Track original bib for edits
}

export default function RegistrationTab({
  registrants,
  onUpdateRegistrants,
  hasTimingData,
  raceDate,
}: RegistrationTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"bib" | "name" | "wave">("bib");
  const [editingRegistrant, setEditingRegistrant] =
    useState<EditingRegistrant | null>(null);
  const [deleteConfirmBib, setDeleteConfirmBib] = useState<string | null>(null);
  const [deleteTypedBib, setDeleteTypedBib] = useState("");
  const [lastImport, setLastImport] = useState<ImportResult | null>(null);

  const asOf = raceDate ?? toDateString(new Date());

  const registrantArray = Array.from(registrants.values());
  // Reserved-but-unclaimed spares are numbers, not riders — they get their
  // own list below instead of sitting in the main roster with blank cells.
  const claimedRegistrants = registrantArray.filter((r) => r.status !== "spare");
  const spareRegistrants = registrantArray.filter((r) => r.status === "spare");

  const filteredRegistrants = claimedRegistrants
    .filter((r) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        r.bib.toLowerCase().includes(query) ||
        r.firstName.toLowerCase().includes(query) ||
        r.lastName.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "bib":
          return parseInt(a.bib) - parseInt(b.bib);
        case "name":
          return `${a.lastName} ${a.firstName}`.localeCompare(
            `${b.lastName} ${b.firstName}`
          );
        case "wave":
          // A rider with no wave yet (shouldn't normally happen for a
          // claimed rider, but the type allows it) sorts last, not crashes.
          if (!a.wave) return b.wave ? 1 : 0;
          if (!b.wave) return -1;
          return a.wave.localeCompare(b.wave);
        default:
          return 0;
      }
    });

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (claimedRegistrants.length > 0) {
      const message = hasTimingData
        ? `WARNING: You have active timing data!\n\nUploading a new CSV will REPLACE all ${claimedRegistrants.length} registrants.\n\nExisting timing entries will keep their bib numbers but may no longer match names.\n\nContinue?`
        : `You currently have ${claimedRegistrants.length} registrants loaded.\n\nUploading a new CSV will REPLACE all current registrants.\n\nContinue?`;

      if (!confirm(message)) {
        event.target.value = "";
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const csv = e.target?.result as string;
      const result = importRegistrants(csv);
      setLastImport(result);
      // A refused file (bad header) leaves existing data untouched — the
      // likeliest cause is uploading the wrong file, not an intent to clear
      // the roster.
      if (!result.headerError) {
        onUpdateRegistrants(result.registrants);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const handleAddNew = () => {
    // Find next available bib number — spares are reserved too, so they
    // count toward "already taken" even though they're not in the main list.
    const existingBibs = Array.from(registrants.keys())
      .map((b) => parseInt(b))
      .filter((n) => !isNaN(n));
    const nextBib = existingBibs.length > 0 ? Math.max(...existingBibs) + 1 : 1;

    setEditingRegistrant({
      bib: String(nextBib),
      firstName: "",
      lastName: "",
      wave: "C", // Default to last wave for day-of registrations
      dob: "",
      gender: "",
      isNew: true,
    });
  };

  // Claiming a reserved bib is editing that spare's existing record — same
  // form, same handler, it just starts from mostly-blank fields instead of
  // a fresh guess.
  const handleEdit = (registrant: Registrant) => {
    setEditingRegistrant({
      ...registrant,
      isNew: false,
      originalBib: registrant.bib,
    });
  };

  const handleSaveRegistrant = () => {
    if (!editingRegistrant) return;

    const {
      bib: rawBib,
      firstName,
      lastName,
      wave,
      dob,
      gender,
      firstGravelRace,
      isParent,
      rigidBike,
      steelBike,
      isNew,
      originalBib,
    } = editingRegistrant;

    if (!rawBib || !firstName || !lastName || !wave || !dob || !gender) {
      alert(
        "Please fill in Bib, First Name, Last Name, Wave, Date of birth, and Gender."
      );
      return;
    }

    const bib = normalizeBib(rawBib);

    // Check for duplicate bib (but allow same bib if editing existing)
    if (isNew && registrants.has(bib)) {
      alert(`Bib #${bib} already exists!`);
      return;
    }
    if (!isNew && originalBib !== bib && registrants.has(bib)) {
      alert(`Bib #${bib} already exists!`);
      return;
    }

    const newRegistrants = new Map(registrants);

    // If editing and bib changed, remove old entry
    if (!isNew && originalBib && originalBib !== bib) {
      newRegistrants.delete(originalBib);
    }

    // This form only ever produces a filled-in rider — claiming a spare or
    // adding new both result in "registered", never "spare".
    newRegistrants.set(bib, {
      bib,
      firstName,
      lastName,
      wave,
      dob,
      gender,
      firstGravelRace,
      isParent,
      rigidBike,
      steelBike,
    });

    onUpdateRegistrants(newRegistrants);
    setEditingRegistrant(null);
  };

  const handleDeleteRegistrant = (bib: string) => {
    setDeleteConfirmBib(bib);
    setDeleteTypedBib("");
  };

  const confirmDelete = () => {
    if (!deleteConfirmBib || normalizeBib(deleteTypedBib) !== deleteConfirmBib) {
      alert("Please type the bib number exactly to confirm deletion");
      return;
    }

    const newRegistrants = new Map(registrants);
    newRegistrants.delete(deleteConfirmBib);
    onUpdateRegistrants(newRegistrants);
    setDeleteConfirmBib(null);
    setDeleteTypedBib("");
  };

  // Wave summary counts
  const waveCounts = {
    A: claimedRegistrants.filter((r) => r.wave === "A").length,
    B: claimedRegistrants.filter((r) => r.wave === "B").length,
    C: claimedRegistrants.filter((r) => r.wave === "C").length,
  };

  const ageDisplay = (r: Registrant): string =>
    ISO_DATE.test(r.dob) ? String(calculateAge(r.dob, asOf)) : "—";

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex justify-between items-center">
        <h2 className="font-display uppercase tracking-tight text-2xl text-moss-dark">
          Registration ({claimedRegistrants.length} riders)
        </h2>
        <button
          onClick={handleAddNew}
          className="px-4 py-2 bg-success text-chalk rounded-lg font-bold hover:opacity-90 transition"
        >
          + Add registrant
        </button>
      </div>

      {/* CSV Upload Area */}
      <div
        onClick={() => document.getElementById("csvInput")?.click()}
        className="bg-sand p-6 rounded-lg text-center border-2 border-dashed border-clay/50 cursor-pointer hover:border-clay hover:bg-chalk transition"
      >
        <input
          id="csvInput"
          type="file"
          accept=".csv"
          onChange={handleCSVUpload}
          className="hidden"
        />
        <p className="text-lg font-semibold mb-2 text-ink">
          Click to upload registrants CSV
        </p>
        <p className="text-sm text-ink-soft">
          Header-driven — column order doesn&apos;t matter, column names do.
          See docs/wordpress-registration-form.md section 4.
        </p>
      </div>

      {lastImport && (
        <ImportSummaryPanel
          result={lastImport}
          onDismiss={() => setLastImport(null)}
        />
      )}

      {/* Wave Summary */}
      {claimedRegistrants.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-chalk border border-ink/10 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-moss-dark">
              {waveCounts.A}
            </div>
            <div className="text-sm text-ink-soft">Wave A</div>
          </div>
          <div className="bg-chalk border border-ink/10 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-moss-dark">
              {waveCounts.B}
            </div>
            <div className="text-sm text-ink-soft">Wave B</div>
          </div>
          <div className="bg-chalk border border-ink/10 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-moss-dark">
              {waveCounts.C}
            </div>
            <div className="text-sm text-ink-soft">Wave C</div>
          </div>
        </div>
      )}

      {/* Reserved bibs */}
      {spareRegistrants.length > 0 && (
        <div className="bg-sand border border-ink/10 rounded-lg p-3">
          <h3 className="font-display uppercase tracking-tight text-sm text-moss-dark mb-2">
            Reserved bibs ({spareRegistrants.length} unclaimed)
          </h3>
          <div className="flex flex-wrap gap-2">
            {spareRegistrants
              .sort((a, b) => parseInt(a.bib) - parseInt(b.bib))
              .map((spare) => (
                <button
                  key={spare.bib}
                  onClick={() => handleEdit(spare)}
                  className="flex items-center gap-1.5 pl-1 pr-3 py-1 bg-chalk border border-ink/15 rounded-full hover:border-clay hover:bg-clay/5 transition text-sm font-semibold"
                  title={`Claim reserved bib #${spare.bib}`}
                >
                  <BibChip bib={spare.bib} className="text-xs" />
                  Claim
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Search and Sort */}
      {claimedRegistrants.length > 0 && (
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search by bib, name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 p-2 border-2 border-ink/15 bg-chalk rounded-lg focus:border-clay focus:outline-none"
          />
          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as "bib" | "name" | "wave")
            }
            className="p-2 border-2 border-ink/15 bg-chalk rounded-lg focus:border-clay focus:outline-none"
          >
            <option value="bib">Sort by Bib</option>
            <option value="name">Sort by Name</option>
            <option value="wave">Sort by Wave</option>
          </select>
        </div>
      )}

      {/* Registrant Table */}
      {claimedRegistrants.length > 0 ? (
        <div className="bg-chalk border border-ink/10 rounded-lg overflow-hidden">
          <div className="max-h-[500px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-moss text-chalk sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left font-semibold">Bib</th>
                  <th className="p-3 text-left font-semibold">Name</th>
                  <th className="p-3 text-left font-semibold">Wave</th>
                  <th className="p-3 text-left font-semibold">Age</th>
                  <th className="p-3 text-left font-semibold">Gender</th>
                  <th className="p-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegistrants.map((registrant) => {
                  const issues = getRegistrantIssues(registrant);
                  return (
                    <tr
                      key={registrant.bib}
                      className={`border-b border-ink/10 hover:bg-sand/60 ${
                        issues.length > 0
                          ? "bg-warning-soft border-l-4 border-l-warning"
                          : ""
                      }`}
                    >
                      <td className="p-3">
                        <BibChip bib={registrant.bib} className="text-xs" />
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1.5">
                          {issues.length > 0 && (
                            <WarningIcon
                              className="w-3.5 h-3.5 text-warning shrink-0"
                              // Native title tooltip — the roster can hold
                              // dozens of flagged rows, not worth a custom
                              // popover for.
                            />
                          )}
                          <span title={issues.map((i) => i.message).join(" ")}>
                            {registrant.firstName} {registrant.lastName}
                          </span>
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="inline-block px-2 py-1 rounded bg-sand text-moss-dark font-semibold">
                          {registrant.wave ?? "—"}
                        </span>
                      </td>
                      <td className="p-3">{ageDisplay(registrant)}</td>
                      <td className="p-3">
                        {getGenderLabel(registrant.gender)}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleEdit(registrant)}
                          className="text-moss hover:text-moss-dark mr-3 inline-block align-middle"
                          title="Edit"
                        >
                          <EditIcon />
                        </button>
                        <button
                          onClick={() => handleDeleteRegistrant(registrant.bib)}
                          className="text-danger hover:opacity-70 inline-block align-middle"
                          title="Delete"
                        >
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-sand rounded-lg p-12 text-center border border-ink/10">
          <h3 className="font-display uppercase tracking-tight text-xl text-moss-dark mb-2">
            No registrants yet
          </h3>
          <p className="text-ink-soft mb-4">
            Upload a CSV file or add registrants manually to get started.
          </p>
        </div>
      )}

      {/* Edit/Add Modal */}
      {editingRegistrant && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-chalk rounded-lg shadow-xl max-w-md w-full p-6 my-8">
            <h2 className="font-display uppercase tracking-tight text-xl mb-4 text-moss-dark">
              {editingRegistrant.status === "spare"
                ? `Claim bib #${editingRegistrant.bib}`
                : editingRegistrant.isNew
                ? "Add registrant"
                : "Edit registrant"}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block mb-1 font-semibold text-sm text-ink-soft">
                  Bib number
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editingRegistrant.bib}
                  onChange={(e) =>
                    setEditingRegistrant({
                      ...editingRegistrant,
                      bib: e.target.value,
                    })
                  }
                  className="w-full p-2 border-2 border-ink/15 bg-sand rounded-lg focus:border-clay focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 font-semibold text-sm text-ink-soft">
                    First name
                  </label>
                  <input
                    type="text"
                    value={editingRegistrant.firstName}
                    onChange={(e) =>
                      setEditingRegistrant({
                        ...editingRegistrant,
                        firstName: e.target.value,
                      })
                    }
                    className="w-full p-2 border-2 border-ink/15 bg-sand rounded-lg focus:border-clay focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-semibold text-sm text-ink-soft">
                    Last name
                  </label>
                  <input
                    type="text"
                    value={editingRegistrant.lastName}
                    onChange={(e) =>
                      setEditingRegistrant({
                        ...editingRegistrant,
                        lastName: e.target.value,
                      })
                    }
                    className="w-full p-2 border-2 border-ink/15 bg-sand rounded-lg focus:border-clay focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1 font-semibold text-sm text-ink-soft">
                  Wave
                </label>
                <div className="flex gap-2">
                  {(["A", "B", "C"] as const).map((wave) => (
                    <button
                      key={wave}
                      onClick={() =>
                        setEditingRegistrant({ ...editingRegistrant, wave })
                      }
                      className={`flex-1 py-2 rounded-lg font-bold transition ${
                        editingRegistrant.wave === wave
                          ? "bg-moss text-chalk"
                          : "bg-sand text-ink-soft hover:bg-ink/10"
                      }`}
                    >
                      {wave}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 font-semibold text-sm text-ink-soft">
                    Date of birth
                  </label>
                  <input
                    type="date"
                    value={editingRegistrant.dob}
                    onChange={(e) =>
                      setEditingRegistrant({
                        ...editingRegistrant,
                        dob: e.target.value,
                      })
                    }
                    className="w-full p-2 border-2 border-ink/15 bg-sand rounded-lg focus:border-clay focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-semibold text-sm text-ink-soft">
                    Gender
                  </label>
                  <select
                    value={editingRegistrant.gender}
                    onChange={(e) =>
                      setEditingRegistrant({
                        ...editingRegistrant,
                        gender: e.target.value,
                      })
                    }
                    className="w-full p-2 border-2 border-ink/15 bg-sand rounded-lg focus:border-clay focus:outline-none"
                  >
                    <option value="" disabled>
                      Select…
                    </option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="nonbinary">Nonbinary</option>
                    <option value="undisclosed">Undisclosed</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="font-semibold text-sm text-ink-soft mb-2">
                  Fun award questions
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <YesNoField
                    label="First gravel race?"
                    value={editingRegistrant.firstGravelRace}
                    onChange={(v) =>
                      setEditingRegistrant({
                        ...editingRegistrant,
                        firstGravelRace: v,
                      })
                    }
                  />
                  <YesNoField
                    label="Is a parent?"
                    value={editingRegistrant.isParent}
                    onChange={(v) =>
                      setEditingRegistrant({ ...editingRegistrant, isParent: v })
                    }
                  />
                  <YesNoField
                    label="Rigid bike?"
                    value={editingRegistrant.rigidBike}
                    onChange={(v) =>
                      setEditingRegistrant({ ...editingRegistrant, rigidBike: v })
                    }
                    unsure
                  />
                  <YesNoField
                    label="Steel bike?"
                    value={editingRegistrant.steelBike}
                    onChange={(v) =>
                      setEditingRegistrant({ ...editingRegistrant, steelBike: v })
                    }
                    unsure
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleSaveRegistrant}
                className="flex-1 py-2 bg-clay text-chalk rounded-lg font-bold hover:bg-clay-dark"
              >
                {editingRegistrant.isNew || editingRegistrant.status === "spare"
                  ? "Add registrant"
                  : "Save changes"}
              </button>
              <button
                onClick={() => setEditingRegistrant(null)}
                className="flex-1 py-2 bg-ink/15 text-ink rounded-lg font-bold hover:bg-ink/25"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmBib && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
          <div className="bg-chalk rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="font-display uppercase tracking-tight text-xl mb-2 text-danger">
              Delete registrant
            </h2>

            <div className="mb-4 p-3 bg-danger-soft border-2 border-danger/40 rounded-lg">
              <p className="text-ink">
                Are you sure you want to delete{" "}
                <strong>
                  {registrants.get(deleteConfirmBib)?.status === "spare"
                    ? `reserved bib #${deleteConfirmBib}`
                    : `${registrants.get(deleteConfirmBib)?.firstName} ${
                        registrants.get(deleteConfirmBib)?.lastName
                      }`}
                </strong>
                {registrants.get(deleteConfirmBib)?.status !== "spare" &&
                  ` (Bib #${deleteConfirmBib})`}
                ?
              </p>
              {hasTimingData && (
                <p className="text-danger text-sm mt-2">
                  This rider may have timing entries that will become
                  &quot;Unknown Rider&quot;
                </p>
              )}
            </div>

            <div className="mb-4">
              <label className="block mb-2 font-semibold text-sm text-ink-soft">
                Type &quot;{deleteConfirmBib}&quot; to confirm:
              </label>
              <input
                type="text"
                value={deleteTypedBib}
                onChange={(e) => setDeleteTypedBib(e.target.value)}
                placeholder={deleteConfirmBib}
                className="w-full p-2 border-2 border-ink/15 bg-sand rounded-lg focus:border-danger focus:outline-none"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={confirmDelete}
                disabled={deleteTypedBib !== deleteConfirmBib}
                className="flex-1 py-2 bg-danger text-chalk rounded-lg font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
              <button
                onClick={() => {
                  setDeleteConfirmBib(null);
                  setDeleteTypedBib("");
                }}
                className="flex-1 py-2 bg-ink/15 text-ink rounded-lg font-bold hover:bg-ink/25"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface YesNoFieldProps {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  unsure?: boolean;
}

// Blank/absent means "not eligible," not "unknown" — every option here maps
// to a real value or undefined, never a guessed default.
function YesNoField({ label, value, onChange, unsure }: YesNoFieldProps) {
  return (
    <div>
      <label className="block mb-1 text-xs text-ink-soft">{label}</label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full p-1.5 text-sm border-2 border-ink/15 bg-sand rounded-lg focus:border-clay focus:outline-none"
      >
        <option value="">Skip</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
        {unsure && <option value="unsure">Unsure</option>}
      </select>
    </div>
  );
}
