"use client";

import { useState, useEffect, useCallback } from "react";
import {
  saveIdea,
  getIdeas,
  deleteIdea,
  createPost,
  updatePostContent,
  getPosts,
  getPostVersions,
  markAsPosted,
} from "./actions";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Idea {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Post {
  id: string;
  user_id: string;
  idea_id: string | null;
  content: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  linkedin_post_id: string | null;
  linkedin_url: string | null;
  created_at: string;
  updated_at: string;
  ideas: { title: string } | null;
}

interface PostVersion {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  version_number: number;
  created_at: string;
}

type Tab = "ideas" | "drafts" | "posts";

/* ------------------------------------------------------------------ */
/*  Shared styles                                                      */
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

const btnDanger: React.CSSProperties = {
  ...btn,
  background: "#fff",
  color: "#cc1016",
  border: "1px solid #cc1016",
};

const btnSmall: React.CSSProperties = { ...btn, padding: "4px 10px", fontSize: 13 };
const btnSmallSecondary: React.CSSProperties = { ...btnSecondary, padding: "4px 10px", fontSize: 13 };
const btnSmallDanger: React.CSSProperties = { ...btnDanger, padding: "4px 10px", fontSize: 13 };

const card: React.CSSProperties = {
  border: "1px solid #e0e0e0",
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid #ccc",
  borderRadius: 4,
  fontSize: 14,
  boxSizing: "border-box",
};

const textarea: React.CSSProperties = {
  ...input,
  minHeight: 200,
  resize: "vertical",
  fontFamily: "inherit",
};

const label: React.CSSProperties = {
  display: "block",
  fontWeight: 600,
  fontSize: 13,
  marginBottom: 4,
  color: "#333",
};

const badge = (color: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 600,
  background: color,
  color: "#fff",
  marginLeft: 8,
});

const errorBox: React.CSSProperties = {
  padding: "8px 12px",
  background: "#fef2f2",
  border: "1px solid #fca5a5",
  borderRadius: 4,
  color: "#b91c1c",
  fontSize: 14,
  marginBottom: 12,
};

const successBox: React.CSSProperties = {
  padding: "8px 12px",
  background: "#f0fdf4",
  border: "1px solid #86efac",
  borderRadius: 4,
  color: "#166534",
  fontSize: 14,
  marginBottom: 12,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function WriteClient() {
  /* ---- tab ---- */
  const [activeTab, setActiveTab] = useState<Tab>("ideas");

  /* ---- ideas tab state ---- */
  const [topic, setTopic] = useState("");
  const [generatedIdeas, setGeneratedIdeas] = useState<{ title: string; body: string }[]>([]);
  const [savedIdeas, setSavedIdeas] = useState<Idea[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [ideaError, setIdeaError] = useState("");

  /* ---- drafts tab state ---- */
  const [selectedIdeaId, setSelectedIdeaId] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteInstructions, setRewriteInstructions] = useState("");
  const [draftError, setDraftError] = useState("");
  const [draftSuccess, setDraftSuccess] = useState("");

  /* ---- posts tab state ---- */
  const [posts, setPosts] = useState<Post[]>([]);
  const [expandedVersions, setExpandedVersions] = useState<string | null>(null);
  const [versions, setVersions] = useState<PostVersion[]>([]);
  const [linkedinUrls, setLinkedinUrls] = useState<Record<string, string>>({});
  const [postMessage, setPostMessage] = useState("");

  /* ================================================================ */
  /*  Data loading                                                     */
  /* ================================================================ */

  const loadIdeas = useCallback(async () => {
    try {
      const data = await getIdeas();
      setSavedIdeas(data as Idea[]);
    } catch {
      /* ignore */
    }
  }, []);

  const loadPosts = useCallback(async () => {
    try {
      const data = await getPosts();
      setPosts(data as Post[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadIdeas();
    loadPosts();
  }, [loadIdeas, loadPosts]);

  /* ================================================================ */
  /*  Ideas tab handlers                                               */
  /* ================================================================ */

  async function handleGenerateIdeas() {
    if (!topic.trim()) return;
    setIdeaError("");
    setIsGenerating(true);
    setGeneratedIdeas([]);
    try {
      const res = await fetch("/api/ai/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setGeneratedIdeas(data.ideas);
    } catch (e: unknown) {
      setIdeaError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSaveIdea(title: string, body: string) {
    try {
      await saveIdea(title, body);
      await loadIdeas();
      setGeneratedIdeas((prev) => prev.filter((i) => i.title !== title));
    } catch (e: unknown) {
      setIdeaError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function handleDeleteIdea(id: string) {
    try {
      await deleteIdea(id);
      await loadIdeas();
    } catch (e: unknown) {
      setIdeaError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function handleBuildDraftFromIdea(idea: Idea) {
    setSelectedIdeaId(idea.id);
    setEditingPostId(null);
    setEditingIdeaId(idea.id);
    setDraftContent("");
    setDraftSuccess("");
    setDraftError("");
    setActiveTab("drafts");
  }

  /* ================================================================ */
  /*  Drafts tab handlers                                              */
  /* ================================================================ */

  async function handleBuildDraft() {
    const idea = savedIdeas.find((i) => i.id === selectedIdeaId);
    if (!idea) {
      setDraftError("Select an idea first");
      return;
    }
    setDraftError("");
    setDraftSuccess("");
    setIsBuilding(true);
    try {
      const res = await fetch("/api/ai/build-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaTitle: idea.title, ideaBody: idea.body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft generation failed");
      setDraftContent(data.content);
      setEditingIdeaId(idea.id);
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "Draft generation failed");
    } finally {
      setIsBuilding(false);
    }
  }

  async function handleRewrite() {
    if (!draftContent.trim()) {
      setDraftError("Write or generate a draft first");
      return;
    }
    if (!rewriteInstructions.trim()) {
      setDraftError("Enter rewrite instructions");
      return;
    }
    setDraftError("");
    setDraftSuccess("");
    setIsRewriting(true);
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: draftContent,
          instructions: rewriteInstructions.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rewrite failed");
      setDraftContent(data.content);
      setRewriteInstructions("");
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "Rewrite failed");
    } finally {
      setIsRewriting(false);
    }
  }

  async function handleSaveDraft() {
    if (!draftContent.trim()) {
      setDraftError("Draft is empty");
      return;
    }
    setDraftError("");
    setDraftSuccess("");
    try {
      if (editingPostId) {
        const { version } = await updatePostContent(editingPostId, draftContent.trim());
        setDraftSuccess(`Saved as version ${version}`);
      } else {
        const post = await createPost(
          draftContent.trim(),
          editingIdeaId || undefined,
        );
        setEditingPostId(post.id);
        setDraftSuccess("Draft saved");
      }
      await loadPosts();
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "Save failed");
    }
  }

  function handleEditPost(post: Post) {
    setEditingPostId(post.id);
    setEditingIdeaId(post.idea_id);
    setSelectedIdeaId(post.idea_id || "");
    setDraftContent(post.content);
    setDraftError("");
    setDraftSuccess("");
    setActiveTab("drafts");
  }

  function handleNewDraft() {
    setEditingPostId(null);
    setEditingIdeaId(null);
    setSelectedIdeaId("");
    setDraftContent("");
    setDraftError("");
    setDraftSuccess("");
    setRewriteInstructions("");
  }

  /* ================================================================ */
  /*  Posts tab handlers                                               */
  /* ================================================================ */

  async function handleToggleVersions(postId: string) {
    if (expandedVersions === postId) {
      setExpandedVersions(null);
      setVersions([]);
      return;
    }
    try {
      const data = await getPostVersions(postId);
      setVersions(data as PostVersion[]);
      setExpandedVersions(postId);
    } catch {
      /* ignore */
    }
  }

  async function handleMarkPosted(postId: string) {
    setPostMessage("");
    try {
      await markAsPosted(postId, linkedinUrls[postId] || undefined);
      setPostMessage("Post marked as published");
      await loadPosts();
    } catch (e: unknown) {
      setPostMessage(e instanceof Error ? e.message : "Failed");
    }
  }

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  const tabItems: { key: Tab; label: string }[] = [
    { key: "ideas", label: "Idea Generator" },
    { key: "drafts", label: "Draft Builder" },
    { key: "posts", label: "Posts" },
  ];

  return (
    <main style={{ maxWidth: 800, margin: "40px auto", padding: "0 16px" }}>
      <h1>Write</h1>

      {/* ---- Tabs ---- */}
      <div style={{ display: "flex", gap: 0, marginTop: 24, borderBottom: "2px solid #eee" }}>
        {tabItems.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: "8px 20px",
              border: "none",
              borderBottom: activeTab === t.key ? "2px solid #0a66c2" : "2px solid transparent",
              background: "none",
              cursor: "pointer",
              fontWeight: activeTab === t.key ? 600 : 400,
              color: activeTab === t.key ? "#0a66c2" : "#666",
              marginBottom: -2,
              fontSize: 15,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============================================================ */}
      {/*  IDEAS TAB                                                    */}
      {/* ============================================================ */}
      {activeTab === "ideas" && (
        <section style={{ marginTop: 24 }}>
          {ideaError && <div style={errorBox}>{ideaError}</div>}

          {/* Generate */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            <input
              style={{ ...input, flex: 1 }}
              placeholder="Enter a topic (e.g. AI in recruiting, leadership lessons)…"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerateIdeas()}
            />
            <button
              style={btn}
              onClick={handleGenerateIdeas}
              disabled={isGenerating || !topic.trim()}
            >
              {isGenerating ? "Generating…" : "Generate Ideas"}
            </button>
          </div>

          {/* Generated ideas */}
          {generatedIdeas.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h3 style={{ marginBottom: 12 }}>Generated Ideas</h3>
              {generatedIdeas.map((idea, i) => (
                <div key={i} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <strong>{idea.title}</strong>
                      <p style={{ margin: "4px 0 0", color: "#555", fontSize: 14 }}>
                        {idea.body}
                      </p>
                    </div>
                    <button
                      style={btnSmall}
                      onClick={() => handleSaveIdea(idea.title, idea.body)}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Saved ideas */}
          <h3 style={{ marginBottom: 12 }}>Saved Ideas ({savedIdeas.length})</h3>
          {savedIdeas.length === 0 && (
            <p style={{ color: "#888" }}>No saved ideas yet. Generate some above or save them manually.</p>
          )}
          {savedIdeas.map((idea) => (
            <div key={idea.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <strong>{idea.title}</strong>
                  <span style={badge(idea.status === "published" ? "#16a34a" : "#6b7280")}>
                    {idea.status}
                  </span>
                  {idea.body && (
                    <p style={{ margin: "4px 0 0", color: "#555", fontSize: 14 }}>
                      {idea.body}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12 }}>
                  <button style={btnSmall} onClick={() => handleBuildDraftFromIdea(idea)}>
                    Build Draft
                  </button>
                  <button style={btnSmallDanger} onClick={() => handleDeleteIdea(idea.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ============================================================ */}
      {/*  DRAFTS TAB                                                   */}
      {/* ============================================================ */}
      {activeTab === "drafts" && (
        <section style={{ marginTop: 24 }}>
          {draftError && <div style={errorBox}>{draftError}</div>}
          {draftSuccess && <div style={successBox}>{draftSuccess}</div>}

          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>
              {editingPostId ? "Editing Post" : "New Draft"}
            </h3>
            {(editingPostId || draftContent) && (
              <button style={btnSmallSecondary} onClick={handleNewDraft}>
                New Draft
              </button>
            )}
          </div>

          {/* Idea selector + generate */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <select
              style={{ ...input, flex: 1 }}
              value={selectedIdeaId}
              onChange={(e) => setSelectedIdeaId(e.target.value)}
            >
              <option value="">— Select a saved idea —</option>
              {savedIdeas.map((idea) => (
                <option key={idea.id} value={idea.id}>
                  {idea.title}
                </option>
              ))}
            </select>
            <button
              style={btn}
              onClick={handleBuildDraft}
              disabled={isBuilding || !selectedIdeaId}
            >
              {isBuilding ? "Building…" : "Build Draft"}
            </button>
          </div>

          {/* Editor */}
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Draft Content</label>
            <textarea
              style={textarea}
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              placeholder="Write your LinkedIn post here, or generate one from an idea above…"
            />
            <div style={{ textAlign: "right", fontSize: 12, color: draftContent.length > 1300 ? "#cc1016" : "#888", marginTop: 2 }}>
              {draftContent.length} / 1300 chars
            </div>
          </div>

          {/* Save */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            <button
              style={btn}
              onClick={handleSaveDraft}
              disabled={!draftContent.trim()}
            >
              {editingPostId ? "Save New Version" : "Save Draft"}
            </button>
          </div>

          {/* Rewrite tool */}
          <div style={{ ...card, background: "#f8fafc" }}>
            <h4 style={{ margin: "0 0 8px" }}>Rewrite Tool</h4>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...input, flex: 1 }}
                placeholder="Rewrite instructions (e.g. make it more casual, add a CTA)…"
                value={rewriteInstructions}
                onChange={(e) => setRewriteInstructions(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRewrite()}
              />
              <button
                style={btnSecondary}
                onClick={handleRewrite}
                disabled={isRewriting || !draftContent.trim() || !rewriteInstructions.trim()}
              >
                {isRewriting ? "Rewriting…" : "Rewrite"}
              </button>
            </div>
          </div>

          {/* Existing drafts list */}
          <h3 style={{ marginTop: 32, marginBottom: 12 }}>
            Existing Drafts
          </h3>
          {posts.filter((p) => p.status === "draft").length === 0 && (
            <p style={{ color: "#888" }}>No draft posts yet.</p>
          )}
          {posts
            .filter((p) => p.status === "draft")
            .map((post) => (
              <div
                key={post.id}
                style={{
                  ...card,
                  borderColor: editingPostId === post.id ? "#0a66c2" : "#e0e0e0",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {post.ideas?.title && (
                      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                        From idea: {post.ideas.title}
                      </div>
                    )}
                    <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap", overflow: "hidden", textOverflow: "ellipsis", maxHeight: 60 }}>
                      {post.content.slice(0, 150)}
                      {post.content.length > 150 ? "…" : ""}
                    </p>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                      Updated {new Date(post.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button style={btnSmallSecondary} onClick={() => handleEditPost(post)}>
                    Edit
                  </button>
                </div>
              </div>
            ))}
        </section>
      )}

      {/* ============================================================ */}
      {/*  POSTS TAB                                                    */}
      {/* ============================================================ */}
      {activeTab === "posts" && (
        <section style={{ marginTop: 24 }}>
          {postMessage && (
            <div style={postMessage.includes("fail") || postMessage.includes("Failed") ? errorBox : successBox}>
              {postMessage}
            </div>
          )}

          <h3 style={{ marginBottom: 12 }}>All Posts ({posts.length})</h3>
          {posts.length === 0 && (
            <p style={{ color: "#888" }}>No posts yet. Create a draft in the Draft Builder tab.</p>
          )}
          {posts.map((post) => (
            <div key={post.id} style={card}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {post.ideas?.title && (
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 2 }}>
                      From idea: {post.ideas.title}
                    </div>
                  )}
                  <span style={badge(post.status === "published" ? "#16a34a" : post.status === "scheduled" ? "#d97706" : "#6b7280")}>
                    {post.status}
                  </span>
                  {post.published_at && (
                    <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>
                      Published {new Date(post.published_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {post.status === "draft" && (
                    <button style={btnSmallSecondary} onClick={() => handleEditPost(post)}>
                      Edit
                    </button>
                  )}
                  <button
                    style={btnSmallSecondary}
                    onClick={() => handleToggleVersions(post.id)}
                  >
                    {expandedVersions === post.id ? "Hide Versions" : "View Versions"}
                  </button>
                </div>
              </div>

              {/* Content preview */}
              <p style={{ margin: "0 0 8px", fontSize: 14, whiteSpace: "pre-wrap", overflow: "hidden", maxHeight: 80 }}>
                {post.content.slice(0, 200)}
                {post.content.length > 200 ? "…" : ""}
              </p>

              {/* LinkedIn URL display */}
              {post.linkedin_url && (
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  <strong>LinkedIn:</strong>{" "}
                  <a href={post.linkedin_url} target="_blank" rel="noopener noreferrer">
                    {post.linkedin_url}
                  </a>
                </div>
              )}

              {/* Mark as posted controls */}
              {post.status !== "published" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid #eee" }}>
                  <input
                    style={{ ...input, flex: 1 }}
                    placeholder="LinkedIn post URL (optional)"
                    value={linkedinUrls[post.id] || ""}
                    onChange={(e) =>
                      setLinkedinUrls((prev) => ({ ...prev, [post.id]: e.target.value }))
                    }
                  />
                  <button style={btnSmall} onClick={() => handleMarkPosted(post.id)}>
                    Mark as Posted
                  </button>
                </div>
              )}

              {/* Version history */}
              {expandedVersions === post.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Version History</h4>
                  {versions.length === 0 && <p style={{ color: "#888", fontSize: 13 }}>No versions found.</p>}
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      style={{
                        padding: "8px 12px",
                        marginBottom: 8,
                        background: "#f9fafb",
                        borderRadius: 4,
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <strong style={{ fontSize: 13 }}>Version {v.version_number}</strong>
                        <span style={{ fontSize: 12, color: "#888" }}>
                          {new Date(v.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, whiteSpace: "pre-wrap", color: "#444" }}>
                        {v.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
