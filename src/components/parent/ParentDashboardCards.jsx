const CARDS = [
  {
    key: "log-activity",
    icon: "🏃",
    title: "Log activity",
    text: "Record runs and fitness work",
  },
  {
    key: "progress",
    icon: "📈",
    title: "Progress",
    text: "Track weekly challenge progress",
  },
  {
    key: "leaderboard",
    icon: "🏆",
    title: "Leaderboard",
    text: "Celebrate effort and consistency",
  },
  {
    key: "profile",
    icon: "👤",
    title: "Profile",
    text: "Child and parent details",
  },
];

export default function ParentDashboardCards({ onOpen }) {
  return (
    <div className="feature-grid" style={{ marginTop: "18px" }}>
      {CARDS.map(card => (
        <button
          type="button"
          className="feature-card feature-card-button"
          key={card.key}
          onClick={() => onOpen(card.key)}
        >
          <div className="feature-icon">{card.icon}</div>
          <div>
            <strong>{card.title}</strong>
            <span>{card.text}</span>
          </div>
        </button>
      ))}
    </div>
  );
}