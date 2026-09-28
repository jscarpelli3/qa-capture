import Link from "next/link";

export default function Home() {
  return (
    <main className="shell">
      <nav className="nav"><span className="wordmark">QA CAPTURE</span><Link className="button buttonSecondary" href="/login">Developer login</Link></nav>
      <section className="hero">
        <p className="eyebrow">Website review infrastructure</p>
        <h1>Turn feedback on a live site into structured, actionable QA.</h1>
        <p className="lede">Install one script, invite a reviewer, and receive portable review packages with DOM, layout, browser, and diagnostic context.</p>
        <div className="buttonRow"><Link className="button" href="/login">Continue with Google</Link><a className="button buttonSecondary" href="https://jscarpelli3.github.io/qa-capture/qa-capture.js">View capture script</a></div>
      </section>
      <section className="statusGrid" aria-label="Platform components">
        <article><span>01</span><h2>Capture</h2><p>Contextual notes on the actual staging site.</p></article>
        <article><span>02</span><h2>Verify</h2><p>Invited identity and project-scoped submission.</p></article>
        <article><span>03</span><h2>Deliver</h2><p>Canonical ZIPs today; integrations and renderers next.</p></article>
      </section>
    </main>
  );
}
