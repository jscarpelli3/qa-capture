import Image from "next/image";
import { integrationLabel } from "@/lib/delivery-adapters/catalog";

type WidgetPreviewProps = {
  organization: string;
  project: string;
  environment: string;
  provider?: string | null;
  destination?: string | null;
};

export function WidgetPreview({ organization, project, environment, provider, destination }: WidgetPreviewProps) {
  const delivery = provider
    ? `${integrationLabel(provider)}${destination ? ` / ${destination}` : ""}`
    : "Raw ZIP download";

  return <div className="widgetPreviewBlock">
    <div className="widgetPreviewHeading"><span>WIDGET PREVIEW //</span><small>Non-interactive</small></div>
    <div className="widgetPreviewStage">
      <div className="fakeWidgetPanel">
        <p className="fakeWidgetTitle">Start a QA review</p>
        <div className="fakeWidgetIdentity"><strong>{project}</strong><span>For {organization}</span><em>Reviewing the {environment} site.</em><em>{provider ? `This session will download a ZIP. Use a QAWELL invitation link to send notes to ${delivery}.` : "When you finish, your notes will download as a ZIP."}</em></div>
        <label>Your name</label><div className="fakeWidgetInput">Bob Sacamano</div>
        <p className="fakeWidgetHint">Your notes stay attached to this review.</p>
        <button type="button" tabIndex={-1}>Start review</button>
      </div>
      <div className="fakeWidgetToolbar">
        <span className="fakeWell"><Image src="/icon.png" width={128} height={128} alt="" /></span>
        <span className="fakePrimary">＋ Add note</span><span>0 notes</span><span>Download ZIP</span>
      </div>
    </div>
  </div>;
}
