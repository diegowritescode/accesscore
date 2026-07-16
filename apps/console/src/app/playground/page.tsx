import { redirect } from 'next/navigation';

export default function LegacyPlaygroundPage() {
  redirect('/console/playground');
}
