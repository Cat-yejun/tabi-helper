import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Tabi · 일본 여행 도우미",
  description: "영수증 가계부 · 일정표 · 길찾기 · 번역 · 비서",
};

export const viewport: Viewport = {
  themeColor: "#14233B",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <div className="mx-auto min-h-screen max-w-md pb-20">{children}</div>
        <Nav />
      </body>
    </html>
  );
}
