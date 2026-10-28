<?php
/**
 * Plugin Name:       Thravic Analytics
 * Plugin URI:        https://thravic.com/docs/wordpress
 * Description:       Adds Thravic analytics, session replays and heatmaps to your site. Paste your tracking ID under Settings → Thravic, no code needed.
 * Version:           1.0.0
 * Requires at least: 5.7
 * Requires PHP:      7.2
 * Author:            Thravic
 * Author URI:        https://thravic.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       thravic
 *
 * @package Thravic
 */

defined( 'ABSPATH' ) || exit;

define( 'THRAVIC_VERSION', '1.0.0' );
define( 'THRAVIC_OPTION', 'thravic_settings' );
define( 'THRAVIC_SCRIPT_SRC', 'https://api.thravic.com/tf.js' );
define( 'THRAVIC_DASHBOARD_URL', 'https://thravic.com/dashboard' );

// Same format the API generates: "TF-" + 8 uppercase hex characters.
define( 'THRAVIC_ID_PATTERN', '/^TF-[0-9A-F]{8}$/' );

/**
 * Saved settings merged over the defaults.
 *
 * @return array{tracking_id: string, track_staff: bool, identify_users: bool}
 */
function thravic_get_settings() {
	$saved = get_option( THRAVIC_OPTION, array() );
	if ( ! is_array( $saved ) ) {
		$saved = array();
	}
	return array(
		'tracking_id'    => isset( $saved['tracking_id'] ) ? (string) $saved['tracking_id'] : '',
		'track_staff'    => ! empty( $saved['track_staff'] ),
		'identify_users' => ! empty( $saved['identify_users'] ),
	);
}

/**
 * Turns whatever the user pasted into a tracking ID, or '' if it isn't one.
 * Accepts the bare ID in any case, or the whole snippet from the dashboard.
 *
 * @param mixed $raw Pasted value.
 * @return string
 */
function thravic_parse_tracking_id( $raw ) {
	// options.php has already unslashed the submitted value.
	$raw = is_string( $raw ) ? $raw : '';
	if ( preg_match( '/data-tracking-id=["\']([^"\']+)["\']/i', $raw, $match ) ) {
		$raw = $match[1];
	}
	$id = strtoupper( trim( sanitize_text_field( $raw ) ) );
	return preg_match( THRAVIC_ID_PATTERN, $id ) ? $id : '';
}

/**
 * Whether the tracker should be printed on this request.
 *
 * @return bool
 */
function thravic_should_track() {
	if ( is_admin() || is_feed() || is_preview() || is_customize_preview() ) {
		return false;
	}
	$settings = thravic_get_settings();
	if ( '' === $settings['tracking_id'] ) {
		return false;
	}
	// Admins and editors browsing their own site would skew the numbers.
	if ( ! $settings['track_staff'] && thravic_is_staff() ) {
		return false;
	}
	/**
	 * Filters whether Thravic tracks the current request.
	 *
	 * @param bool $track Whether to print the tracker.
	 */
	return (bool) apply_filters( 'thravic_should_track', true );
}

/**
 * Logged in as an administrator or editor.
 *
 * @return bool
 */
function thravic_is_staff() {
	return is_user_logged_in() && current_user_can( 'edit_others_posts' );
}

/* -------------------------------------------------------------------------
 * Front end
 * ---------------------------------------------------------------------- */

/**
 * Queues the tracker in <head>.
 */
function thravic_enqueue_tracker() {
	if ( ! thravic_should_track() ) {
		return;
	}
	/**
	 * Filters the tracker URL, for self-hosted Thravic.
	 *
	 * @param string $src Script URL.
	 */
	$src = apply_filters( 'thravic_script_src', THRAVIC_SCRIPT_SRC );
	// Null version: no ?ver= query on the tracker URL.
	wp_enqueue_script( 'thravic', $src, array(), null, false ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion
}
add_action( 'wp_enqueue_scripts', 'thravic_enqueue_tracker' );

/**
 * Prints the tracker as the same tag the dashboard gives:
 * <script async src=".../tf.js" data-tracking-id="TF-XXXXXXXX"></script>
 *
 * @param string $tag    The default tag.
 * @param string $handle Script handle.
 * @param string $src    Script URL.
 * @return string
 */
function thravic_script_tag( $tag, $handle, $src ) {
	if ( 'thravic' !== $handle ) {
		return $tag;
	}
	$settings = thravic_get_settings();
	return sprintf(
		'<script async src="%s" data-tracking-id="%s"></script>' . "\n", // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedScript
		esc_url( $src ),
		esc_attr( $settings['tracking_id'] )
	);
}
add_filter( 'script_loader_tag', 'thravic_script_tag', 10, 3 );

/**
 * When "identify" is on, tells Thravic who the logged-in visitor is.
 * The tracker loads async, so this waits for window.TF and sends once
 * per browser session.
 */
function thravic_print_identify() {
	$settings = thravic_get_settings();
	if ( ! $settings['identify_users'] || ! is_user_logged_in() || ! thravic_should_track() ) {
		return;
	}
	$user = wp_get_current_user();
	if ( ! $user || ! $user->exists() ) {
		return;
	}
	$flags   = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT;
	$user_id = wp_json_encode( 'wp-' . $user->ID, $flags );
	$traits  = wp_json_encode(
		array(
			'email' => $user->user_email,
			'name'  => $user->display_name,
		),
		$flags
	);

	$js = "(function(){var id={$user_id},t={$traits},k='_tf_wp_identified';"
		. "try{if(sessionStorage.getItem(k)===id)return;}catch(e){}"
		. "var n=0;(function go(){if(typeof window.TF==='function'){window.TF('identify',id,t);"
		. "try{sessionStorage.setItem(k,id);}catch(e){}}else if(n++<75){setTimeout(go,200);}})();})();";

	wp_print_inline_script_tag( $js, array( 'id' => 'thravic-identify' ) );
}
add_action( 'wp_head', 'thravic_print_identify', 20 );

/* -------------------------------------------------------------------------
 * Settings → Thravic
 * ---------------------------------------------------------------------- */

/**
 * Registers the option with its sanitiser. options.php checks the nonce
 * (from settings_fields()) and the manage_options capability on save.
 */
function thravic_register_settings() {
	register_setting(
		'thravic',
		THRAVIC_OPTION,
		array(
			'type'              => 'array',
			'sanitize_callback' => 'thravic_sanitize_settings',
			'default'           => array(
				'tracking_id'    => '',
				'track_staff'    => false,
				'identify_users' => false,
			),
		)
	);
}
add_action( 'admin_init', 'thravic_register_settings' );

/**
 * Cleans the submitted settings. A bad tracking ID keeps the old one.
 *
 * @param mixed $input Submitted values.
 * @return array
 */
function thravic_sanitize_settings( $input ) {
	$current = thravic_get_settings();
	$input   = is_array( $input ) ? $input : array();

	$raw_id = isset( $input['tracking_id'] ) ? $input['tracking_id'] : '';
	$id     = thravic_parse_tracking_id( $raw_id );

	if ( '' === $id && '' !== trim( (string) $raw_id ) ) {
		add_settings_error(
			THRAVIC_OPTION,
			'thravic_bad_id',
			__( 'That doesn’t look like a Thravic tracking ID. It should look like TF-1A2B3C4D. Your previous ID was kept.', 'thravic' )
		);
		$id = $current['tracking_id'];
	}

	return array(
		'tracking_id'    => $id,
		'track_staff'    => ! empty( $input['track_staff'] ),
		'identify_users' => ! empty( $input['identify_users'] ),
	);
}

/**
 * Adds the Settings → Thravic page.
 */
function thravic_add_settings_page() {
	add_options_page(
		__( 'Thravic Analytics', 'thravic' ),
		__( 'Thravic', 'thravic' ),
		'manage_options',
		'thravic',
		'thravic_render_settings_page'
	);
}
add_action( 'admin_menu', 'thravic_add_settings_page' );

/**
 * Adds a "Settings" link on the Plugins screen.
 *
 * @param array $links Action links.
 * @return array
 */
function thravic_action_links( $links ) {
	$url = admin_url( 'options-general.php?page=thravic' );
	array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'thravic' ) . '</a>' );
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'thravic_action_links' );

/**
 * Renders the settings page.
 */
function thravic_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$settings = thravic_get_settings();
	$active   = '' !== $settings['tracking_id'];
	$name     = THRAVIC_OPTION;
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Thravic Analytics', 'thravic' ); ?></h1>

		<?php if ( $active ) : ?>
			<div class="notice notice-success inline">
				<p>
					<strong><?php esc_html_e( 'Tracker is active.', 'thravic' ); ?></strong>
					<?php
					printf(
						/* translators: %s: tracking ID */
						esc_html__( 'Thravic is running on every page of your site with tracking ID %s.', 'thravic' ),
						'<code>' . esc_html( $settings['tracking_id'] ) . '</code>'
					);
					?>
					<?php if ( ! $settings['track_staff'] && thravic_is_staff() ) : ?>
						<br><?php esc_html_e( 'Your own visits are not counted while you are logged in as an admin or editor.', 'thravic' ); ?>
					<?php endif; ?>
				</p>
			</div>
		<?php else : ?>
			<div class="notice notice-warning inline">
				<p>
					<strong><?php esc_html_e( 'Tracker is not active.', 'thravic' ); ?></strong>
					<?php esc_html_e( 'Paste your tracking ID below and click Save Changes.', 'thravic' ); ?>
				</p>
			</div>
		<?php endif; ?>

		<p>
			<?php esc_html_e( 'Find your tracking ID in the Thravic dashboard: open your site and look under Install. It looks like TF-1A2B3C4D.', 'thravic' ); ?>
			<a href="<?php echo esc_url( THRAVIC_DASHBOARD_URL ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Open the Thravic dashboard', 'thravic' ); ?></a>
		</p>

		<form method="post" action="options.php">
			<?php settings_fields( 'thravic' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="thravic-tracking-id"><?php esc_html_e( 'Tracking ID', 'thravic' ); ?></label></th>
					<td>
						<input type="text" id="thravic-tracking-id" class="regular-text code"
							name="<?php echo esc_attr( $name ); ?>[tracking_id]"
							value="<?php echo esc_attr( $settings['tracking_id'] ); ?>"
							placeholder="TF-1A2B3C4D" autocomplete="off" spellcheck="false">
						<p class="description"><?php esc_html_e( 'You can also paste the whole script tag from the dashboard; the ID is picked out for you. Leave empty to turn tracking off.', 'thravic' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Your own visits', 'thravic' ); ?></th>
					<td>
						<label>
							<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[track_staff]" value="1" <?php checked( $settings['track_staff'] ); ?>>
							<?php esc_html_e( 'Also track admins and editors when they are logged in', 'thravic' ); ?>
						</label>
						<p class="description"><?php esc_html_e( 'Off by default, so you and your team browsing the site don’t show up in your numbers.', 'thravic' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Identify logged-in users', 'thravic' ); ?></th>
					<td>
						<label>
							<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[identify_users]" value="1" <?php checked( $settings['identify_users'] ); ?>>
							<?php esc_html_e( 'Send the name and email of logged-in users to Thravic', 'thravic' ); ?>
						</label>
						<p class="description">
							<?php esc_html_e( 'When someone is logged in to your WordPress site (for example a customer or member), Thravic links their visits to their name and email, so they show as identified on the Visitors page.', 'thravic' ); ?>
							<br>
							<strong><?php esc_html_e( 'Privacy:', 'thravic' ); ?></strong>
							<?php esc_html_e( 'This sends personal data (name and email) to Thravic and ties it to what the person does on your site, including session replays. Only turn it on if your privacy policy says so and, where the law requires it (for example GDPR or NDPR), your users have agreed. Visitors who are not logged in stay anonymous either way.', 'thravic' ); ?>
						</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}
