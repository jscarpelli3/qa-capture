import Image from "next/image";

type WidgetPreviewProps = {
  organization: string;
  project: string;
  environment: string;
  provider?: string | null;
  destination?: string | null;
};

export function WidgetPreview({ organization, project, environment, provider, destination }: WidgetPreviewProps) {
  const delivery = provider
    ? `${provider === "agency_brain" ? "Agency Brain" : "Sifter"}${destination ? ` / ${destination}` : ""}`
    : "Raw ZIP download";

  return <div className="widgetPreviewBlock">
    <div className="widgetPreviewHeading"><span>WIDGET PREVIEW //</span><small>Non-interactive</small></div>
    <div className="widgetPreviewStage">
      <div className="fakeWidgetPanel">
        <p className="fakeWidgetTitle">Start a QA review</p>
        <div className="fakeWidgetIdentity"><strong>{project}</strong><span>{organization} · {environment} · {delivery}</span></div>
        <label>Your name</label><div className="fakeWidgetInput">Jane Reviewer</div>
        <p className="fakeWidgetHint">Your notes stay attached to this review.</p>
        <button type="button" tabIndex={-1}>Start review</button>
      </div>
      <div className="fakeWidgetToolbar">
        <span className="fakeWell"><Image src="/icon.png" width={128} height={128} alt="" /></span>
        <span className="fakePrimary">＋ Add note</span><span>0 notes</span><span>{provider ? "Send QA" : "Export ZIP"}</span>
      </div>
    </div>
  </div>;
}
