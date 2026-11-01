import "./OrbitalBackground.css";

export default function OrbitalBackground() {
  return (
    <div className="orbital-background" aria-hidden="true">
      <div className="orbital-nebula" />
      <div className="orbital-stars orbital-stars--far" />
      <div className="orbital-stars orbital-stars--mid" />
      <div className="orbital-stars orbital-stars--near" />
      <div className="orbital-planet-path">
        <div className="orbital-planet" />
      </div>
      <div className="orbital-vignette" />
    </div>
  );
}
