<?php
/**
 * Removes the plugin's settings when it is deleted from the Plugins screen.
 *
 * @package Thravic
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

if ( is_multisite() ) {
	foreach ( get_sites( array( 'fields' => 'ids' ) ) as $thravic_site_id ) {
		switch_to_blog( $thravic_site_id );
		delete_option( 'thravic_settings' );
		restore_current_blog();
	}
} else {
	delete_option( 'thravic_settings' );
}
