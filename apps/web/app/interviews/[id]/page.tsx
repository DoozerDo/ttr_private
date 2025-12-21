"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { InstrumentShell } from "../../ui/InstrumentShell";
import { ttrComponents, ttrLayout, ttrTypography } from "../../ui/ttrStyles";
import type { InterviewSessionDto } from "../../../lib/interviews";

const QUESTIONS = [
  "Walk me through the most relevant accomplishment in your baseline.",
  "What would your first 30 days look like if you joined this team?",
  "Which parts of the role feel like the biggest stretch for you?",
];

export default function InterviewSessionPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;
  const [session, setSession] = useState<InterviewSessionDto | null>(null);
  const [answers, setAnswers] = useState<string[]>(() => QUESTIONS.map(() => ""));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const loadSession = async () => {
      try {
        const response = await fetch(`/api/interviews/${sessionId}`, { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Unable to load interview session.");
        }

        const data = (await response.json()) as InterviewSessionDto;
        setSession(data);

        if (data?.responses?.length) {
          const responseMap = new Map(data.responses.map((item) => [item.question, item.response]));
          setAnswers(QUESTIONS.map((question) => responseMap.get(question) ?? ""));
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load interview session.");
      }
    };

    loadSession();
  }, [sessionId]);

  const handleChange = (index: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const populatedResponses = useMemo(() => {
    return QUESTIONS.map((question, index) => ({
      question,
      response: answers[index]?.trim() ?? "",
    })).filter((item) => item.response.length > 0);
  }, [answers]);

  const handleSave = async () => {
    if (!sessionId) return;

    if (populatedResponses.length === 0) {
      setError("Add at least one response before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/interviews/${sessionId}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: populatedResponses }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const messageText = payload?.error ?? "Unable to save responses.";
        throw new Error(messageText);
      }

      setMessage("Responses saved. You can revisit this page anytime.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save responses.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <InstrumentShell
      kicker="Interview session"
      title="Fit Review"
      subtitle="Capture a few quick responses while the role context is fresh."
    >
      <div style={ttrLayout.panelsRow}>
        <section style={{ ...ttrComponents.basePanel, flex: 1.2 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ttrTypography.subtleLabel}>Session details</span>
            <h2 style={ttrTypography.h2}>Interview prompts</h2>
          </div>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 18 }}>
            {QUESTIONS.map((question, index) => (
              <div key={question} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={ttrComponents.fieldLabel}>{question}</label>
                <textarea
                  style={{ ...ttrComponents.textArea, minHeight: 120 }}
                  value={answers[index] ?? ""}
                  onChange={(event) => handleChange(index, event.target.value)}
                />
              </div>
            ))}

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  ...ttrComponents.primaryButton,
                  opacity: saving ? 0.6 : 1,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Saving..." : "Save responses"}
              </button>
              <span style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>
                Session ID: {sessionId}
              </span>
            </div>

            {message ? <div style={ttrComponents.successBox}>{message}</div> : null}
            {error ? <div style={ttrComponents.dangerBox}>{error}</div> : null}
          </div>
        </section>

        <section style={{ ...ttrComponents.basePanel, flex: 0.8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ttrTypography.subtleLabel}>Session</span>
            <h2 style={ttrTypography.h2}>Overview</h2>
          </div>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "rgba(241,245,249,0.85)" }}>
              Status: <strong>{session?.status ?? "loading"}</strong>
            </div>
            <div style={{ fontSize: 13, color: "rgba(226,232,240,0.7)" }}>
              Baseline: {session?.baselineId ?? "..."}
            </div>
            {session?.jobId ? (
              <div style={{ fontSize: 13, color: "rgba(226,232,240,0.7)" }}>
                Job: {session.jobId}
              </div>
            ) : null}
            <div style={{ fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
              Created: {session?.createdAt ? new Date(session.createdAt).toLocaleString() : "..."}
            </div>
          </div>
        </section>
      </div>
    </InstrumentShell>
  );
}
