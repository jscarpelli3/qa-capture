import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="shell">
      <nav className="nav"><span className="wordmark">QAWELL</span><span className="navNoise" aria-hidden="true">[ REVIEW SYSTEM 0.2 ]</span><Link className="button buttonSecondary" href="/login">Developer login →</Link></nav>
      <section className="hero">
        <div className="wellArt" aria-hidden="true"><Image src="/art/qawell-well.png" alt="" width={1254} height={1254} priority /></div>
        <div className="heroMark" aria-hidden="true">WELL</div>
        <h1>See it.<br />Mark it.<br /><span>Send the context.</span></h1>
        <p className="lede">A deeper kind of website review. Point at the problem and QAWELL gathers the page, browser, layout, and diagnostic context around it.</p>
        <div className="buttonRow"><Link className="button" href="/login">Continue with Google</Link><a className="button buttonSecondary" href="https://jscarpelli3.github.io/qa-capture/qa-capture.js">View capture script</a></div>
      </section>
      <section className="statusGrid" aria-label="Platform components">
        <article><span>01 //</span><h2>Mark the spot</h2><p>Leave a clear note directly on the part of the staging site that needs attention.</p></article>
        <article><span>02 //</span><h2>Keep the context</h2><p>QAWELL adds the browser, layout, element, and diagnostic evidence automatically.</p></article>
        <article><span>03 //</span><h2>Hand it off</h2><p>Send one structured review package to a developer, a team, or another tool.</p></article>
      </section>
      <div className="wellMouth" aria-hidden="true"><Image src="/art/qawell-well.png" alt="" width={1254} height={1254} /></div>
    </main>
  );
}
