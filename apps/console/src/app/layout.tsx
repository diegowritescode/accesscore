import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AccessCore Playground',
  description:
    'A live, explainable ReBAC + RBAC + ABAC authorization engine. Check, expand, and simulate access decisions in real time.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
