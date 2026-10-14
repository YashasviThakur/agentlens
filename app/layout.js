import './globals.css';

export const metadata = {
  title: 'AgentLens — see your page the way AI sees it',
  description:
    'Audit any URL for AI readiness: what AI search and fetch tools actually see, built on TinyFish Fetch and Search.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
