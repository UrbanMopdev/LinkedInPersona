import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { User, Globe, Clock, Mail } from "lucide-react";
import LinkedInImport from "./LinkedInImport";

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

  const fields = [
    {
      icon: Mail,
      label: "Email",
      value: user.email,
    },
    {
      icon: User,
      label: "Full name",
      value: profile?.full_name || null,
    },
    {
      icon: Globe,
      label: "LinkedIn handle",
      value: profile?.linkedin_handle || null,
    },
    {
      icon: Clock,
      label: "Timezone",
      value: profile?.timezone || "UTC",
    },
  ];

  return (
    <div className="mx-auto max-w-container px-6 py-8">
      <div className="mb-8">
        <h1 className="text-h1">Settings</h1>
        <p className="text-body text-muted-foreground mt-1">
          Manage your profile and preferences.
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* LinkedIn Import */}
        <LinkedInImport
          currentProfileUrl={profile?.linkedin_profile_url || null}
          currentHeadline={profile?.linkedin_headline || null}
          lastImportedAt={profile?.linkedin_last_imported_at || null}
        />

        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">Profile</CardTitle>
            <CardDescription>
              Your account details and preferences.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {fields.map((field, i) => (
                <div key={field.label}>
                  <div className="flex items-center gap-3 py-3">
                    <div className="rounded-lg bg-muted p-2">
                      <field.icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {field.label}
                      </p>
                      <p className="text-sm font-medium mt-0.5">
                        {field.value || (
                          <span className="text-muted-foreground italic">
                            Not set
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {i < fields.length - 1 && <Separator />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Voice & Positioning (show if imported) */}
        {(profile?.positioning_summary || profile?.voice_fingerprint) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-h3">AI Voice Profile</CardTitle>
              <CardDescription>
                Generated from your LinkedIn import. Used to match your writing
                style.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {profile.positioning_summary && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Positioning Summary
                  </p>
                  <p className="text-sm whitespace-pre-wrap">
                    {profile.positioning_summary}
                  </p>
                </div>
              )}
              {profile.positioning_summary && profile.voice_fingerprint && (
                <Separator />
              )}
              {profile.voice_fingerprint && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Voice Fingerprint
                  </p>
                  <p className="text-sm whitespace-pre-wrap">
                    {profile.voice_fingerprint}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
