import { redirect } from "next/navigation";
import { createClient } from "@utils/supabase/server";

// Client component for date formatting in user's timezone
function ClientDateDisplay({ dateString }: { dateString: string | undefined }) {
  if (!dateString) return <span>Not available</span>;

  // This will be hydrated on the client and show in user's local timezone
  const formatDate = () => {
    if (typeof window === "undefined") {
      // Server-side fallback
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    // Client-side formatting with user's locale and timezone
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return <span suppressHydrationWarning>{formatDate()}</span>;
}

export default async function ProfilePage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    redirect("/login");
  }

  const user = data.user;

  // Extract name from email (before @ symbol) if no display name
  const displayName =
    user.user_metadata?.name || user.email?.split("@")[0] || "User";

  // Generate initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Header Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-12">
          <div className="flex items-center space-x-6">
            {/* Avatar */}
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg">
              <span className="text-2xl font-bold text-blue-600">
                {getInitials(displayName)}
              </span>
            </div>

            {/* User Info */}
            <div className="text-white">
              <h1 className="text-3xl font-bold mb-2">{displayName}</h1>
              <p className="text-blue-100 text-lg">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Profile Details */}
        <div className="px-8 py-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Account Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Account Created */}
            <div className="bg-gray-50 rounded-lg p-6">
              <div className="flex items-center mb-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                  <span className="text-green-600 text-xl">📅</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Account Created
                  </h3>
                  <p className="text-gray-600 text-sm">
                    When you joined Family Vault AI
                  </p>
                </div>
              </div>
              <p className="text-gray-900 font-medium">
                <ClientDateDisplay dateString={user.created_at} />
              </p>
            </div>

            {/* Last Updated */}
            <div className="bg-gray-50 rounded-lg p-6">
              <div className="flex items-center mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                  <span className="text-blue-600 text-xl">🔄</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Last Updated</h3>
                  <p className="text-gray-600 text-sm">
                    Most recent account activity
                  </p>
                </div>
              </div>
              <p className="text-gray-900 font-medium">
                <ClientDateDisplay dateString={user.updated_at} />
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-8 py-4 border-t">
          <p className="text-center text-gray-500 text-sm">
            🔐 Your personal information is encrypted and secure
          </p>
        </div>
      </div>
    </div>
  );
}
