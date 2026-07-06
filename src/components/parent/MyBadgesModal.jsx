const BADGE_GOALS = [
  { badge_key: "first_mission", badge_label: "First Mission", icon: "⭐" },
  { badge_key: "first_run", badge_label: "First Run", icon: "🏃" },
  { badge_key: "first_gps_run", badge_label: "GPS Verified", icon: "📍" },
  { badge_key: "first_skill", badge_label: "First Skill", icon: "🎯" },
  { badge_key: "first_week", badge_label: "First Week", icon: "✅" },
  { badge_key: "perfect_week", badge_label: "Perfect Week", icon: "💯" },
  { badge_key: "hundred_xp", badge_label: "100 XP Club", icon: "⚡" },
  { badge_key: "two_fifty_xp", badge_label: "250 XP Club", icon: "⚡" },
  { badge_key: "five_hundred_xp", badge_label: "500 XP Club", icon: "⚡" },
  { badge_key: "training_machine", badge_label: "Training Machine", icon: "💪" },
  { badge_key: "solo_master", badge_label: "Solo Master", icon: "🏐" },
  { badge_key: "football_ace", badge_label: "Football Ace", icon: "⚽" },
  { badge_key: "hurling_hero", badge_label: "Hurling Hero", icon: "🏑" },
  { badge_key: "camogie_star", badge_label: "Camogie Star", icon: "🏑" },
  { badge_key: "squad_captain", badge_label: "Squad Captain", icon: "🤝" },
  { badge_key: "friday_regular", badge_label: "Friday Regular", icon: "🌟" },
  { badge_key: "bronze_summer", badge_label: "Bronze Summer", icon: "🥉" },
  { badge_key: "silver_summer", badge_label: "Silver Summer", icon: "🥈" },
  { badge_key: "gold_summer", badge_label: "Gold Summer", icon: "🥇" },
  { badge_key: "summer_champion", badge_label: "Summer Champion", icon: "🏆" },
];

function badgeKeyFor(badge) {
  return badge.badge_key || badge.key || badge.badge_id || badge.badge_label;
}

function badgeLabelFor(badge) {
  return badge.badge_label || badge.label || badge.name || "Badge";
}

function iconForBadge(badge) {
  const key = badgeKeyFor(badge);
  const found = BADGE_GOALS.find(item => item.badge_key === key);
  return badge.icon || found?.icon || "🏅";
}

export default function MyBadgesModal({ badges = [], onClose }) {
  const earnedKeys = new Set(badges.map(badgeKeyFor));

  const lockedBadges = BADGE_GOALS.filter(goal => !earnedKeys.has(goal.badge_key));

  return (
    <div className="badges-modal-backdrop" onClick={onClose}>
      <div className="badges-modal" onClick={event => event.stopPropagation()}>
        <button className="badges-modal-close" onClick={onClose}>
          ×
        </button>

        <div className="badges-modal-header">
          <span>🏅</span>
          <h2>My Badges</h2>
          <p>
            {badges.length
              ? `${badges.length} badge${badges.length === 1 ? "" : "s"} earned so far. Keep collecting!`
              : "Complete missions to start earning badges."}
          </p>

          <div className="next-badge-strip">
            <strong>Next up</strong>
            <span>
              {lockedBadges[0]
                ? `${lockedBadges[0].icon} ${lockedBadges[0].badge_label}`
                : "🏆 Collection complete"}
            </span>
          </div>
        </div>

        <section className="badges-modal-section">
          <h3>Earned</h3>

          {badges.length ? (
            <div className="badges-kid-grid">
              {badges.map(badge => (
                <div className="kid-badge-card earned" key={badge.id || badgeKeyFor(badge)}>
                  <span>{iconForBadge(badge)}</span>
                  <strong>{badgeLabelFor(badge)}</strong>
                  <small>Earned</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-badges-card">
              <span>⭐</span>
              <strong>No badges yet</strong>
              <p>Complete your first mission to unlock your first badge.</p>
            </div>
          )}
        </section>

        <section className="badges-modal-section">
          <h3>Coming Next</h3>

          <div className="badges-kid-grid">
            {lockedBadges.slice(0, 12).map(badge => (
              <div className="kid-badge-card locked" key={badge.badge_key}>
                <span>{badge.icon}</span>
                <strong>{badge.badge_label}</strong>
                <small>Locked</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
