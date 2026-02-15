import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import IdeasClient from "./IdeasClient";

export default async function IdeasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <IdeasClient />;
}
