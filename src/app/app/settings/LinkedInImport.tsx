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
  ArrowRight,
  ArrowLeft,
  GraduationCap,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ImportPreview {
  profileUrl: string | null;
  name: string | null;
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
}

interface LinkedInImportProps {
  currentProfileUrl: string | null;
  currentHeadline: string | null;
  lastImportedAt: string | null;
}

/* ------------------------------------------------------------------ */
/*  Steps                                                              */
/* ------------------------------------------------------------------ */

type Step = "start" | "profile" | "posts" | "importing" | "preview" | "done";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LinkedInImport({
  currentProfileUrl,
  currentHeadline,
  lastImportedAt,
}: LinkedInImportProps) {
  const [step, setStep] = useState<Step>(lastImportedAt ? "done" : "start");
  const [profileUrl, setProfileUrl] = useState(currentProfileUrl || "");
  const [pastedProfile, setPastedProfile] = useState("");
  const [pastedPosts, setPastedPosts] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  /* ---- Submit to API ---- */
  async function handleImport() {
    setError("");
    setIsImporting(true);
    setStep("importing");

    try {
      const res = await fetch("/api/linkedin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileUrl: profileUrl.trim() || undefined,
          pastedProfile: pastedProfile.trim() || undefined,
          pastedPosts: pastedPosts.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }

      setPreview(data.preview);
      setStep("preview");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Import failed";
      setError(msg);
      setStep("profile");
    } finally {
      setIsImporting(false);
    }
  }

  function handleReimport() {
    setStep("start");
    setPreview(null);
    setError("");
    setPastedProfile("");
    setPastedPosts("");
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
          Import your profile and posts to personalise your AI ghostwriter. Just
          copy &amp; paste — no API keys, no permissions needed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* ---- Error banner ---- */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-4">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ========================================================= */}
        {/*  DONE STATE                                                 */}
        {/* ========================================================= */}
        {step === "done" && (
          <div className="flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
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
            <Button variant="outline" size="sm" onClick={handleReimport}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Re-import
            </Button>
          </div>
        )}

        {/* ========================================================= */}
        {/*  START — choose to begin                                    */}
        {/* ========================================================= */}
        {step === "start" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium">How it works</p>
              <div className="grid gap-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <span className="rounded-full bg-primary/10 text-primary text-xs font-bold w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    Open your LinkedIn profile → <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">Ctrl+A</kbd> to select all → <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">Ctrl+C</kbd> to copy → paste here
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="rounded-full bg-primary/10 text-primary text-xs font-bold w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    (Optional) Do the same on your Posts/Activity page for post
                    history
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="rounded-full bg-primary/10 text-primary text-xs font-bold w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    We parse your name, headline, about, experience, education
                    &amp; posts — then generate your AI voice profile
                  </span>
                </div>
              </div>
            </div>

            <Button onClick={() => setStep("profile")}>
              <ClipboardPaste className="h-4 w-4 mr-2" />
              Start import
            </Button>
          </div>
        )}

        {/* ========================================================= */}
        {/*  STEP 1: Paste profile                                      */}
        {/* ========================================================= */}
        {step === "profile" && (
          <div className="space-y-4 animate-fade-in">
            <StepIndicator current={1} total={2} />

            <div>
              <label className="text-sm font-medium mb-1 block">
                LinkedIn profile URL{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <Input
                placeholder="https://linkedin.com/in/yourname"
                value={profileUrl}
                onChange={(e) => setProfileUrl(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Paste your profile page
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Go to your LinkedIn profile page → select all (<kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">Ctrl+A</kbd>) → copy (<kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">Ctrl+C</kbd>) → paste below
              </p>
              <Textarea
                className="min-h-[200px] font-mono text-xs"
                placeholder={"Paste your entire LinkedIn profile page content here...\n\nWe'll automatically extract your name, headline, about, experience, and education."}
                value={pastedProfile}
                onChange={(e) => setPastedProfile(e.target.value)}
              />
              {pastedProfile.trim() && (
                <p className="text-xs text-muted-foreground mt-1">
                  {pastedProfile.length.toLocaleString()} characters pasted
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={() => setStep("posts")}
                disabled={!pastedProfile.trim()}
              >
                Next: Posts
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("start")}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/*  STEP 2: Paste posts (optional)                             */}
        {/* ========================================================= */}
        {step === "posts" && (
          <div className="space-y-4 animate-fade-in">
            <StepIndicator current={2} total={2} />

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Paste your posts{" "}
                <span className="text-muted-foreground font-normal">
                  (optional but recommended)
                </span>
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Go to your LinkedIn Activity → Posts tab → scroll down to load
                posts → select all → copy → paste below. This helps us match your
                writing voice.
              </p>
              <Textarea
                className="min-h-[200px] font-mono text-xs"
                placeholder={"Paste your LinkedIn posts/activity page content here...\n\nWe'll extract individual posts and their engagement metrics."}
                value={pastedPosts}
                onChange={(e) => setPastedPosts(e.target.value)}
              />
              {pastedPosts.trim() && (
                <p className="text-xs text-muted-foreground mt-1">
                  {pastedPosts.length.toLocaleString()} characters pasted
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Import &amp; analyse
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("profile")}
                disabled={isImporting}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              {!pastedPosts.trim() && (
                <span className="text-xs text-muted-foreground">
                  You can skip this step
                </span>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/*  IMPORTING STATE                                            */}
        {/* ========================================================= */}
        {step === "importing" && (
          <div className="rounded-lg bg-muted/50 border px-4 py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">
              Analysing your LinkedIn profile...
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Parsing profile, archiving posts, generating your voice fingerprint
            </p>
          </div>
        )}

        {/* ========================================================= */}
        {/*  PREVIEW — review parsed data                               */}
        {/* ========================================================= */}
        {step === "preview" && preview && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-2 text-sm font-medium">
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
                    : "None"
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
                {preview.name && (
                  <DetailRow label="Name" value={preview.name} />
                )}
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
              <Button
                onClick={() => {
                  setStep("done");
                  setPreview(null);
                }}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Looks good
              </Button>
              <Button variant="outline" onClick={handleReimport}>
                Re-import
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
      {Array.from({ length: total }, (_, i) => {
        const num = i + 1;
        const isActive = num === current;
        const isDone = num < current;
        return (
          <div key={num} className="flex items-center gap-1.5">
            {i > 0 && <div className="w-6 h-px bg-border" />}
            <span
              className={`rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isDone
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {isDone ? "\u2713" : num}
            </span>
            <span className={isActive ? "font-medium text-foreground" : ""}>
              {num === 1 ? "Profile" : "Posts"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

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
