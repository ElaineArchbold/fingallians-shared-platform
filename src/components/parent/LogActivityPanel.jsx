import { useState } from "react";

export default function LogActivityPanel({
  supabase,
  selectedPlayer,
  squadConfig,
  onBack,
}) {
  const [activityType, setActivityType] = useState("run");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("km");
  const [notes, setNotes] = useState("");

  const requiresApproval =
    activityType === "squad-session" ||
    (
      activityType === "friday-night-hurling" &&
      ["2014-boys", "2015-girls"].includes(squadConfig.key)
    );

 async function saveActivity() {
  const { error } = await supabase
    .from("activities")
    .insert({
      player_id: selectedPlayer.id,
      activity_type: activityType,
      value: Number(value) || 1,
      unit,
      notes,
      source: "manual",
      approval_required: requiresApproval,
      status: requiresApproval ? "pending" : "approved",
    });

  if (error) {
    alert(error.message);
    return;
  }

  alert(
    requiresApproval
      ? "Activity submitted for admin approval."
      : "Activity saved successfully."
  );

  setValue("");
  setNotes("");
}

  return (
    <div className="card">
      <button className="link-button" onClick={onBack}>
        ← Back to dashboard
      </button>

      <h2>Log activity</h2>

      <p className="muted">
        Add activity for <strong>{selectedPlayer.name}</strong>
      </p>

      <label className="label">Activity</label>

      <select
        className="select"
        value={activityType}
        onChange={e => setActivityType(e.target.value)}
      >
        <option value="run">Run</option>
        <option value="walk">Walk</option>
        <option value="cycle">Cycle</option>
        <option value="training">Training</option>
        <option value="squad-session">Squad Session</option>
        <option value="friday-night-hurling">
          Friday Night Hurling
        </option>
      </select>

      <label className="label">
        {activityType === "training" ? "Minutes" : "Distance"}
      </label>

      <input
        className="input"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={
          activityType === "training"
            ? "45"
            : "2.5"
        }
      />

      <label className="label">Notes</label>

      <input
        className="input"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Optional"
      />

      {requiresApproval ? (
        <div className="dev-note">
          This activity will require approval from your squad administrator.
        </div>
      ) : null}

      <button
        className="button primary"
        onClick={saveActivity}
      >
        Save activity
      </button>
    </div>
  );
}