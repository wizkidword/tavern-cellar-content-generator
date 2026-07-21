"use server";

import { redirect } from "next/navigation";

import {
  assertLoginAttemptAllowed,
  clearFailedLoginAttempts,
  RateLimitedError,
  recordFailedLoginAttempt,
} from "@/lib/auth/rate-limit";
import {
  assertOperatorActionAccess,
  assertOperatorCredential,
  clearOperatorSession,
  createOperatorSession,
} from "@/lib/operator-auth";

export async function loginOperatorAction(formData: FormData) {
  const credential = String(formData.get("operatorToken") ?? "");
  let credentialIsValid = false;

  try {
    assertLoginAttemptAllowed();
    credentialIsValid = assertOperatorCredential(credential);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      redirect("/login?error=RATE_LIMITED");
    }

    redirect("/login?error=AUTH_CONFIGURATION_INVALID");
  }

  if (!credentialIsValid) {
    recordFailedLoginAttempt();
    redirect("/login?error=AUTH_INVALID");
  }

  try {
    await createOperatorSession();
    clearFailedLoginAttempts();
  } catch {
    redirect("/login?error=AUTH_CONFIGURATION_INVALID");
  }

  redirect("/");
}

export async function logoutOperatorAction() {
  await assertOperatorActionAccess();
  await clearOperatorSession();
  redirect("/login?message=SIGNED_OUT");
}
