"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Loader2,
  CheckCircle2,
  AlertCircle,
  Mic,
  RefreshCw,
  Unlink,
  ChevronDown,
  ChevronUp,
  Shield,
  Download,
  Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SyncState {
  id: string;
  is_connected: boolean;
  date_range_start: string | null;
  date_range_end: string | null;
  include_keywords: string[];
  exclude_keywords: string[];
  exclude_meeting_patterns: string[];
  redact_participant_names: boolean;
  privacy_level: string;
  last_import_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  meetings_imported: number;
  artifacts_extracted: number;
}

interface Counts {
  meetings: number;
  artifacts: number;
  themes: number;
  unprocessed: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ReadAiSettings() {
  const [state, setState] = useState<SyncState | null>(null);
  const [counts, setCounts] = useState<Counts>({
    meetings: 0,
    artifacts: 0,
    themes: 0,
    unprocessed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Connect form
  const [apiKeyInput, setApiKeyInput] = useState("");

  // Settings
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [includeKw, setIncludeKw] = useState("");
  const [excludeKw, setExcludeKw] = useState("");
  const [excludePatterns, setExcludePatterns] = useState("");
  const [redactNames, setRedactNames] = useState(false);
  const [privacyLevel, setPrivacyLevel] = useState("standard");

  // Expand sections
  const [showSettings, setShowSettings] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Import wizard step
  const [wizardStep, setWizardStep] = useState<
    "idle" | "importing" | "processing" | "clustering" | "done"
  >("idle");
  const [wizardResults, setWizardResults] = useState<{
    import?: { imported: number; filtered: number; total: number };
    processing?: { processed: number; artifacts: number };
    themes?: { themesCreated: number; themesUpdated: number };
  }>({});

  /* ---- Load state ---- */
  const loadState = useCallback(async () => {
    try {
      const res = await fetch("/api/readai/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_state" }),
      });
      const data = await res.json();
      if (data.state) {
        setState(data.state);
        setDateStart(data.state.date_range_start || "");
        setDateEnd(data.state.date_range_end || "");
        setIncludeKw((data.state.include_keywords || []).join(", "));
        setExcludeKw((data.state.exclude_keywords || []).join(", "));
        setExcludePatterns(
          (data.state.exclude_meeting_patterns || []).join(", ")
        );
        setRedactNames(data.state.redact_participant_names || false);
        setPrivacyLevel(data.state.privacy_level || "standard");
      } else {
        setState(null);
      }
      setCounts(data.counts || { meetings: 0, artifacts: 0, themes: 0, unprocessed: 0 });
    } catch {
      // Not connected
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  /* ---- Connect ---- */
  async function handleConnect() {
    setError("");
    setMessage("");
    setActionLoading("connect");
    try {
      const res = await fetch("/api/readai/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "connect",
          api_key: apiKeyInput,
          date_range_start: dateStart || undefined,
          date_range_end: dateEnd || undefined,
          exclude_meeting_patterns: excludePatterns
            ? excludePatterns.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          redact_participant_names: redactNames,
          privacy_level: privacyLevel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage("Connected to Read.ai");
      setApiKeyInput("");
      await loadState();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setActionLoading(null);
    }
  }

  /* ---- Disconnect ---- */
  async function handleDisconnect() {
    setError("");
    setActionLoading("disconnect");
    try {
      const res = await fetch("/api/readai/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setState(null);
      setMessage("Disconnected from Read.ai");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setActionLoading(null);
    }
  }

  /* ---- Save settings ---- */
  async function handleSaveSettings() {
    setError("");
    setActionLoading("settings");
    try {
      const res = await fetch("/api/readai/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_settings",
          date_range_start: dateStart || undefined,
          date_range_end: dateEnd || undefined,
          include_keywords: includeKw
            ? includeKw.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          exclude_keywords: excludeKw
            ? excludeKw.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          exclude_meeting_patterns: excludePatterns
            ? excludePatterns.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          redact_participant_names: redactNames,
          privacy_level: privacyLevel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage("Settings saved");
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setActionLoading(null);
    }
  }

  /* ---- Run full import wizard ---- */
  async function handleFullImport() {
    setError("");
    setMessage("");
    setWizardStep("importing");
    setWizardResults({});

    try {
      // Step 1: Import
      const importRes = await fetch("/api/readai/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import_meetings" }),
      });
      const importData = await importRes.json();
      if (!importRes.ok) throw new Error(importData.error);
      setWizardResults((prev) => ({
        ...prev,
        import: {
          imported: importData.imported,
          filtered: importData.filtered,
          total: importData.total,
        },
      }));

      // Step 2: Process
      setWizardStep("processing");
      const processRes = await fetch("/api/readai/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process_meetings" }),
      });
      const processData = await processRes.json();
      if (!processRes.ok) throw new Error(processData.error);
      setWizardResults((prev) => ({
        ...prev,
        processing: {
          processed: processData.processed,
          artifacts: processData.totalArtifacts,
        },
      }));

      // Step 3: Cluster
      setWizardStep("clustering");
      const clusterRes = await fetch("/api/readai/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cluster_themes" }),
      });
      const clusterData = await clusterRes.json();
      if (!clusterRes.ok) throw new Error(clusterData.error);
      setWizardResults((prev) => ({
        ...prev,
        themes: clusterData,
      }));

      setWizardStep("done");
      await loadState();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
      setWizardStep("idle");
    }
  }

  /* ---- Sync now ---- */
  async function handleSyncNow() {
    setError("");
    setMessage("");
    setActionLoading("sync");
    try {
      const res = await fetch("/api/readai/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(
        `Sync complete: ${data.imported} new meetings, ${data.artifacts} artifacts extracted.`
      );
      await loadState();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setActionLoading(null);
    }
  }

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3 flex items-center gap-2">
          <Mic className="h-5 w-5" />
          Read.ai Integration
        </CardTitle>
        <CardDescription>
          Import meeting reports to fuel your LinkedIn content with real
          conversations, decisions, and insights.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alerts */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {message && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {message}
          </div>
        )}

        {/* ======================================================= */}
        {/*  NOT CONNECTED                                            */}
        {/* ======================================================= */}
        {!state?.is_connected && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <p className="text-sm font-medium">How to connect</p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>
                  Go to your Read.ai account settings and generate an API key
                </li>
                <li>Paste the API key below</li>
                <li>Configure date range and privacy settings</li>
                <li>Run the initial import</li>
              </ol>
            </div>

            <div className="space-y-3">
              <div className="flex gap-3">
                <Input
                  type="password"
                  className="flex-1"
                  placeholder="Read.ai API key..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
                <Button
                  onClick={handleConnect}
                  disabled={!apiKeyInput.trim() || actionLoading === "connect"}
                >
                  {actionLoading === "connect" ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Connect
                </Button>
              </div>

              {/* Pre-connect settings */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Start Date (optional)
                  </label>
                  <Input
                    type="date"
                    value={dateStart}
                    onChange={(e) => setDateStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    End Date (optional)
                  </label>
                  <Input
                    type="date"
                    value={dateEnd}
                    onChange={(e) => setDateEnd(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Exclude meeting patterns (comma-separated, e.g. &quot;1:1, standup, daily&quot;)
                </label>
                <Input
                  placeholder="1:1, standup, daily scrum..."
                  value={excludePatterns}
                  onChange={(e) => setExcludePatterns(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                    redactNames ? "bg-primary" : "bg-muted"
                  }`}
                  onClick={() => setRedactNames(!redactNames)}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${
                      redactNames ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm">Redact participant names</span>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================= */}
        {/*  CONNECTED                                                */}
        {/* ======================================================= */}
        {state?.is_connected && (
          <>
            {/* Connection status */}
            <div className="flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-800">
                  Connected to Read.ai
                </p>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-emerald-600">
                  <span>{counts.meetings} meetings</span>
                  <span>{counts.artifacts} artifacts</span>
                  <span>{counts.themes} themes</span>
                  {counts.unprocessed > 0 && (
                    <span className="text-amber-600">
                      {counts.unprocessed} unprocessed
                    </span>
                  )}
                </div>
                {state.last_sync_at && (
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Last synced:{" "}
                    {new Date(state.last_sync_at).toLocaleString()}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={actionLoading === "disconnect"}
              >
                <Unlink className="h-3.5 w-3.5 mr-1.5" />
                Disconnect
              </Button>
            </div>

            {/* Error display */}
            {state.last_error && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Last error</p>
                  <p className="text-xs mt-0.5">{state.last_error}</p>
                </div>
              </div>
            )}

            {/* Sync controls */}
            <div className="flex flex-wrap gap-2">
              {!state.last_import_at ? (
                <Button
                  onClick={handleFullImport}
                  disabled={wizardStep !== "idle"}
                >
                  {wizardStep !== "idle" ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Run Initial Import
                </Button>
              ) : (
                <>
                  <Button
                    onClick={handleSyncNow}
                    disabled={!!actionLoading || wizardStep !== "idle"}
                  >
                    {actionLoading === "sync" ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Sync Now
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleFullImport}
                    disabled={!!actionLoading || wizardStep !== "idle"}
                  >
                    {wizardStep !== "idle" ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Full Re-import
                  </Button>
                </>
              )}
            </div>

            {/* Import wizard progress */}
            {wizardStep !== "idle" && (
              <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-medium">Import Progress</p>

                {/* Step 1 */}
                <div className="flex items-center gap-2 text-sm">
                  {wizardStep === "importing" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : wizardResults.import ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border" />
                  )}
                  <span>
                    Importing meetings
                    {wizardResults.import && (
                      <span className="text-muted-foreground ml-1">
                        ({wizardResults.import.imported} imported,{" "}
                        {wizardResults.import.filtered} filtered of{" "}
                        {wizardResults.import.total})
                      </span>
                    )}
                  </span>
                </div>

                {/* Step 2 */}
                <div className="flex items-center gap-2 text-sm">
                  {wizardStep === "processing" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : wizardResults.processing ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border" />
                  )}
                  <span>
                    Extracting artifacts
                    {wizardResults.processing && (
                      <span className="text-muted-foreground ml-1">
                        ({wizardResults.processing.artifacts} from{" "}
                        {wizardResults.processing.processed} meetings)
                      </span>
                    )}
                  </span>
                </div>

                {/* Step 3 */}
                <div className="flex items-center gap-2 text-sm">
                  {wizardStep === "clustering" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : wizardResults.themes ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border" />
                  )}
                  <span>
                    Clustering themes
                    {wizardResults.themes && (
                      <span className="text-muted-foreground ml-1">
                        ({wizardResults.themes.themesCreated} created,{" "}
                        {wizardResults.themes.themesUpdated} updated)
                      </span>
                    )}
                  </span>
                </div>

                {wizardStep === "done" && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800 mt-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Import complete! Browse your meetings and insights in the
                    Library.
                  </div>
                )}
              </div>
            )}

            {/* Scope & Filters */}
            <Separator />
            <button
              className="flex items-center gap-2 text-sm font-medium hover:text-foreground transition-colors w-full text-left"
              onClick={() => setShowSettings(!showSettings)}
            >
              Scope & Filters
              {showSettings ? (
                <ChevronUp className="h-3.5 w-3.5 ml-auto" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 ml-auto" />
              )}
            </button>

            {showSettings && (
              <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Start Date
                    </label>
                    <Input
                      type="date"
                      value={dateStart}
                      onChange={(e) => setDateStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      End Date
                    </label>
                    <Input
                      type="date"
                      value={dateEnd}
                      onChange={(e) => setDateEnd(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Include keywords (comma-separated)
                  </label>
                  <Input
                    placeholder="strategy, product, roadmap..."
                    value={includeKw}
                    onChange={(e) => setIncludeKw(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Exclude keywords (comma-separated)
                  </label>
                  <Input
                    placeholder="interview, candidate..."
                    value={excludeKw}
                    onChange={(e) => setExcludeKw(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Exclude meeting patterns
                  </label>
                  <Input
                    placeholder="1:1, standup, daily scrum..."
                    value={excludePatterns}
                    onChange={(e) => setExcludePatterns(e.target.value)}
                  />
                </div>

                <Button
                  size="sm"
                  onClick={handleSaveSettings}
                  disabled={actionLoading === "settings"}
                >
                  {actionLoading === "settings" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : null}
                  Save Settings
                </Button>
              </div>
            )}

            {/* Privacy Controls */}
            <Separator />
            <button
              className="flex items-center gap-2 text-sm font-medium hover:text-foreground transition-colors w-full text-left"
              onClick={() => setShowPrivacy(!showPrivacy)}
            >
              <Shield className="h-4 w-4 text-muted-foreground" />
              Privacy Controls
              {showPrivacy ? (
                <ChevronUp className="h-3.5 w-3.5 ml-auto" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 ml-auto" />
              )}
            </button>

            {showPrivacy && (
              <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      Redact participant names
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Replace names with &quot;Participant 1&quot;, &quot;Participant 2&quot;, etc.
                    </p>
                  </div>
                  <button
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                      redactNames ? "bg-primary" : "bg-muted"
                    }`}
                    onClick={() => setRedactNames(!redactNames)}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${
                        redactNames ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Privacy level
                  </label>
                  <div className="flex gap-2">
                    {["standard", "redacted", "minimal"].map((level) => (
                      <Button
                        key={level}
                        variant={
                          privacyLevel === level ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setPrivacyLevel(level)}
                        className="capitalize"
                      >
                        {level}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {privacyLevel === "standard"
                      ? "Full meeting data stored"
                      : privacyLevel === "redacted"
                        ? "Names redacted, transcripts preserved"
                        : "Only summary and key points, no transcript or participants"}
                  </p>
                </div>

                <Button
                  size="sm"
                  onClick={handleSaveSettings}
                  disabled={actionLoading === "settings"}
                >
                  {actionLoading === "settings" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : null}
                  Save Privacy Settings
                </Button>
              </div>
            )}

            {/* Stats */}
            <Separator />
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{counts.meetings}</p>
                <p className="text-xs text-muted-foreground">Meetings</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{counts.artifacts}</p>
                <p className="text-xs text-muted-foreground">Artifacts</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{counts.themes}</p>
                <p className="text-xs text-muted-foreground">Themes</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">
                  {state.privacy_level === "minimal" ? (
                    <Badge variant="secondary">Min</Badge>
                  ) : state.redact_participant_names ? (
                    <Badge variant="secondary">Red</Badge>
                  ) : (
                    <Badge variant="outline">Std</Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">Privacy</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
