import { createClient } from "@sanity/client";
import dotenv from "dotenv";

// Load environment variables from .env.local file
dotenv.config({ path: ".env.local" });

// Use environment variables directly (works on Vercel and locally)
// Supports both NEXT_PUBLIC_* and SANITY_STUDIO_* variable names
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET;
const apiToken = process.env.SANITY_API_TOKEN;

if (!projectId) {
  console.error("❌ Error: SANITY_PROJECT_ID is not set. Please set NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_STUDIO_PROJECT_ID");
  process.exit(1);
}

if (!dataset) {
  console.error("❌ Error: SANITY_DATASET is not set. Please set NEXT_PUBLIC_SANITY_DATASET or SANITY_STUDIO_DATASET");
  process.exit(1);
}

if (!apiToken) {
  console.error("❌ Error: SANITY_API_TOKEN is not set. Please set SANITY_API_TOKEN with write permissions");
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: "2024-01-01",
  token: apiToken, // must have write access
  useCdn: false,
});

async function ensureDefaultCategory() {
  const defaultCategorySlug = "common-tasks";

  // Check if it already exists
  const existing = await client.fetch(
    `*[_type == "category" && slug.current == $slug][0]`,
    { slug: defaultCategorySlug }
  );

  if (existing) {
    console.log("✅ Default category already exists:", existing.name);
    return;
  }

  // Create the default category
  const newCategory = await client.create({
    _type: "category",
      name: "Common Tasks (This is a common task, and should be added to all future projects)",
    slug: { _type: "slug", current: defaultCategorySlug },
    description: "Default category for general tasks and activities.",
    color: "blue",
    icon: "other",
    isActive: true,
  });

  console.log("🎉 Created default category:", newCategory.name);
}

ensureDefaultCategory().catch(console.error);
