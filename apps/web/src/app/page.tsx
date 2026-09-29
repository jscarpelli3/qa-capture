import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="shell">
      <nav className="nav"><span className="wordmark">QAWELL</span><span className="navNoise" aria-hidden="true">[ REVIEW SYSTEM 0.2 ]</span><Link className="button buttonSecondary" href="/login">Developer login →</Link></nav>
      <section className="hero">
        <div className="wellArt" aria-hidden="true"><Image src="/art/qawell-well.png" alt="" width={1254} height={1254} priority /></div>
        <div className="heroMark" aria-hidden="true">WELL</div>
        <h1>See it.<br />Drop a note.<br /><span>Draw up the details.</span></h1>
        <p className="lede">A deeper kind of website review. Point at the problem and QAWELL gathers the page, browser, layout, and diagnostic context around it.</p>
        <div className="buttonRow"><Link className="button" href="/login">Continue with Google</Link><a className="button buttonSecondary" href="https://jscarpelli3.github.io/qa-capture/qa-capture.js">View capture script</a></div>
      </section>
      <section className="statusGrid" aria-label="Platform components">
        <div className="wellEcho" aria-hidden="true"><Image src="/art/qawell-well.png" alt="" width={1254} height={1254} /></div>
        <article><span>01 ↓</span><h2>Drop it in</h2><p>Leave contextual notes directly on the staging site.</p></article>
        <article><span>02 ↓</span><h2>Go deep</h2><p>Each note carries the technical evidence beneath the surface.</p></article>
        <article><span>03 ↑</span><h2>Pull it out</h2><p>Receive a portable review package ready for people, tools, or agents.</p></article>
      </section>
    </main>
  );
}
