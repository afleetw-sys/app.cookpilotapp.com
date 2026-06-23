import { redirect } from "next/navigation";

// "/" is the public landing entry point and bounces to the product. We forward
// any query string (notably the yard-sign campaign's UTM params) so analytics
// and first-touch attribution can read them on the destination page instead of
// having them silently dropped by the redirect.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }

  const search = query.toString();
  redirect(search ? `/recipes?${search}` : "/recipes");
}
