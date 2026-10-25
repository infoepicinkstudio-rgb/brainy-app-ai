import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brainy",
  description: "Istiyak's personal, local-first infinite-canvas research tool.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
