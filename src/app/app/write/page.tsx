import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WriteClient from "./WriteClient";

export default async function WritePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <WriteClient />;
}
