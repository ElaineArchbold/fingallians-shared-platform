const landingSquads = [
  { key: "2014-boys", label: "2014 Boys" },
  { key: "2015-girls", label: "2015 Girls" },
  { key: "2017-girls", label: "2017 Girls" },
  { key: "2017-boys", label: "2017 Boys" },
];

export default function LandingPage({ onSelectSquad }) {
  return (
    <div className="landing-page">
      <div className="landing-card">
        <div className="crest-wrap landing-crest">
          <img src="/fingallians-crest.png" alt="Fingallians crest" />
        </div>

        <h1>Fingallians Fitness Challenge</h1>
        <p>Select your squad to continue</p>

        <div className="squad-grid">
          {landingSquads.map(squad => (
            <button
              key={squad.key}
              className="squad-card"
              onClick={() => onSelectSquad(squad.key)}
            >
              {squad.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}