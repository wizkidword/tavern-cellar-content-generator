<?php
/**
 * Plugin Name: Tavern Cellar Foundry Yoast REST Bridge
 * Description: Exposes Yoast SEO fields and private publish-attempt reconciliation for Tavern Cellar Foundry.
 * Version: 0.2.0
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
					'auth_callback'     => static function ( $allowed, $meta_key, $post_id ) {
						return $post_id ? current_user_can( 'edit_post', $post_id ) : current_user_can( 'edit_posts' );
					},
				)
			);
		}
	}
);

add_action(
	'init',
	static function () {
		register_post_meta(
			'post',
			'_tavern_cellar_publish_operation_key',
			array(
				'single'            => true,
				'type'              => 'string',
				'show_in_rest'      => true,
				'sanitize_callback' => static function ( $value ) {
					$value = sanitize_text_field( $value );
					return preg_match( '/^[A-Za-z0-9_-]{16,128}$/', $value ) ? $value : '';
				},
				'auth_callback'     => static function ( $allowed, $meta_key, $post_id ) {
					return $post_id ? current_user_can( 'edit_post', $post_id ) : current_user_can( 'edit_posts' );
				},
			)
		);
	}
);

add_action(
	'rest_api_init',
	static function () {
		register_rest_route(
			'tavern-cellar/v1',
			'/publish-attempt/(?P<operation_key>[A-Za-z0-9_-]{16,128})',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'permission_callback' => static function () {
					return current_user_can( 'edit_posts' );
				},
				'callback'            => static function ( WP_REST_Request $request ) {
					$operation_key = sanitize_text_field( $request['operation_key'] );

					if ( ! preg_match( '/^[A-Za-z0-9_-]{16,128}$/', $operation_key ) ) {
						return new WP_Error( 'tavern_cellar_invalid_operation_key', 'Invalid publish operation key.', array( 'status' => 400 ) );
					}

					$post_ids = get_posts(
						array(
							'post_type'      => 'post',
							'post_status'    => 'any',
							'posts_per_page' => 1,
							'fields'         => 'ids',
							'meta_key'       => '_tavern_cellar_publish_operation_key',
							'meta_value'     => $operation_key,
							'no_found_rows'  => true,
						)
					);

					if ( empty( $post_ids ) || ! current_user_can( 'edit_post', $post_ids[0] ) ) {
						return new WP_Error( 'tavern_cellar_publish_attempt_not_found', 'Publish attempt not found.', array( 'status' => 404 ) );
					}

					$post_id = (int) $post_ids[0];

					return rest_ensure_response(
						array(
							'id'     => $post_id,
							'status' => get_post_status( $post_id ),
							'link'   => get_permalink( $post_id ),
						)
					);
				},
			)
		);
	}
);
