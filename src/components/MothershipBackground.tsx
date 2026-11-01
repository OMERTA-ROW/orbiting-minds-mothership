import cosmos from "@/assets/mothership-cosmos.jpg.asset.json";
import "./MothershipBackground.css";

export default function MothershipBackground() {
  return (
    <div className="ms-bg" aria-hidden="true">
      <div className="ms-camera">
        <div className="ms-scene">
          <img src={cosmos.url} width={1920} height={1280} alt="" className="ms-image" fetchPriority="high" />
          <div className="ms-core" />
          <div className="ms-orbit ms-orbit--outer">
            <div className="ms-spin"><span className="ms-light" /></div>
          </div>
          <div className="ms-orbit ms-orbit--outer ms-orbit--offset">
            <div className="ms-spin"><span className="ms-light" /></div>
          </div>
          <div className="ms-orbit ms-orbit--inner">
            <div className="ms-spin ms-spin--reverse"><span className="ms-light" /></div>
          </div>
        </div>
      </div>
      <div className="ms-stars" />
      <div className="ms-vignette" />
    </div>
  );
}