import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "One Collective — Operations software for the trades",
    template: "%s | One Collective",
  },
  description:
    "The back-office backbone for blue-collar businesses. CRM, estimating, scheduling, invoicing, and AI phone — built for plumbing, HVAC, electrical, concrete, steel, and general contracting.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://1-collective.replit.app"
  ),
  openGraph: {
    title: "One Collective",
    description: "Operations software for the trades.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
