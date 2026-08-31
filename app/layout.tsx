import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteTopBar } from "@/components/layout/site-top-bar";
import { TutorialButton } from "@/components/tour-button";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StockPilot — Professional Trading & Market Intelligence",
  description:
    "Real-time market analytics, stock performance comparison, and virtual trading simulation.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-[#090a0d] text-white antialiased selection:bg-blue-600 selection:text-white">
        <Providers>
          <div className="flex min-h-screen">
            {/* Left Narrow Sidebar */}
            <SiteHeader />
            
            {/* Main Workspace Area */}
            <div className="flex flex-1 flex-col overflow-x-hidden">
              <SiteTopBar />
              
              <main className="flex-1 bg-[#090a0d] p-6 sm:p-8">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
