import { getFunctions } from "firebase/functions";
import { app } from "./client";

export const functions = getFunctions(
  app,
  process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1",
);
