import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { PenLine, MessageSquare, FileText, Settings } from "lucide-react";

export default async function AppDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const cards = [
    {
      title: "Write",
      description: "Generate ideas and draft LinkedIn posts with AI assistance",
      icon: PenLine,
      href: "/app/write",
    },
    {
      title: "Posts",
      description: "Manage your drafts and published posts in one place",
      icon: FileText,
      href: "/app/posts",
    },
    {
      title: "Chat",
      description: "Brainstorm and refine your content strategy with AI",
      icon: MessageSquare,
      href: "/app/chat",
    },
    {
      title: "Settings",
      description: "Configure your profile and voice preferences",
      icon: Settings,
      href: "/app/settings",
    },
  ];

  return (
    <div className="mx-auto max-w-container px-6 py-12">
      <div className="mb-12">
        <h1 className="text-display">
          Good to see you
        </h1>
        <p className="text-body text-muted-foreground mt-2">
          What would you like to work on today?
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-xl border bg-card p-6 transition-all hover:shadow-md hover:border-primary/20"
          >
            <div className="mb-4 inline-flex rounded-lg bg-secondary p-2.5">
              <card.icon className="h-5 w-5 text-foreground" />
            </div>
            <h2 className="text-h3 mb-1 group-hover:text-primary transition-colors">
              {card.title}
            </h2>
            <p className="text-body-sm text-muted-foreground">
              {card.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
