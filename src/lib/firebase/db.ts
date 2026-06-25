import { getFirestore } from "firebase/firestore";
import "./appCheck";
import { app } from "./client";

export const db = getFirestore(app);
