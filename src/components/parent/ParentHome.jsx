export default function ParentHome({ squadConfig, players, selectedPlayerId, onSelectPlayer }) {
  const selectedPlayer = players.find(p => p.id === selectedPlayerId) || null;

  return (
    <div className="page">
      <div className="hero">
        <h1>Fingallians Fitness Challenge</h1>
        <p>{squadConfig.shortLabel}</p>
      </div>

      <div className="card">
        <label className="label">Select your child</label>
        {players.length ? (
          <select className="select" value={selectedPlayerId || ""} onChange={e => onSelectPlayer(e.target.value)}>
            <option value="">Choose your child</option>
            {players.map(player => (
              <option key={player.id} value={player.id}>{player.name}</option>
            ))}
          </select>
        ) : (
          <p className="muted">No child is linked to this account for {squadConfig.shortLabel} yet.</p>
        )}
      </div>

      {selectedPlayer ? (
        <div className="card">
          <h2>{selectedPlayer.name}</h2>
          <p className="muted">Parent View foundation is ready. We will migrate plan, progress and run logging next.</p>
        </div>
      ) : null}
    </div>
  );
}
