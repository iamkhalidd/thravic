# Thravic for WordPress

The plugin in `thravic/` adds the Thravic tracker to a WordPress site. The site owner pastes their tracking ID under **Settings → Thravic**; nothing else to edit.

## Build the zip

From the repo root:

```bash
node scripts/build-wordpress-plugin.mjs
```

This writes `integrations/wordpress/dist/thravic.zip` (git-ignored, never committed). The zip holds one folder, `thravic/`, which is what WordPress expects.

## Test on a WordPress site

1. In wp-admin go to **Plugins → Add New → Upload Plugin**, choose `thravic.zip`, install and activate.
2. Go to **Settings → Thravic**, paste a tracking ID from the dashboard (e.g. `TF-1A2B3C4D`) and save. The page should say "Tracker is active".
3. Open the site in a private window and view the page source. In `<head>` you should see
   `<script async src="https://api.thravic.com/tf.js" data-tracking-id="TF-…"></script>`.
4. While logged in as an admin, the tag should be missing (unless "Also track admins and editors" is on). It should never appear in wp-admin.
5. Optional: turn on "Identify logged-in users", log in as a subscriber/customer, browse, and check they show by name on the Visitors page.
6. Delete the plugin from the Plugins screen and check the `thravic_settings` option is gone.

## Publish on WordPress.org

This is done by hand by the account owner.

1. Check the plugin with the [Plugin Check](https://wordpress.org/plugins/plugin-check/) plugin on a test site and fix anything it flags.
2. Update `Tested up to` in `thravic/readme.txt` to the latest WordPress version you tested.
3. Log in to wordpress.org with the account that will own the plugin, then go to <https://wordpress.org/plugins/developers/add/> and upload `thravic.zip`.
   - Your wordpress.org username must be in the `Contributors:` line of `readme.txt` (it says `thravic` now; change it if your username is different).
4. Wait for the review email (usually 1–10 days). Reply to the reviewer from the same email if they ask for changes.
5. Once approved you get an SVN repository. Put the contents of `thravic/` into `trunk/`, copy it to `tags/1.0.0/`, and commit:

   ```bash
   svn co https://plugins.svn.wordpress.org/thravic thravic-svn
   ```

   Then add banner and icon images (`banner-772x250.png`, `icon-256x256.png`) to the `assets/` folder of the SVN repo, not to the plugin folder.
6. For each new version: bump `Version` in `thravic.php`, `THRAVIC_VERSION`, and `Stable tag` in `readme.txt`, add a changelog entry, then commit to `trunk/` and a new `tags/<version>/`.

Until the plugin is live on wordpress.org, the dashboard links to `thravic.zip` on the latest GitHub release. Upload the built zip as an asset named exactly `thravic.zip` on a GitHub release so that link works.
