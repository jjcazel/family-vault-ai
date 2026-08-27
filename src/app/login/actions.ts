"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@utils/supabase/server";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }

  return fallback;
}

function redirectWithError(
  mode: string,
  error: unknown,
  fallback: string,
): never {
  const params = new URLSearchParams({
    mode,
    error: getErrorMessage(error, fallback),
  });

  redirect(`/login?${params.toString()}`);
}

export async function login(formData: FormData) {
  const supabase = await createClient();

  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  // Basic validation
  if (!data.email || !data.password) {
    redirectWithError("signin", null, "Email and password are required");
  }

  const { error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    redirectWithError("signin", error, "Unable to sign in");
  }

  revalidatePath("/", "layout");
  redirect("/documents");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    fullName: formData.get("fullName") as string,
  };

  // Basic validation
  if (!data.email || !data.password) {
    redirectWithError("signup", null, "Email and password are required");
  }

  if (!data.fullName?.trim()) {
    redirectWithError("signup", null, "Full name is required");
  }

  if (data.password.length < 6) {
    redirectWithError("signup", null, "Password must be at least 6 characters");
  }

  const { error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        name: data.fullName.trim(),
      },
    },
  });

  if (error) {
    redirectWithError("signup", error, "Unable to create your account");
  }

  // Signup successful - show success message and prompt for email verification
  redirect(
    "/login?mode=signin&message=Success! Please check your email to verify your account, then sign in.",
  );
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;

  // Basic validation
  if (!email) {
    redirectWithError("reset", null, "Email is required for password reset");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
    }/auth/reset-password`,
  });

  if (error) {
    redirectWithError(
      "reset",
      error,
      "Unable to send the password reset email",
    );
  }

  redirect(
    "/login?mode=reset&message=Password reset email sent! Check your inbox.",
  );
}
