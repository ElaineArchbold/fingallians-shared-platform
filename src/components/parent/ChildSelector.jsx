export default function ChildSelector({
  players,
  selectedPlayerId,
  onSelectPlayer,
}) {
  return (
    <div className="card">
      <h2>Select your child</h2>

      <div className="squad-grid">
        {players.map(player => (
          <button
            key={player.id}
            className={`squad-card ${
              selectedPlayerId === player.id ? "selected" : ""
            }`}
            onClick={() => onSelectPlayer(player.id)}
          >
            {player.full_name}
          </button>
        ))}
      </div>
    </div>
  );
}