import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ClaimShield AI — Prior Authorization Automation",
  description:
    "AI-powered prior authorization workflow that reduces avoidable denials and staff time in healthcare revenue cycle.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="h-full bg-background text-foreground">
        {children}
        <Toaster richColors position="top-right" duration={4000} />
      </body>
    </html>
  );
}
