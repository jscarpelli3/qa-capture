import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QA Capture",
  description: "Structured website review sessions for developers and QA teams.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
