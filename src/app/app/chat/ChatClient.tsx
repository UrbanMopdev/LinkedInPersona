"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const btn: React.CSSProperties = {
  padding: "8px 16px",
  background: "#0a66c2",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};

const btnSecondary: React.CSSProperties = {
  ...btn,
  background: "#fff",
  color: "#0a66c2",
  border: "1px solid #0a66c2",
};

const btnSmall: React.CSSProperties = { ...btn, padding: "4px 10px", fontSize: 13 };
const btnSmallSecondary: React.CSSProperties = { ...btnSecondary, padding: "4px 10px", fontSize: 13 };

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid #ccc",
  borderRadius: 4,
  fontSize: 14,
  boxSizing: "border-box",
};

const errorBox: React.CSSProperties = {
  padding: "8px 12px",
  background: "#fef2f2",
  border: "1px solid #fca5a5",
  borderRadius: 4,
  color: "#b91c1c",
  fontSize: 14,
  marginBottom: 12,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
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
    // We don't have a dedicated messages-list endpoint, but we can
    // retrieve messages via the conversations flow. For the MVP
    // we reload from Supabase client-side.
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

  return (
    <div style={{ display: "flex", height: "calc(100vh - 57px)" }}>
      {/* ---- Sidebar ---- */}
      {showSidebar && (
        <aside
          style={{
            width: 260,
            borderRight: "1px solid #e0e0e0",
            display: "flex",
            flexDirection: "column",
            background: "#f9fafb",
            flexShrink: 0,
          }}
        >
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e0e0e0" }}>
            <button style={{ ...btn, width: "100%" }} onClick={handleNewConversation}>
              New Chat
            </button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px 16px",
                  border: "none",
                  background: conversationId === conv.id ? "#e0e7ff" : "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#333",
                  borderBottom: "1px solid #eee",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {conv.title || "Untitled"}
              </button>
            ))}
            {conversations.length === 0 && (
              <p style={{ padding: "16px", color: "#888", fontSize: 13 }}>
                No conversations yet
              </p>
            )}
          </div>
        </aside>
      )}

      {/* ---- Main chat area ---- */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <div
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid #e0e0e0",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            style={btnSmallSecondary}
            onClick={() => setShowSidebar(!showSidebar)}
          >
            {showSidebar ? "Hide" : "Show"} History
          </button>
          <span style={{ fontSize: 14, color: "#666" }}>
            {conversationId ? "Conversation" : "New Chat"}
          </span>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "16px 24px",
          }}
        >
          {error && <div style={errorBox}>{error}</div>}

          {messages.length === 0 && !isLoading && (
            <div
              style={{
                textAlign: "center",
                color: "#888",
                marginTop: 80,
              }}
            >
              <h2 style={{ color: "#333", marginBottom: 8 }}>LinkedIn Content Chat</h2>
              <p>Ask me to brainstorm ideas, draft posts, refine your voice, or anything LinkedIn-related.</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  maxWidth: "75%",
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: msg.role === "user" ? "#0a66c2" : "#f0f0f0",
                  color: msg.role === "user" ? "#fff" : "#333",
                  fontSize: 14,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: "#f0f0f0",
                  color: "#888",
                  fontSize: 14,
                }}
              >
                Thinking...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          style={{
            padding: "12px 24px",
            borderTop: "1px solid #e0e0e0",
            display: "flex",
            gap: 8,
          }}
        >
          <input
            style={{ ...input, flex: 1 }}
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
          <button
            style={{
              ...btnSmall,
              opacity: isLoading || !inputValue.trim() ? 0.5 : 1,
            }}
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
