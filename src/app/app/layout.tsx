import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 24px",
          borderBottom: "1px solid #eee",
        }}
      >
        <a href="/app" style={{ fontWeight: "bold", textDecoration: "none" }}>
          LinkedIn Persona
        </a>
        <nav style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <a href="/app/write">Write</a>
          <a href="/app/settings">Settings</a>
          <form action="/auth/signout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </nav>
      </header>
      {children}
    </div>
  );
}
