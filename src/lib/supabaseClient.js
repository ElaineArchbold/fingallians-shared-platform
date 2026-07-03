import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectConfig } from "../config/supabaseProjects";

const clients = new Map();

export function getSupabaseClient(squadConfig) {
  const project = getSupabaseProjectConfig(squadConfig.dbProject);
  if (!project) return null;

  const storageKey = `fingallians-${squadConfig.key}-auth`;
  const cacheKey = `${project.url}:${storageKey}`;

  if (!clients.has(cacheKey)) {
    clients.set(cacheKey, createClient(project.url, project.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey,
      },
    }));
  }

  return clients.get(cacheKey);
}
