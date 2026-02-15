"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Linkedin,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ClipboardPaste,
  ChevronDown,
  ChevronUp,
  User,
  Briefcase,
  FileText,
  Sparkles,
  RefreshCw,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ImportPreview {
  profileUrl: string | null;
  headline: string | null;
  about: string | null;
  experienceCount: number;
  experience: { title: string; company: string; duration: string }[];
  postsFound: number;
  postsArchived: number;
  postsAlreadyExisted: number;
  positioningSummary: string | null;
  voiceFingerprint: string | null;
  memoryChunksStored: number;
  fetchReturnedNoData?: boolean;
}

interface LinkedInImportProps {
  currentProfileUrl: string | null;
  currentHeadline: string | null;
  lastImportedAt: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LinkedInImport({
  currentProfileUrl,
  currentHeadline,
  lastImportedAt,
}: LinkedInImportProps) {
  const [input, setInput] = useState(currentProfileUrl || "");
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [showPasteFallback, setShowPasteFallback] = useState(false);
  const [pastedPosts, setPastedPosts] = useState("");
  const [manualHeadline, setManualHeadline] = useState("");
  const [manualAbout, setManualAbout] = useState("");
  const [manualExperience, setManualExperience] = useState("");
  const [step, setStep] = useState<
    "input" | "importing" | "preview" | "manual" | "done"
  >(lastImportedAt ? "done" : "input");
  const [showDetails, setShowDetails] = useState(false);

  /* ---- Run import ---- */
  async function handleImport(options?: {
    usePasted?: boolean;
    useManual?: boolean;
  }) {
    const { usePasted = false, useManual = false } = options || {};
    setError("");
    setIsImporting(true);
    if (!useManual) setStep("importing");

    const payload: Record<string, unknown> = {};
    if (input.trim()) payload.input = input.trim();
    if (usePasted && pastedPosts.trim()) {
      // Split by double-newline (post separator)
      payload.pastedPosts = pastedPosts
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 20);
    }
    if (useManual) {
      payload.manualProfile = {
        headline: manualHeadline.trim() || undefined,
        about: manualAbout.trim() || undefined,
        experience: manualExperience.trim() || undefined,
      };
      // Also include pasted posts if present
      if (pastedPosts.trim()) {
        payload.pastedPosts = pastedPosts
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter((p) => p.length > 20);
      }
    }

    try {
      const res = await fetch("/api/linkedin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }

      // If auto-fetch returned nothing, prompt manual entry
      if (data.preview?.fetchReturnedNoData && !useManual) {
        setPreview(null);
        setStep("manual");
        return;
      }

      setPreview(data.preview);
      setStep("preview");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Import failed";
      setError(msg);
      setStep(useManual ? "manual" : "input");
      // If blocked, go straight to manual entry
      if (
        msg.includes("private") ||
        msg.includes("403") ||
        msg.includes("999") ||
        msg.includes("auth wall")
      ) {
        setStep("manual");
        setError("");
      }
    } finally {
      setIsImporting(false);
    }
  }

  function handleConfirm() {
    setStep("done");
    setPreview(null);
  }

  function handleReimport() {
    setStep("input");
    setPreview(null);
    setError("");
  }

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3 flex items-center gap-2">
          <Linkedin className="h-5 w-5" />
          Connect LinkedIn
        </CardTitle>
        <CardDescription>
          Import your public profile and posts to personalise your AI
          ghostwriter with your authentic voice.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* ---- Status banner when already imported ---- */}
        {step === "done" && (
          <div className="flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 mb-4">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-emerald-800">
                LinkedIn connected
              </p>
              {(currentHeadline || preview?.headline) && (
                <p className="text-xs text-emerald-700 mt-0.5">
                  {preview?.headline || currentHeadline}
                </p>
              )}
              {lastImportedAt && (
                <p className="text-xs text-emerald-600 mt-0.5">
                  Last imported{" "}
                  {new Date(lastImportedAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReimport}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Re-import
            </Button>
          </div>
        )}

        {/* ---- Error ---- */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-4">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ---- Input step ---- */}
        {(step === "input" || step === "importing") && (
          <>
            <div className="flex gap-3 mb-3">
              <Input
                className="flex-1"
                placeholder="LinkedIn handle or profile URL (e.g. johndoe or https://linkedin.com/in/johndoe)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !isImporting && handleImport({})
                }
                disabled={isImporting}
              />
              <Button
                onClick={() => handleImport({})}
                disabled={isImporting || !input.trim()}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Import
                  </>
                )}
              </Button>
            </div>

            {isImporting && (
              <div className="rounded-lg bg-muted/50 border px-4 py-6 text-center mb-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">
                  Analysing your LinkedIn profile...
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Fetching profile, parsing posts, generating your voice
                  fingerprint
                </p>
              </div>
            )}

            {/* ---- Paste fallback ---- */}
            {!isImporting && (
              <button
                type="button"
                onClick={() => setShowPasteFallback(!showPasteFallback)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
                {showPasteFallback
                  ? "Hide paste option"
                  : "Can't access profile? Paste posts instead"}
                {showPasteFallback ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            )}

            {showPasteFallback && !isImporting && (
              <div className="space-y-3 mb-4">
                <Textarea
                  className="min-h-[160px]"
                  placeholder={
                    "Paste your LinkedIn posts here.\n\nSeparate each post with a blank line.\n\n--- Example ---\nJust shipped our new feature...\n\nHere's what I learned about leadership..."
                  }
                  value={pastedPosts}
                  onChange={(e) => setPastedPosts(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => handleImport({ usePasted: true })}
                  disabled={isImporting || !pastedPosts.trim()}
                >
                  <ClipboardPaste className="h-4 w-4 mr-2" />
                  Import pasted posts
                </Button>
              </div>
            )}
          </>
        )}

        {/* ---- Manual entry step (when auto-fetch fails) ---- */}
        {step === "manual" && (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 mb-2">
              <p className="font-medium">
                LinkedIn blocked the automatic import
              </p>
              <p className="text-xs mt-1">
                Copy your profile details from LinkedIn and paste them below.
                Open your{" "}
                <a
                  href={input.trim() ? `https://www.linkedin.com/in/${input.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "")}` : "https://www.linkedin.com"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  LinkedIn profile
                </a>{" "}
                in another tab to copy from.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Headline
              </label>
              <Input
                placeholder="e.g. VP of Marketing at Acme Corp | Growth Strategy"
                value={manualHeadline}
                onChange={(e) => setManualHeadline(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                About
              </label>
              <Textarea
                className="min-h-[100px]"
                placeholder="Paste your LinkedIn About section here..."
                value={manualAbout}
                onChange={(e) => setManualAbout(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Experience
              </label>
              <Textarea
                className="min-h-[80px]"
                placeholder={"One role per line, e.g.:\nVP Marketing at Acme Corp\nSenior Manager at StartupXYZ"}
                value={manualExperience}
                onChange={(e) => setManualExperience(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Posts{" "}
                <span className="text-muted-foreground font-normal">
                  (optional — separate each post with a blank line)
                </span>
              </label>
              <Textarea
                className="min-h-[120px]"
                placeholder={
                  "Paste your LinkedIn posts here.\n\nSeparate each post with a blank line.\n\n--- Example ---\nJust shipped our new feature...\n\nHere's what I learned about leadership..."
                }
                value={pastedPosts}
                onChange={(e) => setPastedPosts(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={() => handleImport({ useManual: true })}
                disabled={
                  isImporting ||
                  (!manualHeadline.trim() &&
                    !manualAbout.trim() &&
                    !manualExperience.trim() &&
                    !pastedPosts.trim())
                }
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Import profile
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={handleReimport}>
                Back
              </Button>
            </div>
          </div>
        )}

        {/* ---- Preview step ---- */}
        {step === "preview" && preview && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Import complete — review results
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                icon={User}
                label="Headline"
                value={preview.headline ? "Found" : "—"}
              />
              <StatCard
                icon={Briefcase}
                label="Experience"
                value={
                  preview.experienceCount > 0
                    ? `${preview.experienceCount} roles`
                    : "—"
                }
              />
              <StatCard
                icon={FileText}
                label="Posts"
                value={
                  preview.postsFound > 0
                    ? `${preview.postsFound} found`
                    : "None visible"
                }
              />
              <StatCard
                icon={Sparkles}
                label="Voice"
                value={preview.voiceFingerprint ? "Generated" : "—"}
              />
            </div>

            {/* Expandable details */}
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? "Hide" : "Show"} details
              {showDetails ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {showDetails && (
              <div className="space-y-3 text-sm">
                {preview.headline && (
                  <DetailRow label="Headline" value={preview.headline} />
                )}
                {preview.about && (
                  <DetailRow label="About" value={preview.about} />
                )}
                {preview.experience.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Experience
                    </p>
                    <div className="space-y-1">
                      {preview.experience.map((e, i) => (
                        <p key={i} className="text-sm">
                          {e.title}
                          {e.company ? ` at ${e.company}` : ""}
                          {e.duration ? (
                            <span className="text-muted-foreground">
                              {" "}
                              ({e.duration})
                            </span>
                          ) : null}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {preview.positioningSummary && (
                  <DetailRow
                    label="Positioning Summary"
                    value={preview.positioningSummary}
                  />
                )}
                {preview.voiceFingerprint && (
                  <DetailRow
                    label="Voice Fingerprint"
                    value={preview.voiceFingerprint}
                  />
                )}
                <div className="flex gap-3 flex-wrap">
                  <Badge variant="secondary">
                    {preview.postsArchived} new posts archived
                  </Badge>
                  {preview.postsAlreadyExisted > 0 && (
                    <Badge variant="secondary">
                      {preview.postsAlreadyExisted} already existed
                    </Badge>
                  )}
                  <Badge variant="secondary">
                    {preview.memoryChunksStored} memory chunks stored
                  </Badge>
                </div>
              </div>
            )}

            <Separator />

            <div className="flex items-center gap-3">
              <Button onClick={handleConfirm}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Looks good
              </Button>
              <Button variant="outline" onClick={handleReimport}>
                Re-import
              </Button>
            </div>

            {preview.postsFound === 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <p className="font-medium">No posts were visible</p>
                <p className="text-xs mt-1">
                  LinkedIn often restricts public access to posts. Try the
                  &ldquo;Paste posts instead&rdquo; option below for best
                  results.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setStep("input");
                    setShowPasteFallback(true);
                  }}
                >
                  <ClipboardPaste className="h-3.5 w-3.5 mr-1.5" />
                  Paste posts instead
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-center">
      <Icon className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p className="text-sm whitespace-pre-wrap">{value}</p>
    </div>
  );
}
