import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <main style={{ maxWidth: 600, margin: "40px auto", padding: "0 16px" }}>
      <h1>Settings</h1>
      <section style={{ marginTop: 24 }}>
        <h2>Profile</h2>
        <dl>
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Full name</dt>
          <dd>{profile?.full_name || "—"}</dd>
          <dt>LinkedIn handle</dt>
          <dd>{profile?.linkedin_handle || "—"}</dd>
          <dt>Timezone</dt>
          <dd>{profile?.timezone || "UTC"}</dd>
        </dl>
      </section>
      <p style={{ marginTop: 24, color: "#666" }}>
        Profile editing coming soon.
      </p>
    </main>
  );
}
