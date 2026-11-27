import { redirect } from 'next/navigation';

/** The console has one section so far; the front door leads straight to it. */
export default function Home() {
  redirect('/properties');
}
