import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AppDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main style={{ maxWidth: 600, margin: "40px auto", padding: "0 16px" }}>
      <h1>Dashboard</h1>
      <p>Welcome, {user.email}</p>
      <nav style={{ marginTop: 24 }}>
        <a href="/app/settings">Settings</a>
      </nav>
    </main>
  );
}
