import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="shell">
      <nav className="nav"><Link className="brand" href="/"><span className="navWell" aria-hidden="true"><Image src="/art/qawell-well.png" alt="" width={1254} height={1254} priority /></span><span className="wordmark">QAWELL</span></Link><span className="navNoise" aria-hidden="true">[ REVIEW SYSTEM 0.2 ]</span><Link className="button buttonSecondary" href="/login">Developer login →</Link></nav>
      <section className="hero">
        <div className="heroMark" aria-hidden="true">WELL</div>
        <h1>See it.<br />Mark it.<br /><span>Send the context.</span></h1>
        <p className="lede">A deeper kind of website review. Point at the problem and QAWELL gathers the page, browser, layout, and diagnostic context around it.</p>
        <div className="buttonRow"><Link className="button" href="/login">Continue with Google</Link></div>
      </section>
      <section className="statusGrid" aria-label="Platform components">
        <article><span>01 //</span><h2>Mark the spot</h2><p>Leave a clear note directly on the part of the staging site that needs attention.</p></article>
        <article><span>02 //</span><h2>Keep the context</h2><p>QAWELL adds the browser, layout, element, and diagnostic evidence automatically.</p></article>
        <article><span>03 //</span><h2>Hand it off</h2><p>Send one structured review package to a developer, a team, or another tool.</p></article>
      </section>
      <section className="howItWorks">
        <header><span>THE WHOLE LOOP //</span><h2>Review the site.<br />Keep the evidence.</h2><p>QAWELL sits on the staging site while someone reviews it. The reviewer writes ordinary notes; the utility quietly packages the technical context a developer would otherwise have to reconstruct.</p></header>
        <div className="howSteps">
          <article><b>1</b><div><h3>Set up the project</h3><p>Add the staging origin, install one project-specific script, and choose where finished QA should be delivered.</p></div></article>
          <article><b>2</b><div><h3>Review in place</h3><p>The reviewer clicks the actual element and describes the issue. QAWELL records the URL, viewport, element path, computed styles, browser context, and available diagnostics with that note.</p></div></article>
          <article><b>3</b><div><h3>Send one structured review</h3><p>At the end of the session, the reviewer verifies their identity and submits. QAWELL validates the package, preserves the original archive, and routes each note to the selected integration.</p></div></article>
          <article><b>4</b><div><h3>Work where you already work</h3><p>Agency Brain is first: each note becomes a QA ticket in the chosen project. Sifter is next. The underlying package stays portable, so more adapters can be added without changing the capture utility.</p></div></article>
        </div>
      </section>
      <div className="wellMouth wellMouthBack" aria-hidden="true"><Image src="/art/qawell-well.png" alt="" width={1254} height={1254} /></div>
      <div className="wellMouth wellMouthFront" aria-hidden="true"><Image src="/art/qawell-well.png" alt="" width={1254} height={1254} /></div>
    </main>
  );
}
