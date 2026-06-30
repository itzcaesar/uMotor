import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { CopilotWidget } from "@/components/copilot";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "uMotor Console",
    template: "%s · uMotor Console",
  },
  description:
    "uMotor ops dashboard — real-time platform metrics, bookings, workshops, ride intelligence, MotoScore distribution, and the uMotor AI copilot.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-x-hidden px-8 py-7">
            <div className="animate-fade-up mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
        <CopilotWidget />
      </body>
    </html>
  );
}
