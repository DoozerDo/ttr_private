"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";

import type { StudyPacket, FollowUpPayload } from "../../lib/interviewToolkit";
import { ttrComponents, ttrLayout, ttrTypography } from "../ui/ttrStyles";

interface JobDto {
  id: string;
  title: string | null;
  company: string | null;
}

export default function InterviewToolkitPage() {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [jobState, setJobState] = useState<"idle" | "loading" | "error">("loading");
  const [jobError, setJobError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>("");

  const [packet, setPacket] = useState<StudyPacket | null>(null);
  const [packetState, setPacketState] = useState<"idle" | "loading" | "error">("idle");
  const [packetError, setPacketError] = useState<string | null>(null);

  const [followUpNotes, setFollowUpNotes] = useState<string>("");
  const [followUp, setFollowUp] = useState<FollowUpPayload | null>(null);
  const [followUpState, setFollowUpState] = useState<"idle" | "loading" | "error">("idle");
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    const loadJobs = async () => {
      setJobState("loading");
      setJobError(null);
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        if (!res.ok) {
          throw new Error((await res.text()) || "Unable to load jobs");
        }
        const data = (await res.json()) as JobDto[];
        setJobs(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0) {
          setSelectedJobId((prev) => {
            if (prev && data.some((j) => j.id === prev)) return prev;
            return data[0].id;
          });
        }
        setJobState("idle");
      } catch (error) {
        setJobError(error instanceof Error ? error.message : "Unable to load jobs");
        setJobs([]);
        setJobState("error");
      }
    };

    loadJobs();
  }, []);

  useEffect(() => {
    if (!selectedJobId) {
      setPacket(null);
      return;
    }

    const loadPacket = async () => {
      setPacketState("loading");
      setPacketError(null);
      try {
        const res = await fetch(`/api/interview-toolkit/${selectedJobId}/study-packet`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error((await res.text()) || "Unable to load study packet");
        }
        const data = (await res.json()) as StudyPacket;
        setPacket(data);
        setPacketState("idle");
      } catch (error) {
        setPacketError(error instanceof Error ? error.message : "Unable to load study packet");
        setPacket(null);
        setPacketState("error");
      }
    };

    void loadPacket();
  }, [selectedJobId]);

  const handleGenerateFollowUp = async () => {
    if (!selectedJobId) return;
    setFollowUpState("loading");
    setFollowUpError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/interview-toolkit/${selectedJobId}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: followUpNotes }),
      });
      if (!res.ok) {
        throw new Error((await res.text()) || "Unable to generate follow up");
      }
      const data = (await res.json()) as FollowUpPayload;
      setFollowUp(data);
      setFollowUpState("idle");
    } catch (error) {
      setFollowUpError(error instanceof Error ? error.message : "Unable to generate follow up");
      setFollowUpState("error");
      setFollowUp(null);
    }
  };

  const handleCopy = async () => {
    if (!followUp?.content || !navigator?.clipboard) return;
    try {
      await navigator.clipboard.writeText(followUp.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const selectedJob = useMemo(() => jobs.find((j) => j.id === selectedJobId) ?? null, [jobs, selectedJobId]);

  const sectionTitleStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };

  const chip: CSSProperties = {
    display: "inline-flex",
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    fontSize: 13,
  };

  return (
    <div style={ttrLayout.shell}>
      <div style={{ ...ttrLayout.container, maxWidth: 1120 }}>
        <header style={ttrComponents.headerCard}>
          <div style={sectionTitleStyle}>
            <span style={ttrTypography.kicker}>Interview Toolkit</span>
            <h1 style={ttrTypography.h1}>Job-ready flows</h1>
            <p style={ttrTypography.paragraph}>
              Morning-of checklist, study packet, and follow-up copy tied to your saved job.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 260 }}>
            <label style={ttrTypography.subtleLabel}>Job</label>
            {jobState === "loading" ? (
              <div style={chip}>Loading jobs…</div>
            ) : jobs.length === 0 ? (
              <div style={ttrComponents.warningBox}>Save a job to unlock the Interview Toolkit.</div>
            ) : (
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                style={{
                  padding: "12px 14px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 10,
                  color: "#e2e8f0",
                }}
              >
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {[job.title, job.company].filter(Boolean).join(" — ") || job.id}
                  </option>
                ))}
              </select>
            )}
            {jobError && <div style={ttrComponents.dangerBox}>{jobError}</div>}
          </div>
        </header>

        <div style={{ ...ttrLayout.panelsRow, alignItems: "stretch" }}>
          <section style={{ ...ttrComponents.basePanel, flex: 1 }}>
            <div style={sectionTitleStyle}>
              <span style={ttrTypography.subtleLabel}>Pre-interview</span>
              <h2 style={ttrTypography.h2}>Morning Of</h2>
            </div>

            <p style={{ ...ttrTypography.paragraph, marginTop: 10 }}>
              Ground yourself before the call. These reminders stay tied to the selected job.
            </p>

            <ul style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10, paddingLeft: 18 }}>
              <li>Re-read the job description and your baseline highlights mapped to this role.</li>
              <li>Pick 2-3 STAR stories that fit the role&apos;s gaps and keep them handy.</li>
              <li>Write down the company&apos;s product, user, and one recent headline to mention.</li>
              <li>Have the interviewer names, dial-in details, and time zones confirmed.</li>
              <li>Keep a one-line "why me for this role" ready as your opener.</li>
            </ul>
          </section>

          <section style={{ ...ttrComponents.basePanel, flex: 1 }}>
            <div style={sectionTitleStyle}>
              <span style={ttrTypography.subtleLabel}>Study packet</span>
              <h2 style={ttrTypography.h2}>Study Packet</h2>
            </div>

            {packetState === "loading" && <div style={chip}>Building study packet…</div>}
            {packetError && <div style={ttrComponents.dangerBox}>{packetError}</div>}

            {packet && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={ttrTypography.subtleLabel}>Job</span>
                  <div style={ttrTypography.h3}>
                    {[packet.job.title, packet.job.company].filter(Boolean).join(" at ") || packet.job.id}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {packet.fitSnapshot ? (
                    <div style={chip}>
                      Fit score {packet.fitSnapshot.overallScore} · {packet.fitSnapshot.verdict}
                    </div>
                  ) : (
                    <div style={ttrComponents.warningBox}>Run Analyze or Fit Review to see strengths and gaps.</div>
                  )}
                  {packet.fitSnapshot && packet.fitSnapshot.strengths.length > 0 && (
                    <div style={chip}>Top strength: {packet.fitSnapshot.strengths[0]}</div>
                  )}
                  {packet.fitSnapshot && packet.fitSnapshot.gaps.length > 0 && (
                    <div style={chip}>Key gap: {packet.fitSnapshot.gaps[0]}</div>
                  )}
                </div>

                <div>
                  <h3 style={ttrTypography.h3}>Recommended STAR stories</h3>
                  {packet.recommendedStories.length === 0 ? (
                    <div style={ttrComponents.warningBox}>No STAR stories saved yet.</div>
                  ) : (
                    <ul style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                      {packet.recommendedStories.map((story) => (
                        <li key={story.id}>
                          <span style={{ fontWeight: 600 }}>{story.title}</span>
                          {story.competencies?.length ? (
                            <span style={{ color: "#cbd5e1", marginLeft: 8 }}>
                              {story.competencies.slice(0, 3).join(", ")}
                              {story.competencies.length > 3 ? "…" : ""}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 style={ttrTypography.h3}>Likely questions</h3>
                  {packet.questions.length === 0 ? (
                    <div style={ttrComponents.warningBox}>No questions available for this job yet.</div>
                  ) : (
                    <ul style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                      {packet.questions.map((question) => (
                        <li key={`${question.gapId}-${question.prompt}`}>
                          <div style={{ fontWeight: 600 }}>{question.prompt}</div>
                          <div style={{ color: "#cbd5e1", fontSize: 13 }}>{question.jdReference}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {packet.recentStories.length > 0 && (
                  <div>
                    <h4 style={ttrTypography.h4}>Recent STAR stories</h4>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {packet.recentStories.map((story) => (
                        <div key={story.id} style={chip}>
                          {story.title}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <section style={{ ...ttrComponents.basePanel, marginTop: 16 }}>
          <div style={sectionTitleStyle}>
            <span style={ttrTypography.subtleLabel}>Post-interview</span>
            <h2 style={ttrTypography.h2}>Follow Up</h2>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <label style={ttrTypography.subtleLabel} htmlFor="followUpNotes">
              Notes to weave in
            </label>
            <textarea
              id="followUpNotes"
              value={followUpNotes}
              onChange={(e) => setFollowUpNotes(e.target.value)}
              placeholder="Mention what resonated, next steps, or shared priorities"
              style={{
                minHeight: 100,
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "#e2e8f0",
              }}
            />

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                onClick={handleGenerateFollowUp}
                disabled={!selectedJobId || followUpState === "loading"}
                style={{
                  ...ttrComponents.primaryButton,
                  padding: "10px 16px",
                  cursor: followUpState === "loading" ? "wait" : "pointer",
                }}
              >
                {followUpState === "loading" ? "Generating…" : "Generate follow up"}
              </button>
              {followUpError && <div style={ttrComponents.dangerBox}>{followUpError}</div>}
            </div>

            {followUp && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={ttrTypography.h4}>Draft</div>
                  <button
                    onClick={handleCopy}
                    style={{ ...ttrComponents.secondaryButton, padding: "8px 12px" }}
                    disabled={!followUp.content}
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                    padding: 12,
                    background: "rgba(255,255,255,0.03)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {followUp.content}
                </div>
                {followUp.complianceFlags?.length ? (
                  <div style={ttrComponents.warningBox}>
                    Compliance notices: {followUp.complianceFlags.map((f) => f.message || f.code).join(", ")}
                  </div>
                ) : null}
              </div>
            )}

            {!selectedJob && <div style={ttrComponents.warningBox}>Select a job to enable follow ups.</div>}
          </div>
        </section>

        <div style={{ marginTop: 12, color: "#cbd5e1", fontSize: 13 }}>
          Need to add STAR stories? <Link href="/cover-letters" style={{ color: "#c084fc" }}>Use your library</Link>.
        </div>
      </div>
    </div>
  );
}
