"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@utils/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  // Basic validation
  if (!data.email || !data.password) {
    redirect("/login?mode=signin&error=Email and password are required");
  }

  const { error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    redirect(`/login?mode=signin&error=${encodeURIComponent(error.message)}`);
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
    redirect("/login?mode=signup&error=Email and password are required");
  }

  if (!data.fullName?.trim()) {
    redirect("/login?mode=signup&error=Full name is required");
  }

  if (data.password.length < 6) {
    redirect("/login?mode=signup&error=Password must be at least 6 characters");
  }

  // First, try to sign in with the email to check if user already exists
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: "dummy_password_to_check_existence",
  });

  // If we get an "Invalid login credentials" error, it might mean the user exists but password is wrong
  // If we get "Email not confirmed", the user definitely exists
  if (
    signInError &&
    (signInError.message.includes("Email not confirmed") ||
      signInError.message.includes("Invalid login credentials"))
  ) {
    redirect(
      "/login?mode=signup&error=An account with this email already exists. Please sign in instead."
    );
  }

  const { data: signUpData, error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        name: data.fullName.trim(),
      },
    },
  });

  if (error) {
    redirect(`/login?mode=signup&error=${encodeURIComponent(error.message)}`);
  }

  // Additional check: if signUp returns a user but no session, user likely already exists
  if (signUpData.user && !signUpData.session) {
    redirect(
      "/login?mode=signup&error=An account with this email already exists. Please sign in instead."
    );
  }

  // Signup successful - show success message and prompt for email verification
  redirect(
    "/login?mode=signin&message=Success! Please check your email to verify your account, then sign in."
  );
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;

  // Basic validation
  if (!email) {
    redirect("/login?mode=reset&error=Email is required for password reset");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
    }/auth/reset-password`,
  });

  if (error) {
    redirect(`/login?mode=reset&error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    "/login?mode=reset&message=Password reset email sent! Check your inbox."
  );
}
