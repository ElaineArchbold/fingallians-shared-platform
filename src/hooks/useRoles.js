import { useEffect, useState } from "react";

export function useRoles(supabase, session) {
  const [roles, setRoles] = useState([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRoles() {
      if (!supabase || !session?.user?.email) {
        setRoles([]);
        setRolesLoaded(true);
        return;
      }

      setRolesLoaded(false);
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("user_email,squad,role")
          .eq("user_email", session.user.email.toLowerCase());

        if (cancelled) return;
        if (error) {
          console.error("Role lookup failed", error);
          setRoles([]);
        } else {
          setRoles(data || []);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Role lookup crashed", e);
          setRoles([]);
        }
      } finally {
        if (!cancelled) setRolesLoaded(true);
      }
    }

    loadRoles();
    return () => { cancelled = true; };
  }, [supabase, session?.user?.email]);

  return { roles, rolesLoaded };
}
