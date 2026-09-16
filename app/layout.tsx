import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Swift Chess",
  description: "A chess AI that is meant to think, not just calculate.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
