// apps/web/app/(app)/interview-toolkit/star-stories/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";

import { InstrumentShell } from "@/app/(app)/ui/InstrumentShell";
import { ttrComponents, ttrLayout, ttrTypography } from "@/app/(app)/ui/ttrStyles";
import type { StarStoryDto, StarStoryFormPayload } from "@/lib/starStoriesClient";
import { createStarStory, deleteStarStory, listStarStories, updateStarStory } from "@/lib/starStoriesClient";

type UiStarStory = {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflections?: string;
  competencies: string[];
  updatedAt?: string;
};

type FormState = Omit<StarStoryFormPayload, "competencies" | "reflections"> & {
  reflections: string;
  competenciesInput: string;
};

const initialFormState: FormState = {
  title: "",
  situation: "",
  task: "",
  action: "",
  result: "",
  reflections: "",
  competenciesInput: "",
};

function normalizeCompetencies(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : "")).filter(Boolean);
}

function normalizeStory(raw: StarStoryDto): UiStarStory {
  const story = raw as Record<string, unknown>;

  return {
    id: asString(story.id),
    title: asString(story.title),
    situation: asString(story.situation),
    task: asString(story.task),
    action: asString(story.action),
    result: asString(story.result),
    reflections: typeof story.reflections === "string" ? story.reflections : undefined,
    competencies: asStringArray(story.competencies),
    updatedAt: typeof story.updatedAt === "string" ? story.updatedAt : undefined,
  };
}

const dangerButtonStyle = {
  ...ttrComponents.secondaryButton,
  borderColor: "rgba(248,113,113,0.65)",
  background: "rgba(248,113,113,0.15)",
  color: "#fecdd3",
};

export default function StarStoriesPage() {
  const [stories, setStories] = useState<UiStarStory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<UiStarStory | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadStories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listStarStories();
      const normalized = data.map(normalizeStory).filter((story) => story.id.trim().length > 0);
      setStories(normalized);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load STAR stories");
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  const resetForm = () => {
    setFormState(initialFormState);
    setFormErrors({});
    setEditingId(null);
  };

  const handleEdit = (story: UiStarStory) => {
    setStatusMessage(null);
    setEditingId(story.id);
    setFormState({
      title: story.title,
      situation: story.situation,
      task: story.task,
      action: story.action,
      result: story.result,
      reflections: story.reflections ?? "",
      competenciesInput: (story.competencies ?? []).join(", "),
    });
  };

  const handleCancelEdit = () => {
    resetForm();
  };

  const validateForm = (state: FormState) => {
    const errors: Record<string, string> = {};
    ["title", "situation", "task", "action", "result"].forEach((field) => {
      if (!(state as Record<string, string>)[field]?.trim()) {
        errors[field] = "This field is required.";
      }
    });
    return errors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedState: FormState = {
      ...formState,
      title: formState.title.trim(),
      situation: formState.situation.trim(),
      task: formState.task.trim(),
      action: formState.action.trim(),
      result: formState.result.trim(),
      reflections: formState.reflections.trim(),
    };

    const validation = validateForm(trimmedState);
    if (Object.keys(validation).length) {
      setFormErrors(validation);
      return;
    }

    const payload: StarStoryFormPayload = {
      title: trimmedState.title,
      situation: trimmedState.situation,
      task: trimmedState.task,
      action: trimmedState.action,
      result: trimmedState.result,
      reflections: trimmedState.reflections ? trimmedState.reflections : undefined,
      competencies: normalizeCompetencies(trimmedState.competenciesInput),
    };

    setSaving(true);
    setFormErrors({});
    setStatusMessage(null);

    try {
      if (editingId) {
        await updateStarStory(editingId, payload);
        setStatusMessage("STAR story updated.");
      } else {
        await createStarStory(payload);
        setStatusMessage("STAR story added.");
      }

      resetForm();
      await loadStories();

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("starStories.updated"));
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save STAR story.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (story: UiStarStory) => {
    setDeleteError(null);
    setPendingDelete(story);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      await deleteStarStory(pendingDelete.id);
      setStatusMessage("STAR story deleted.");
      setPendingDelete(null);
      await loadStories();

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("starStories.updated"));
      }
    } catch (removeError) {
      setDeleteError(removeError instanceof Error ? removeError.message : "Unable to delete STAR story.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const competenciesLabel = useMemo(() => "Separate competencies with commas.", []);

  return (
    <InstrumentShell
      kicker="Interview Toolkit"
      title="STAR stories"
      subtitle="Capture your go to stories and weave them into every interview flow."
      rightSlot={
        <Link href="/interview-toolkit" style={{ color: "#93c5fd", textDecoration: "underline" }}>
          Back to toolkit
        </Link>
      }
    >
      <div style={ttrLayout.panelsRow}>
        <section style={{ ...ttrComponents.basePanel, flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <span style={ttrTypography.subtleLabel}>New story</span>
            <h2 style={ttrTypography.h2}>{editingId ? "Edit story" : "Add story"}</h2>
          </div>

          {error && <div style={ttrComponents.dangerBox}>{error}</div>}
          {statusMessage && <div style={ttrComponents.successBox}>{statusMessage}</div>}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={ttrComponents.fieldLabel} htmlFor="storyTitle">
                Title
              </label>
              <input
                id="storyTitle"
                value={formState.title}
                onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                style={ttrComponents.input}
                placeholder="E.g. Leading a large scale migration"
              />
              {formErrors.title ? <div style={ttrComponents.dangerBox}>{formErrors.title}</div> : null}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={ttrComponents.fieldLabel} htmlFor="storySituation">
                Situation
              </label>
              <textarea
                id="storySituation"
                value={formState.situation}
                onChange={(event) => setFormState((prev) => ({ ...prev, situation: event.target.value }))}
                style={ttrComponents.textArea}
                rows={3}
              />
              {formErrors.situation ? <div style={ttrComponents.dangerBox}>{formErrors.situation}</div> : null}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={ttrComponents.fieldLabel} htmlFor="storyTask">
                Task
              </label>
              <textarea
                id="storyTask"
                value={formState.task}
                onChange={(event) => setFormState((prev) => ({ ...prev, task: event.target.value }))}
                style={ttrComponents.textArea}
                rows={2}
              />
              {formErrors.task ? <div style={ttrComponents.dangerBox}>{formErrors.task}</div> : null}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={ttrComponents.fieldLabel} htmlFor="storyAction">
                Action
              </label>
              <textarea
                id="storyAction"
                value={formState.action}
                onChange={(event) => setFormState((prev) => ({ ...prev, action: event.target.value }))}
                style={ttrComponents.textArea}
                rows={3}
              />
              {formErrors.action ? <div style={ttrComponents.dangerBox}>{formErrors.action}</div> : null}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={ttrComponents.fieldLabel} htmlFor="storyResult">
                Result
              </label>
              <textarea
                id="storyResult"
                value={formState.result}
                onChange={(event) => setFormState((prev) => ({ ...prev, result: event.target.value }))}
                style={ttrComponents.textArea}
                rows={2}
              />
              {formErrors.result ? <div style={ttrComponents.dangerBox}>{formErrors.result}</div> : null}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={ttrComponents.fieldLabel} htmlFor="storyReflections">
                Reflections
              </label>
              <textarea
                id="storyReflections"
                value={formState.reflections}
                onChange={(event) => setFormState((prev) => ({ ...prev, reflections: event.target.value }))}
                style={ttrComponents.textArea}
                rows={2}
              />
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={ttrComponents.fieldLabel} htmlFor="storyCompetencies">
                Competencies
              </label>
              <input
                id="storyCompetencies"
                value={formState.competenciesInput}
                onChange={(event) => setFormState((prev) => ({ ...prev, competenciesInput: event.target.value }))}
                style={ttrComponents.input}
                placeholder="Examples: leadership, analytics"
              />
              <div style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>{competenciesLabel}</div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  ...ttrComponents.primaryButton,
                  padding: "10px 14px",
                  opacity: saving ? 0.6 : 1,
                  cursor: saving ? "wait" : "pointer",
                }}
              >
                {saving ? "Saving…" : editingId ? "Update story" : "Add story"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  style={{ ...ttrComponents.secondaryButton, padding: "10px 14px" }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section style={{ ...ttrComponents.basePanel, flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <span style={ttrTypography.subtleLabel}>Library</span>
            <h2 style={ttrTypography.h2}>Your STAR stories</h2>
          </div>

          {loading ? (
            <div style={ttrComponents.warningBox}>Loading saved stories…</div>
          ) : !stories.length ? (
            <div style={ttrComponents.warningBox}>No STAR stories yet. Add one to start building your library.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {stories.map((story) => (
                <article
                  key={story.id}
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.3)",
                    padding: 14,
                    background: "rgba(15,23,42,0.6)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>{story.title}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(226,232,240,0.7)" }}>
                        {story.updatedAt ? new Date(story.updatedAt).toLocaleDateString() : "Not saved yet"}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => handleEdit(story)}
                        style={{ ...ttrComponents.secondaryButton, padding: "6px 10px" }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(story)}
                        style={{ ...dangerButtonStyle, padding: "6px 10px" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <p style={{ margin: 0, color: "#e2e8f0" }}>
                      <strong>Situation:</strong> {story.situation}
                    </p>
                    <p style={{ margin: 0, color: "#e2e8f0" }}>
                      <strong>Task:</strong> {story.task}
                    </p>
                    <p style={{ margin: 0, color: "#e2e8f0" }}>
                      <strong>Action:</strong> {story.action}
                    </p>
                    <p style={{ margin: 0, color: "#e2e8f0" }}>
                      <strong>Result:</strong> {story.result}
                    </p>
                    {story.reflections ? (
                      <p style={{ margin: 0, color: "#93c5fd" }}>
                        <strong>Reflection:</strong> {story.reflections}
                      </p>
                    ) : null}
                  </div>

                  {story.competencies.length ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {story.competencies.map((competency) => (
                        <span key={competency} style={ttrComponents.chip}>
                          {competency}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}

          {pendingDelete ? (
            <div
              style={{
                marginTop: 6,
                padding: 10,
                borderRadius: 10,
                background: "rgba(248,113,113,0.12)",
                border: "1px solid rgba(248,113,113,0.4)",
              }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>
                Delete &ldquo;{pendingDelete.title}&rdquo;?
              </p>
              <p style={{ margin: "4px 0 10px", color: "rgba(226,232,240,0.75)" }}>
                This action cannot be undone.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={deleteLoading}
                  style={{
                    ...dangerButtonStyle,
                    padding: "6px 10px",
                    cursor: deleteLoading ? "wait" : "pointer",
                  }}
                >
                  {deleteLoading ? "Deleting…" : "Confirm delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(null)}
                  style={{ ...ttrComponents.secondaryButton, padding: "6px 10px" }}
                >
                  Cancel
                </button>
              </div>
              {deleteError ? <div style={{ marginTop: 6, ...ttrComponents.dangerBox }}>{deleteError}</div> : null}
            </div>
          ) : null}
        </section>
      </div>
    </InstrumentShell>
  );
}
