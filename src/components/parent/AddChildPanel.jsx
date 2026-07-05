export default function AddChildPanel({ squadConfig, onCancel }) {
  return (
    <div className="card">
      <h2>Add another child</h2>
      <p className="muted">
        This will link another child to your account for {squadConfig.shortLabel}.
      </p>

      <label className="label">Child name</label>
      <input className="input" placeholder="Enter child name" />

      <button className="button primary">
        Request link
      </button>

      <button className="link-button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}