<?php
/**
 * Plugin Name: Tavern Cellar Foundry Yoast REST Bridge
 * Description: Exposes core Yoast SEO post fields to the WordPress REST API so Tavern Cellar Foundry can sync focus keyphrase, SEO title, and meta description.
 * Version: 0.1.0
 * Author: Codex
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action(
	'init',
	static function () {
		$meta_keys = array(
			'_yoast_wpseo_title',
			'_yoast_wpseo_metadesc',
			'_yoast_wpseo_focuskw',
		);

		foreach ( $meta_keys as $meta_key ) {
			register_post_meta(
				'post',
				$meta_key,
				array(
					'single'            => true,
					'type'              => 'string',
					'show_in_rest'      => true,
					'sanitize_callback' => 'sanitize_text_field',
					'auth_callback'     => static function () {
						return current_user_can( 'edit_posts' );
					},
				)
			);
		}
	}
);
