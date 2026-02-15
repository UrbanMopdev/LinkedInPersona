"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessageSquare,
  Send,
  Plus,
  PanelLeftClose,
  PanelLeft,
  AlertCircle,
  Loader2,
  CalendarPlus,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string | null;
  updated_at: string;
}

interface ParsedPost {
  title: string;
  pillar: string;
  platform: string;
  post_type: string;
  target_icp: string;
  tags: string[];
  status: string;
  notes: string;
  content: string;
}

/* ------------------------------------------------------------------ */
/*  Parse ```post block from assistant message                         */
/* ------------------------------------------------------------------ */

function parsePostBlock(text: string): ParsedPost | null {
  const match = text.match(/```post\s*\n([\s\S]*?)```/);
  if (!match) return null;

  const block = match[1];
  const lines = block.split("\n");
  const meta: Record<string, string> = {};
  let contentStartIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "---") {
      contentStartIdx = i + 1;
      break;
    }
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim().toUpperCase();
      const value = line.slice(colonIdx + 1).trim();
      meta[key] = value;
    }
  }

  const content =
    contentStartIdx > 0
      ? lines.slice(contentStartIdx).join("\n").trim()
      : "";

  if (!content) return null;

  return {
    title: meta["TITLE"] || "",
    pillar: meta["PILLAR"] || "",
    platform: meta["PLATFORM"] || "LinkedIn",
    post_type: meta["POST_TYPE"] || "",
    target_icp: meta["TARGET_ICP"] || "",
    tags: meta["TAGS"]
      ? meta["TAGS"].split(",").map((t) => t.trim()).filter(Boolean)
      : [],
    status: (meta["STATUS"] || "draft").toLowerCase(),
    notes: meta["NOTES"] || "",
    content,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedPostIds, setSavedPostIds] = useState<Set<number>>(new Set());
  const [savingPostIdx, setSavingPostIdx] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      const data = await res.json();
      if (data.conversations) setConversations(data.conversations);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  async function loadConversation(convId: string) {
    setConversationId(convId);
    setMessages([]);
    setError("");
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });
      if (data) setMessages(data as Message[]);
    } catch {
      /* ignore */
    }
  }

  function handleNewConversation() {
    setConversationId(null);
    setMessages([]);
    setError("");
    setInputValue("");
  }

  async function handleSend() {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    setError("");
    setInputValue("");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response },
      ]);

      if (!conversationId && data.conversationId) {
        setConversationId(data.conversationId);
        loadConversations();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Chat failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSavePost(parsed: ParsedPost, msgIndex: number) {
    setSavingPostIdx(msgIndex);
    setError("");
    try {
      const res = await fetch("/api/chat/save-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save post");
      setSavedPostIds((prev) => new Set(prev).add(msgIndex));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save post");
    } finally {
      setSavingPostIdx(null);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* ---- Sidebar ---- */}
      <aside
        className={cn(
          "border-r bg-muted/30 flex flex-col shrink-0 transition-all duration-200",
          showSidebar ? "w-64" : "w-0 overflow-hidden border-r-0"
        )}
      >
        <div className="p-3 border-b">
          <Button className="w-full" onClick={handleNewConversation}>
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-auto py-2">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className={cn(
                "w-full text-left px-3 py-2.5 text-sm transition-colors truncate",
                conversationId === conv.id
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              {conv.title || "Untitled"}
            </button>
          ))}
          {conversations.length === 0 && (
            <p className="px-3 py-6 text-body-sm text-muted-foreground text-center">
              No conversations yet
            </p>
          )}
        </div>
      </aside>

      {/* ---- Main chat area ---- */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSidebar(!showSidebar)}
            className="text-muted-foreground shrink-0"
          >
            {showSidebar ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
          <span className="text-sm text-muted-foreground">
            {conversationId ? "Conversation" : "New Chat"}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-2xl px-4 py-6">
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-4">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center text-center py-24">
                <div className="mb-4 rounded-full bg-muted p-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-h2 mb-2">LinkedIn Content Chat</h2>
                <p className="text-body text-muted-foreground max-w-md">
                  Ask me to brainstorm ideas, draft posts, refine your voice, or
                  anything LinkedIn-related.
                </p>
              </div>
            )}

            <div className="space-y-4">
              {messages.map((msg, i) => {
                const parsed =
                  msg.role === "assistant"
                    ? parsePostBlock(msg.content)
                    : null;

                return (
                  <div
                    key={i}
                    className={cn(
                      "flex flex-col",
                      msg.role === "user" ? "items-end" : "items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md"
                      )}
                    >
                      {msg.content}
                    </div>
                    {parsed && (
                      <div className="mt-2">
                        {savedPostIds.has(i) ? (
                          <div className="flex items-center gap-1.5 text-sm text-emerald-600">
                            <CheckCircle2 className="h-4 w-4" />
                            Added to Calendar
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSavePost(parsed, i)}
                            disabled={savingPostIdx === i}
                          >
                            {savingPostIdx === i ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                            ) : (
                              <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            Add to Calendar
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking...
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t bg-background">
          <div className="mx-auto max-w-2xl px-4 py-3">
            <div className="flex gap-3">
              <Input
                className="flex-1"
                placeholder="Type a message..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={isLoading}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={isLoading || !inputValue.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
