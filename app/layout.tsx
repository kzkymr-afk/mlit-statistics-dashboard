import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "国交省統計システム | 必要な項目を表・グラフ・CSVへ";
const description =
  "建築着工統計、受注動態（大手50社）、建築物リフォーム・リニューアル調査を、e-Statの公式分類コードで選び、2013年度以降の表・折れ線・棒・左右2軸・CSVへ出力。";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.GITHUB_PAGES === "true"
      ? "https://kzkymr-afk.github.io/mlit-statistics-dashboard/"
      : "http://localhost:3000/",
  ),
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    locale: "ja_JP",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
