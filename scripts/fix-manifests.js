/**
 * Workaround for Next.js 15.1.0 + Vercel CLI compatibility issue:
 * Route groups like (dashboard) don't get page_client-reference-manifest.js
 * generated in their directory, but the Vercel adapter expects it there.
 *
 * This script copies the root manifest into any route group directory
 * that has a page.js but no page_client-reference-manifest.js.
 */
const fs = require("fs");
const path = require("path");

const serverAppDir = path.join(__dirname, "..", ".next", "server", "app");

function fixRouteGroup(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("(")) {
      const groupDir = path.join(dir, entry.name);
      const pageFile = path.join(groupDir, "page.js");
      const manifestFile = path.join(
        groupDir,
        "page_client-reference-manifest.js"
      );

      if (fs.existsSync(pageFile) && !fs.existsSync(manifestFile)) {
        // Copy the root manifest, adjusting the route path
        const rootManifest = path.join(dir, "page_client-reference-manifest.js");
        if (fs.existsSync(rootManifest)) {
          const content = fs.readFileSync(rootManifest, "utf8");
          // Update the route key from "/page" to match the group
          const adjusted = content.replace(
            `__RSC_MANIFEST["/page"]`,
            `__RSC_MANIFEST["/${entry.name}/page"]`
          );
          fs.writeFileSync(manifestFile, adjusted);
          console.log(`  ✓ Created missing manifest: ${entry.name}/page_client-reference-manifest.js`);
        }
      }

      // Recurse into subdirectories
      fixRouteGroup(groupDir);
    }
  }
}

if (fs.existsSync(serverAppDir)) {
  console.log("Fixing route group manifests...");
  fixRouteGroup(serverAppDir);
  console.log("Done.");
} else {
  console.log("No .next/server/app directory found, skipping manifest fix.");
}
