import { useEffect, useState } from "react";

export function useWeeklyActivities(supabase, squadKey, weekNumber) {
  const [activities, setActivities] = useState([]);
  const [activitiesLoaded, setActivitiesLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadActivities() {
      if (!supabase || !squadKey || !weekNumber) {
        setActivities([]);
        setActivitiesLoaded(true);
        return;
      }

      setActivitiesLoaded(false);

      const { data, error } = await supabase
        .from("weekly_activities")
        .select("*")
        .eq("squad_key", squadKey)
        .eq("week_number", weekNumber)
        .eq("active", true)
        .order("display_order");

      if (cancelled) return;

      if (error) {
        console.error("Weekly activities lookup failed", error);
        setActivities([]);
      } else {
        setActivities(data || []);
      }

      setActivitiesLoaded(true);
    }

    loadActivities();

    return () => {
      cancelled = true;
    };
  }, [supabase, squadKey, weekNumber]);

  return { activities, activitiesLoaded };
}

export function useAllWeeklyActivities(supabase, squadKey) {
  const [weeks, setWeeks] = useState([]);
  const [weeksLoaded, setWeeksLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadWeeks() {
      if (!supabase || !squadKey) {
        setWeeks([]);
        setWeeksLoaded(true);
        return;
      }

      setWeeksLoaded(false);

      const { data, error } = await supabase
        .from("weekly_activities")
        .select("*")
        .eq("squad_key", squadKey)
        .eq("active", true)
        .order("week_number")
        .order("display_order");

      if (cancelled) return;

      if (error) {
        console.error("All weekly activities lookup failed", error);
        setWeeks([]);
      } else {
        setWeeks(data || []);
      }

      setWeeksLoaded(true);
    }

    loadWeeks();

    return () => {
      cancelled = true;
    };
  }, [supabase, squadKey]);

  return { weeks, weeksLoaded };
}