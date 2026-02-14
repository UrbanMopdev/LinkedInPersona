import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LinkedIn Persona",
  description: "AI-powered LinkedIn content management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
