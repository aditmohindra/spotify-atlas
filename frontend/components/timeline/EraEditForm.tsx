"use client";

import { useState } from "react";
import { patchEra, ApiError } from "@/lib/api";
import type { Era } from "@/lib/types";
import { defaultEraTitle, displayTitle } from "./timelineUtils";

export interface EraEditFormProps {
  era: Era;
  onUpdate: (eraId: number, patch: Partial<Era>) => void;
}

export function EraEditForm({ era, onUpdate }: EraEditFormProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMood, setEditMood] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const defaultTitle = defaultEraTitle(era.era_number);

  const openEdit = () => {
    setEditTitle(era.title ?? defaultTitle);
    setEditDescription(era.description ?? "");
    setEditMood(era.mood ?? "");
    setSaveError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      setSaveError("Title is required.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const res = await patchEra(era.era_id, {
        title: trimmedTitle,
        description: editDescription.trim() || undefined,
        mood: editMood.trim() || undefined,
      });

      onUpdate(era.era_id, {
        title: res.title,
        description: res.description,
        mood: res.mood,
        is_named: true,
      });
      setEditing(false);
    } catch (err) {
      setSaveError(
        err instanceof ApiError
          ? `Save failed (${err.status}). Try again.`
          : "Save failed. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={openEdit}
        className="font-ui text-xs px-3 py-1.5 rounded-full border transition-colors hover:bg-white/10"
        style={{
          color: "rgba(255,255,255,0.5)",
          borderColor: "rgba(255,255,255,0.12)",
        }}
      >
        Edit title & notes
      </button>
    );
  }

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div>
        <label
          htmlFor={`era-title-${era.era_id}`}
          className="font-ui text-[10px] font-semibold tracking-[0.1em] uppercase block mb-1.5"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          Title
        </label>
        <input
          id={`era-title-${era.era_id}`}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder={defaultTitle}
          className="w-full font-ui text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green/40"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "#ffffff",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        />
      </div>
      <div>
        <label
          htmlFor={`era-desc-${era.era_id}`}
          className="font-ui text-[10px] font-semibold tracking-[0.1em] uppercase block mb-1.5"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          Description
        </label>
        <textarea
          id={`era-desc-${era.era_id}`}
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          rows={2}
          placeholder="What defined this chapter?"
          className="w-full font-ui text-sm rounded-lg px-3 py-2 outline-none resize-y"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.75)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        />
      </div>
      <div>
        <label
          htmlFor={`era-mood-${era.era_id}`}
          className="font-ui text-[10px] font-semibold tracking-[0.1em] uppercase block mb-1.5"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          Mood
        </label>
        <input
          id={`era-mood-${era.era_id}`}
          type="text"
          value={editMood}
          onChange={(e) => setEditMood(e.target.value)}
          placeholder="e.g. restless, nostalgic"
          className="w-full font-ui text-sm rounded-lg px-3 py-2 outline-none"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.75)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        />
      </div>
      {saveError && (
        <p className="font-ui text-sm" style={{ color: "#f87171" }}>
          {saveError}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="font-ui text-sm font-medium px-4 py-2 rounded-full disabled:opacity-50"
          style={{ background: "#1db954", color: "#ffffff" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          disabled={saving}
          className="font-ui text-sm px-4 py-2 rounded-full border disabled:opacity-50"
          style={{
            color: "rgba(255,255,255,0.55)",
            borderColor: "rgba(255,255,255,0.12)",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Read-only title line with edit affordance for hero headers. */
export function EraTitleLine({ era }: { era: Era }) {
  return (
    <span className="font-hero" style={{ color: "#ffffff" }}>
      {displayTitle(era)}
    </span>
  );
}
