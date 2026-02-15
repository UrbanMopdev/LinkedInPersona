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
  Database,
  RefreshCw,
  Unlink,
  ChevronDown,
  ChevronUp,
  Settings,
  Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SyncState {
  id: string;
  notion_database_id: string | null;
  notion_workspace_name: string | null;
  property_map: Record<string, string>;
  auto_create_in_notion: boolean;
  last_full_sync_at: string | null;
  last_incremental_sync_at: string | null;
  last_error: string | null;
  is_connected: boolean;
}

interface SyncEvent {
  id: string;
  event_type: string;
  direction: string | null;
  pages_processed: number;
  pages_created: number;
  pages_updated: number;
  conflicts_found: number;
  error_message: string | null;
  created_at: string;
}

interface NotionDatabase {
  id: string;
  title: string;
}

interface NotionProperty {
  name: string;
  type: string;
}

/* ------------------------------------------------------------------ */
/*  Default property map labels                                        */
/* ------------------------------------------------------------------ */

const PROPERTY_FIELDS = [
  { key: "title", label: "Title", hint: "Notion page title" },
  { key: "status", label: "Status", hint: "Draft / Scheduled / Published" },
  { key: "publish_date", label: "Publish Date", hint: "Date property" },
  { key: "pillar", label: "Pillar", hint: "Content pillar / category" },
  { key: "content", label: "Draft/Copy", hint: "Post body text" },
  { key: "linkedin_url", label: "LinkedIn URL", hint: "URL of published post" },
  { key: "tags", label: "Tags", hint: "Multi-select tags" },
  { key: "notes", label: "Notes", hint: "Additional notes" },
  { key: "impressions", label: "Impressions", hint: "Performance metric" },
  { key: "likes", label: "Likes", hint: "Performance metric" },
  { key: "comments", label: "Comments", hint: "Performance metric" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function NotionSettings() {
  const [state, setState] = useState<SyncState | null>(null);
  const [recentEvents, setRecentEvents] = useState<SyncEvent[]>([]);
  const [conflictCount, setConflictCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Connect form
  const [tokenInput, setTokenInput] = useState("");

  // Database selection
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [dbProperties, setDbProperties] = useState<NotionProperty[]>([]);
  const [showPropertyMap, setShowPropertyMap] = useState(false);
  const [propertyMap, setPropertyMap] = useState<Record<string, string>>({});

  // Settings
  const [autoCreate, setAutoCreate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  /* ---- Load state ---- */
  const loadState = useCallback(async () => {
    try {
      const res = await fetch("/api/notion/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_state" }),
      });
      const data = await res.json();
      if (data.state) {
        setState(data.state);
        setPropertyMap(data.state.property_map || {});
        setAutoCreate(data.state.auto_create_in_notion || false);
      } else {
        setState(null);
      }
      setRecentEvents(data.recentEvents || []);
      setConflictCount(data.conflictCount || 0);
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
      const res = await fetch("/api/notion/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", access_token: tokenInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setDatabases(data.databases || []);
      setMessage(
        `Connected to ${data.workspace}. ${data.databases.length} database(s) found.`
      );
      setTokenInput("");
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
      const res = await fetch("/api/notion/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setState(null);
      setDatabases([]);
      setMessage("Disconnected from Notion");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setActionLoading(null);
    }
  }

  /* ---- Select database ---- */
  async function handleSelectDatabase(dbId: string) {
    setError("");
    setActionLoading("select_db");
    try {
      const res = await fetch("/api/notion/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select_database", database_id: dbId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setDbProperties(data.properties || []);
      setMessage("Database selected. Review property mapping below.");
      await loadState();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to select database");
    } finally {
      setActionLoading(null);
    }
  }

  /* ---- Save property map ---- */
  async function handleSavePropertyMap() {
    setError("");
    setActionLoading("property_map");
    try {
      const res = await fetch("/api/notion/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_property_map",
          property_map: propertyMap,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage("Property mapping saved");
      await loadState();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save mapping");
    } finally {
      setActionLoading(null);
    }
  }

  /* ---- Save settings ---- */
  async function handleSaveSettings(newAutoCreate?: boolean) {
    const valueToSave = newAutoCreate !== undefined ? newAutoCreate : autoCreate;
    setError("");
    setActionLoading("settings");
    try {
      const res = await fetch("/api/notion/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_settings",
          auto_create_in_notion: valueToSave,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage("Settings saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setActionLoading(null);
    }
  }

  /* ---- Trigger sync ---- */
  async function handleSync(action: "full_sync" | "incremental") {
    setError("");
    setMessage("");
    setActionLoading(action);
    try {
      const res = await fetch("/api/notion/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (action === "full_sync") {
        const r = data.result;
        setMessage(
          `Full sync complete: ${r.pagesProcessed} processed, ${r.pagesCreated} created, ${r.pagesUpdated} updated.`
        );
      } else {
        const n2a = data.notionToApp;
        const a2n = data.appToNotion;
        setMessage(
          `Sync complete. Notion\u2192App: ${n2a.pagesProcessed} pages (${n2a.pagesUpdated} updated, ${n2a.conflictsFound} conflicts). App\u2192Notion: ${a2n.pagesProcessed} pages.`
        );
      }
      await loadState();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setActionLoading(null);
    }
  }

  /* ---- List databases ---- */
  async function handleListDatabases() {
    setError("");
    setActionLoading("list_db");
    try {
      const res = await fetch("/api/notion/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list_databases" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDatabases(data.databases || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to list databases");
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
          <Database className="h-5 w-5" />
          Notion Sync
        </CardTitle>
        <CardDescription>
          Two-way sync your content calendar with a Notion database.
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
                  Go to{" "}
                  <span className="font-mono text-xs">
                    notion.so/my-integrations
                  </span>{" "}
                  and create an internal integration
                </li>
                <li>
                  Copy the <span className="font-medium">Internal Integration Secret</span>
                </li>
                <li>
                  Open your content calendar database in Notion and add the
                  integration via the &quot;...&quot; menu &gt; Connections
                </li>
                <li>Paste the token below</li>
              </ol>
            </div>

            <div className="flex gap-3">
              <Input
                type="password"
                className="flex-1"
                placeholder="ntn_xxxxxxxxxxxx..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
              <Button
                onClick={handleConnect}
                disabled={!tokenInput.trim() || actionLoading === "connect"}
              >
                {actionLoading === "connect" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Connect
              </Button>
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
                  Connected to {state.notion_workspace_name || "Notion"}
                </p>
                {state.notion_database_id && (
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Database: {state.notion_database_id.slice(0, 8)}...
                  </p>
                )}
                {state.last_incremental_sync_at && (
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Last synced:{" "}
                    {new Date(state.last_incremental_sync_at).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {conflictCount > 0 && (
                  <Badge variant="warning">{conflictCount} conflicts</Badge>
                )}
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
            </div>

            {/* Error display */}
            {state.last_error && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Last sync error</p>
                  <p className="text-xs mt-0.5">{state.last_error}</p>
                </div>
              </div>
            )}

            {/* Database selection */}
            {!state.notion_database_id && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    Select your content calendar database
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleListDatabases}
                    disabled={actionLoading === "list_db"}
                  >
                    {actionLoading === "list_db" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Database className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Load databases
                  </Button>
                  {databases.length > 0 && (
                    <div className="space-y-2">
                      {databases.map((db) => (
                        <button
                          key={db.id}
                          className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors text-sm"
                          onClick={() => handleSelectDatabase(db.id)}
                          disabled={actionLoading === "select_db"}
                        >
                          <p className="font-medium">{db.title || "Untitled"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {db.id}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Sync controls */}
            {state.notion_database_id && (
              <>
                <Separator />
                <div className="flex flex-wrap gap-2">
                  {!state.last_full_sync_at ? (
                    <Button
                      onClick={() => handleSync("full_sync")}
                      disabled={actionLoading === "full_sync"}
                    >
                      {actionLoading === "full_sync" ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Run Initial Import
                    </Button>
                  ) : (
                    <>
                      <Button
                        onClick={() => handleSync("incremental")}
                        disabled={!!actionLoading}
                      >
                        {actionLoading === "incremental" ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Sync Now
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleSync("full_sync")}
                        disabled={!!actionLoading}
                      >
                        {actionLoading === "full_sync" ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Full Re-sync
                      </Button>
                    </>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      handleListDatabases();
                    }}
                    disabled={!!actionLoading}
                  >
                    Change Database
                  </Button>
                </div>

                {/* Database picker (when changing) */}
                {databases.length > 0 && state.notion_database_id && (
                  <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
                    <p className="text-sm font-medium">Available databases</p>
                    {databases.map((db) => (
                      <button
                        key={db.id}
                        className={`w-full text-left rounded-lg border p-3 transition-colors text-sm ${
                          db.id === state.notion_database_id
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => handleSelectDatabase(db.id)}
                        disabled={actionLoading === "select_db"}
                      >
                        <p className="font-medium">
                          {db.title || "Untitled"}
                          {db.id === state.notion_database_id && (
                            <Badge variant="secondary" className="ml-2">
                              Current
                            </Badge>
                          )}
                        </p>
                      </button>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDatabases([])}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Property Mapping */}
            {state.notion_database_id && (
              <>
                <Separator />
                <button
                  className="flex items-center gap-2 text-sm font-medium hover:text-foreground transition-colors w-full text-left"
                  onClick={() => setShowPropertyMap(!showPropertyMap)}
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Property Mapping
                  {showPropertyMap ? (
                    <ChevronUp className="h-3.5 w-3.5 ml-auto" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                  )}
                </button>

                {showPropertyMap && (
                  <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                    <p className="text-xs text-muted-foreground">
                      Map your Notion property names to app fields. Leave empty
                      to skip a field.
                    </p>
                    {dbProperties.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Detected properties:{" "}
                        {dbProperties.map((p) => `${p.name} (${p.type})`).join(", ")}
                      </p>
                    )}
                    <div className="grid gap-2">
                      {PROPERTY_FIELDS.map((field) => (
                        <div
                          key={field.key}
                          className="flex items-center gap-3"
                        >
                          <div className="w-28 shrink-0">
                            <p className="text-xs font-medium">{field.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {field.hint}
                            </p>
                          </div>
                          <Input
                            className="flex-1 h-8 text-sm"
                            placeholder={field.label}
                            value={propertyMap[field.key] || ""}
                            onChange={(e) =>
                              setPropertyMap((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      onClick={handleSavePropertyMap}
                      disabled={actionLoading === "property_map"}
                    >
                      {actionLoading === "property_map" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : null}
                      Save Mapping
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Auto-create setting */}
            {state.notion_database_id && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      Auto-create in Notion
                    </p>
                    <p className="text-xs text-muted-foreground">
                      When a post without a Notion page is updated, create a new
                      page in Notion automatically.
                    </p>
                  </div>
                  <button
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                      autoCreate ? "bg-primary" : "bg-muted"
                    }`}
                    onClick={() => {
                      const newValue = !autoCreate;
                      setAutoCreate(newValue);
                      handleSaveSettings(newValue);
                    }}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${
                        autoCreate ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </>
            )}

            {/* Sync History */}
            {recentEvents.length > 0 && (
              <>
                <Separator />
                <button
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowHistory(!showHistory)}
                >
                  {showHistory ? "Hide" : "Show"} sync history
                  {showHistory ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>

                {showHistory && (
                  <div className="space-y-2">
                    {recentEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-start gap-3 rounded-lg border p-3 text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                ev.error_message ? "destructive" : "secondary"
                              }
                            >
                              {ev.event_type.replace(/_/g, " ")}
                            </Badge>
                            {ev.direction && (
                              <span className="text-xs text-muted-foreground">
                                {ev.direction.replace(/_/g, " ")}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                            {ev.pages_processed > 0 && (
                              <span>{ev.pages_processed} processed</span>
                            )}
                            {ev.pages_created > 0 && (
                              <span>{ev.pages_created} created</span>
                            )}
                            {ev.pages_updated > 0 && (
                              <span>{ev.pages_updated} updated</span>
                            )}
                            {ev.conflicts_found > 0 && (
                              <span className="text-amber-600">
                                {ev.conflicts_found} conflicts
                              </span>
                            )}
                          </div>
                          {ev.error_message && (
                            <p className="text-xs text-destructive mt-1">
                              {ev.error_message}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {new Date(ev.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
