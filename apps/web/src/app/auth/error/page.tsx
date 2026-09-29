import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="centered"><section className="panel">
      <div className="panelIndex errorIndex" aria-hidden="true">ERR<br />/AUTH</div>
      <h1>Not<br />signed in.</h1>
      <p className="panelNote">Try again. If it continues, verify the Google provider and redirect URLs in Supabase.</p>
      <Link className="button" href="/login">Return to login</Link>
    </section></main>
  );
}
