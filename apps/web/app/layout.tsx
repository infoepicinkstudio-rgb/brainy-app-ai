import type { Metadata } from "next";
import "./globals.css";
import { StoreHydrator } from "@/components/layout/store-hydrator";
import { Navbar } from "@/components/layout/navbar";

export const metadata: Metadata = {
  title: "Brainy.ai",
  description: "Istiyak's personal, local-first infinite-canvas research tool.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <StoreHydrator />
        <Navbar />
        {children}
      </body>
    </html>
  );
}
