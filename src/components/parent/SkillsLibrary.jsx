import { useEffect, useMemo, useState } from "react";

const OFFICIAL_SKILLS = [
  // Football — exact GAALearning / LGFA videos
  { id: "football-crouch-lift", sport: "football", category: "Gaining Possession", title: "The Crouch Lift", youtubeId: "lwALuwq8yJs" },
  { id: "football-high-catch", sport: "football", category: "Gaining Possession", title: "The High Catch", youtubeId: "1QGiCAg26aE" },
  { id: "football-low-catch", sport: "football", category: "Gaining Possession", title: "The Low Catch", youtubeId: "cYfBWfnGTb0" },
  { id: "football-reach-catch", sport: "football", category: "Gaining Possession", title: "The Reach Catch", youtubeId: "wca7WNG2N5c" },
  { id: "football-bounce", sport: "football", category: "Maintaining Possession", title: "The Bounce", youtubeId: "Zu3BZe6_FkQ" },
  { id: "football-toe-tap", sport: "football", category: "Maintaining Possession", title: "The Toe Tap / Solo", youtubeId: "MZwQ695hqgk" },
  { id: "football-side-step", sport: "football", category: "Maintaining Possession", title: "The Feint / Side Step", youtubeId: "lZ0J-WG3iSQ" },
  { id: "football-roll-off", sport: "football", category: "Maintaining Possession", title: "Evasion / Roll Off", youtubeId: "ktIVTJFDnjo" },
  { id: "football-fist-pass", sport: "football", category: "Releasing Possession", title: "The Fist Pass", youtubeId: "6RvLEuRiFO8" },
  { id: "football-hand-pass", sport: "football", category: "Releasing Possession", title: "The Hand Pass", youtubeId: "28vEqlirsxE" },
  { id: "football-punt-kick", sport: "football", category: "Releasing Possession", title: "The Punt Kick", youtubeId: "qsq61w-XWDg" },
  { id: "football-hook-kick", sport: "football", category: "Releasing Possession", title: "The Hook Kick", youtubeId: "Vjp2oeXWB3c" },
  { id: "football-side-charge", sport: "football", category: "Contesting Possession", title: "Side-to-Side Charge", youtubeId: "xWHrrv-OANE" },
  { id: "football-shadowing", sport: "football", category: "Contesting Possession", title: "Shadowing", youtubeId: "tMCQ0tSUc_I" },
  { id: "football-near-hand", sport: "football", category: "Contesting Possession", title: "Near Hand Tackle", youtubeId: "5S609N4l4yQ" },
  { id: "football-block-down", sport: "football", category: "Contesting Possession", title: "Block Down", youtubeId: "2NTGxFKsB3A" },

  // Hurling / Camogie — exact GAALearning videos
  { id: "hurling-ground-ball", sport: "hurling", category: "Gaining Possession", title: "Stopping a Ground Ball", youtubeId: "qZyIN2XRvRA" },
  { id: "hurling-moving-ball", sport: "hurling", category: "Gaining Possession", title: "Controlling a Moving Ball", youtubeId: "FACYIJNt-zY" },
  { id: "hurling-overhead-block", sport: "hurling", category: "Gaining Possession", title: "Blocking a Ball Overhead", youtubeId: "sFEkqW_buxM" },
  { id: "hurling-chest-catch", sport: "hurling", category: "Gaining Possession", title: "Chest Catch", youtubeId: "8ZGbLzsgWsw" },
  { id: "hurling-jab-lift", sport: "hurling", category: "Gaining Possession", title: "The Jab Lift", youtubeId: "qTDuYiUMVjs" },
  { id: "hurling-roll-lift", sport: "hurling", category: "Gaining Possession", title: "The Roll Lift", youtubeId: "y_yz7M-wcoc" },
  { id: "hurling-overhead-catch", sport: "hurling", category: "Gaining Possession", title: "The Overhead Catch", youtubeId: "lT3d8cIH7b4" },
  { id: "hurling-dribble", sport: "hurling", category: "Maintaining Possession", title: "The Dribble", youtubeId: "Yh9tyfijgmE" },
  { id: "hurling-strike-hand", sport: "hurling", category: "Releasing Possession", title: "Strike from the Hand", youtubeId: "A4qGKdeviHU" },
  { id: "hurling-hook", sport: "hurling", category: "Contesting Possession", title: "Hook", youtubeId: "oEfRVNH7Xx4" },
  { id: "hurling-puck-out", sport: "hurling", category: "Select Skills", title: "Puck Out", youtubeId: "c6Ce9H6yrqc" },
  { id: "hurling-sideline-cut", sport: "hurling", category: "Select Skills", title: "Sideline Cut", youtubeId: "5TR2Vb7wN1k" },
].map(item => ({ ...item, source: "GAA coaching video" }));

function skillIcon(sport) {
  if (sport === "football") return "⚽";
  if (sport === "hurling") return "🏑";
  return "🏃";
}

function normalise(value = "") {
  return String(value).toLowerCase().trim();
}

function initials(name = "") {
  return String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function SkillsLibrary({
  supabase,
  squadConfig,
  selectedPlayer,
  hasMultipleChildren = false,
  onSwitchChild,
  onBack,
}) {
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("all");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [favourites, setFavourites] = useState([]);
  const [runningSkills, setRunningSkills] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);

  const favouriteKey = `skillsLibraryFavourites:${selectedPlayer?.id || "guest"}`;
  const camogieLabel = String(squadConfig?.key || "").includes("girls")
    ? "Hurling / Camogie"
    : "Hurling";

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(favouriteKey) || "[]");
      setFavourites(Array.isArray(stored) ? stored : []);
    } catch {
      setFavourites([]);
    }
  }, [favouriteKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadRunningSkills() {
      if (!supabase || !squadConfig?.key) return;

      const { data, error } = await supabase
        .from("weekly_activities")
        .select("id,title,youtube_id")
        .eq("squad_key", squadConfig.key)
        .eq("activity_key", "running-technique")
        .not("youtube_id", "is", null)
        .order("week_number");

      if (cancelled) return;
      if (error) {
        console.error("Could not load running skills", error);
        setRunningSkills([]);
        return;
      }

      const seen = new Set();
      const unique = (data || [])
        .filter(item => {
          const key = `${normalise(item.title)}:${item.youtube_id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((item, index) => ({
          id: `running-${item.id || index}`,
          sport: "running",
          category: "Speed & Running",
          title: item.title,
          youtubeId: item.youtube_id,
          source: "Challenge running library",
        }));

      setRunningSkills(unique);
    }

    loadRunningSkills();
    return () => {
      cancelled = true;
    };
  }, [supabase, squadConfig?.key]);

  function toggleFavourite(id) {
    setFavourites(current => {
      const next = current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id];

      try {
        localStorage.setItem(favouriteKey, JSON.stringify(next));
      } catch (error) {
        console.warn("Could not save skill favourites", error);
      }

      return next;
    });
  }

  const allSkills = useMemo(
    () => [...OFFICIAL_SKILLS, ...runningSkills],
    [runningSkills]
  );

  const filteredSkills = useMemo(() => {
    const search = normalise(query);

    return allSkills.filter(item => {
      if (sport !== "all" && item.sport !== sport) return false;
      if (favouritesOnly && !favourites.includes(item.id)) return false;
      if (!search) return true;

      return [item.title, item.category, item.sport]
        .some(value => normalise(value).includes(search));
    });
  }, [allSkills, favourites, favouritesOnly, query, sport]);

  const grouped = useMemo(() => {
    return filteredSkills.reduce((result, item) => {
      const heading = item.sport === "hurling"
        ? `${camogieLabel} · ${item.category}`
        : item.sport === "football"
          ? `Football · ${item.category}`
          : "Speed & Running";

      if (!result[heading]) result[heading] = [];
      result[heading].push(item);
      return result;
    }, {});
  }, [camogieLabel, filteredSkills]);

  return (
    <div className="page skills-library-page">
      {onBack ? (
        <button className="skills-library-back" type="button" onClick={onBack}>
          ← Back to challenge
        </button>
      ) : null}

      <section className="player-card skills-player-card">
        <div className="player-avatar">{initials(selectedPlayer?.name)}</div>
        <div className="player-card-main">
          <div className="settings-player-title-row">
            <h2>{selectedPlayer?.name || "Skills Library"}</h2>
            {hasMultipleChildren ? (
              <button className="child-name-switch" onClick={onSwitchChild} aria-label="Switch child">
                ⌄
              </button>
            ) : null}
          </div>
          <p>{squadConfig?.shortLabel || squadConfig?.label}</p>
          <small>Practise any time. Library videos do not award XP or change weekly progress.</small>
        </div>
      </section>

      <section className="skills-library-hero">
        <div>
          <span className="skills-library-eyebrow">📚 Skills Library</span>
          <h1>Choose a skill to practise</h1>
          <p>Search the full football, {camogieLabel.toLowerCase()} and speed collection.</p>
        </div>
        <strong>{filteredSkills.length}</strong>
      </section>

      <section className="skills-library-controls">
        <label className="skills-search-wrap">
          <span>🔎</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search skills, for example solo or catch"
          />
        </label>

        <div className="skills-filter-row">
          {[
            ["all", "All"],
            ["football", "⚽ Football"],
            ["hurling", `🏑 ${camogieLabel}`],
            ["running", "🏃 Speed & Running"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={sport === value ? "active" : ""}
              onClick={() => setSport(value)}
            >
              {label}
            </button>
          ))}

          <button
            type="button"
            className={favouritesOnly ? "active favourite-filter" : "favourite-filter"}
            onClick={() => setFavouritesOnly(value => !value)}
          >
            ★ Favourites
          </button>
        </div>
      </section>

      {Object.keys(grouped).length ? (
        Object.entries(grouped).map(([heading, items]) => (
          <section className="skills-library-group" key={heading}>
            <h2>{heading}</h2>
            <div className="skills-card-grid">
              {items.map(item => {
                const favourite = favourites.includes(item.id);

                return (
                  <article className="skills-library-card" key={item.id}>
                    <button
                      type="button"
                      className={favourite ? "skill-favourite active" : "skill-favourite"}
                      onClick={() => toggleFavourite(item.id)}
                      aria-label={favourite ? "Remove favourite" : "Add favourite"}
                    >
                      {favourite ? "★" : "☆"}
                    </button>

                    <button
                      type="button"
                      className="skill-video-preview"
                      onClick={() => setSelectedVideo(item)}
                      aria-label={`Watch ${item.title}`}
                    >
                      <img
                        src={`https://img.youtube.com/vi/${item.youtubeId}/hqdefault.jpg`}
                        alt={`${item.title} video thumbnail`}
                      />
                      <span>▶</span>
                    </button>

                    <div className="skill-library-card-icon">{skillIcon(item.sport)}</div>
                    <small>{item.category}</small>
                    <h3>{item.title}</h3>
                    <p>{item.source}</p>

                    <button
                      type="button"
                      className="button primary skill-watch-button"
                      onClick={() => setSelectedVideo(item)}
                    >
                      ▶ Watch Video
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <section className="skills-empty-card">
          <span>🔎</span>
          <h2>No skills found</h2>
          <p>Try a different search or turn off the favourites filter.</p>
        </section>
      )}

      {selectedVideo ? (
        <div className="skill-video-modal-backdrop" onClick={() => setSelectedVideo(null)}>
          <div className="skill-video-modal" onClick={event => event.stopPropagation()}>
            <button
              type="button"
              className="skill-video-modal-close"
              onClick={() => setSelectedVideo(null)}
              aria-label="Close video"
            >
              ×
            </button>

            <div className="skill-video-modal-header">
              <span>{skillIcon(selectedVideo.sport)}</span>
              <div>
                <small>{selectedVideo.category}</small>
                <h2>{selectedVideo.title}</h2>
              </div>
            </div>

            <div className="video-frame skill-video-modal-frame">
              <iframe
                src={`https://www.youtube.com/embed/${selectedVideo.youtubeId}?autoplay=1&rel=0`}
                title={selectedVideo.title}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
