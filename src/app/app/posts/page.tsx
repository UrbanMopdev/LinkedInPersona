import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PostsClient from "./PostsClient";

export default async function PostsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <PostsClient />;
}
