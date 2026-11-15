import "./globals.css";

export const metadata = {
  title: "Chat CSV · Sisyphus",
  description: "Ask questions about your CSV and XLSX spreadsheets with Sisyphus. Google sign-in required; free daily usage.",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
