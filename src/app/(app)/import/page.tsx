import { redirect } from "next/navigation";

export default function ImportRoute() {
  redirect("/recipes?dialog=import");
}
