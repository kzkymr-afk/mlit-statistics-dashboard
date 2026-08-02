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
  "国交省・日建連の建設統計と、BuildBaseで確定したゼネコン21社の会社別データを、表・折れ線・棒・左右2軸・CSVで比較。";

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
