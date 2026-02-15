"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PenLine,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  X,
  CalendarDays,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const navItems = [
  { href: "/app/write", label: "Write", icon: PenLine },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/app/reports", label: "Reports", icon: BarChart3 },
  { href: "/app/chat", label: "Chat", icon: MessageSquare },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-container items-center justify-between px-6">
        <Link
          href="/app"
          className="text-lg font-bold tracking-tight text-foreground hover:text-foreground/80 transition-colors"
        >
          Persona
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          <div className="ml-2 pl-2 border-l">
            <form action="/auth/signout" method="post">
              <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground hover:text-foreground">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </nav>

        {/* Mobile toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-background animate-fade-in">
          <nav className="flex flex-col px-4 py-3 gap-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <div className="mt-2 pt-2 border-t">
              <form action="/auth/signout" method="post">
                <Button
                  variant="ghost"
                  size="sm"
                  type="submit"
                  className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </form>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
