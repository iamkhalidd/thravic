=== Thravic Analytics ===
Contributors: thravic
Tags: analytics, heatmaps, session replay, statistics, visitors
Requires at least: 5.7
Tested up to: 6.8
Requires PHP: 7.2
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Simple website analytics, session replays and heatmaps. Paste your tracking ID, no code needed.

== Description ==

Thravic shows you who visits your website, where they come from, what they click and where they leave. This plugin adds the Thravic tracker to every page of your WordPress site, so you don't have to edit your theme or paste a script.

* Visitors, pages, traffic sources and countries
* Session replays and heatmaps
* Funnels, goals and smart alerts
* Your own visits as an admin or editor are not counted (you can change this)
* Optionally show logged-in users by name on the Visitors page

You need a free Thravic account to use this plugin. Sign up at [thravic.com](https://thravic.com).

== External services ==

This plugin connects your site to Thravic, an analytics service run by Thravic. It is needed to collect and show your site's analytics.

On every front-end page (not in wp-admin), the plugin loads the Thravic script from https://api.thravic.com/tf.js. The script sends the pages visitors view, how they got there, clicks, scrolls, device and browser type, approximate location and, if you turn on session replays in Thravic, a recording of the page session, to https://api.thravic.com.

If you turn on "Identify logged-in users", the name and email of logged-in WordPress users are also sent. This setting is off by default.

* Privacy policy: https://thravic.com/privacy
* Cookie policy: https://thravic.com/cookies

== Installation ==

1. In WordPress go to Plugins → Add New, search for "Thravic" and click Install Now, then Activate. (Or upload thravic.zip under Plugins → Add New → Upload Plugin.)
2. Go to Settings → Thravic.
3. Paste your tracking ID from the Thravic dashboard. It looks like TF-1A2B3C4D.
4. Click Save Changes.
5. In the Thravic dashboard, open your site and click Verify Installation.

== Frequently Asked Questions ==

= Where do I find my tracking ID? =

Log in at thravic.com, open your site and look under Install. You can paste the bare ID or the whole script tag.

= Why don't I see my own visits? =

Visits by logged-in admins and editors are not tracked by default. Turn on "Also track admins and editors" in Settings → Thravic if you want them. To check that tracking works, open your site in a private window.

= Does it work with caching plugins? =

Yes. The tracker is a normal script tag in the page head. If a caching or optimisation plugin delays or combines JavaScript, exclude api.thravic.com/tf.js from it.

= Is the tracker added in wp-admin? =

No. It is only added to the public pages of your site.

== Changelog ==

= 1.0.0 =
* First release.
