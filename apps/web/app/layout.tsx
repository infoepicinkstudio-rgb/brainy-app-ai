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
      {/* h-full (a bound), not min-h-full (only a floor) — React Flow's canvas page
          needs its flex-1 ancestor chain to resolve to a real, non-zero height, which
          a min-height-only chain doesn't reliably give nested flex-grow children
          (confirmed via React Flow's own "parent container needs a width and a
          height" runtime warning). Ordinary pages still scroll fine: overflow that
          would clip at a height-bound body falls back to the viewport's own
          scrollbar, since nothing here sets overflow:hidden. */}
      <body className="flex h-full flex-col">
        <StoreHydrator />
        <Navbar />
        {children}
      </body>
    </html>
  );
}
