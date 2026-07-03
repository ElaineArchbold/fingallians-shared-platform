import { SQUADS } from "../../config/squads";

export default function SquadSelector({ value, onChange, allowedKeys = Object.keys(SQUADS), label = "Select squad/year" }) {
  const keys = allowedKeys.filter(key => SQUADS[key]);

  return (
    <div className="card">
      <label className="label">{label}</label>
      <select className="select" value={value} onChange={e => onChange(e.target.value)}>
        {keys.map(key => (
          <option key={key} value={key}>{SQUADS[key].shortLabel}</option>
        ))}
      </select>
    </div>
  );
}
