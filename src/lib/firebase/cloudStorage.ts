import { getStorage } from "firebase/storage";
import { app, resolveEnv, storageBucketGsUrl } from "./client";

const bucket = resolveEnv(
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
);

export const storage = getStorage(app, storageBucketGsUrl(bucket));
