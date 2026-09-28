import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="centered"><section className="panel">
      <p className="eyebrow">Authentication error</p><h1>We could not complete that sign-in.</h1>
      <p>Try again. If it continues, verify the Google provider and redirect URLs in Supabase.</p>
      <Link className="button" href="/login">Return to login</Link>
    </section></main>
  );
}
