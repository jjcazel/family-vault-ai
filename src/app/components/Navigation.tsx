"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@utils/supabase/client";
import { useRouter, usePathname } from "next/navigation";

export default function Navigation() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Get current user
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    };

    // Get user on mount and when pathname changes
    getUser();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth, pathname]); // Add pathname as dependency

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

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
            {user ? (
              <>
                <Link
                  href="/documents"
                  className={`text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-2 py-1 rounded transition-all ${
                    pathname === "/documents"
                      ? "font-bold underline underline-offset-4 text-blue-700 dark:text-blue-400"
                      : ""
                  }`}
                >
                  Documents
                </Link>
                <Link
                  href="/chat"
                  className={`text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-2 py-1 rounded transition-all ${
                    pathname === "/chat"
                      ? "font-bold underline underline-offset-4 text-blue-700 dark:text-blue-400"
                      : ""
                  }`}
                >
                  Chat
                </Link>
                <Link
                  href="/private"
                  className={`text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-2 py-1 rounded transition-all ${
                    pathname === "/private"
                      ? "font-bold underline underline-offset-4 text-blue-700 dark:text-blue-400"
                      : ""
                  }`}
                >
                  Profile
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className={`text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-2 py-1 rounded transition-all ${
                  pathname === "/login"
                    ? "font-bold underline underline-offset-4 text-blue-700 dark:text-blue-400"
                    : ""
                }`}
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
