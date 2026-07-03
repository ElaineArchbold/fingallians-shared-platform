export const SUPABASE_PROJECTS = {
  boys: {
    url: import.meta.env.VITE_BOYS_SUPABASE_URL,
    anonKey: import.meta.env.VITE_BOYS_SUPABASE_ANON_KEY,
  },
  girls: {
    url: import.meta.env.VITE_GIRLS_SUPABASE_URL,
    anonKey: import.meta.env.VITE_GIRLS_SUPABASE_ANON_KEY,
  },
};

export function getSupabaseProjectConfig(dbProject) {
  const config = SUPABASE_PROJECTS[dbProject];
  if (!config?.url || !config?.anonKey) return null;
  return config;
}
