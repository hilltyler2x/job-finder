import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Supabase client acting as the signed-in user (row-level security applies).
export async function userClient() {
  const store = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component; the middleware refreshes cookies instead.
        }
      },
    },
  });
}

// Server-only client that bypasses row-level security. Never send it to the browser.
export function adminClient() {
  return createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

// Returns the signed-in user's id, or null.
export async function currentUserId() {
  const sb = await userClient();
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}
