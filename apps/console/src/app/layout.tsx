import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AccessCore Console',
  description:
    'A live, explainable ReBAC + RBAC + ABAC authorization engine. Browse the schema and relationship graph, inspect policies, and check, expand, and simulate access decisions in real time.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
