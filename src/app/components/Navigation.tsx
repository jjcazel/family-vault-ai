"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@utils/supabase/client";
import { useRouter } from "next/navigation";

export default function Navigation() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    // Get initial user state
    const getInitialUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      setIsHydrated(true);
    };

    getInitialUser();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Update user state immediately
      setUser(session?.user ?? null);
      setIsHydrated(true);

      // Refresh router on auth events
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        router.refresh();
      }
    });

    // Fallback: check auth state when page becomes visible (after redirects)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        getInitialUser();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [supabase.auth, router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="bg-white shadow dark:bg-gray-800 border-b">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link
              href="/"
              className="text-xl font-bold text-gray-900 dark:text-white"
            >
              Family Vault AI
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            {!isHydrated ? (
              // During SSR and initial hydration, show the default "Sign In" to match server
              <Link
                href="/login"
                className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
              >
                Sign In
              </Link>
            ) : user ? (
              <>
                <Link
                  href="/documents"
                  className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  📄 Documents
                </Link>
                <Link
                  href="/instruments"
                  className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  🤖 Chat
                </Link>
                <Link
                  href="/private"
                  className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  👤 Profile
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
