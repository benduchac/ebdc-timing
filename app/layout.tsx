import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EBDC Timing - C510",
  description: "East Bay Dirt Classic Race Timing System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}