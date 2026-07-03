export default function AdminHome({ squadConfig, isSuperAdmin }) {
  return (
    <div className="page">
      <div className="hero">
        <h1>{isSuperAdmin ? "Super Admin" : "Admin"} Dashboard</h1>
        <p>{squadConfig.shortLabel}</p>
      </div>

      <div className="card">
        <h2>Squad Dashboard Foundation</h2>
        <p className="muted">Admin dashboard, leaderboard, run proofs, coach notes and fitness tests will be migrated here next.</p>
      </div>
    </div>
  );
}
