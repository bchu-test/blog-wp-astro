<?php
/**
 * Plugin Name: Bchu Astro Rebuild
 * Description: Debounced Netlify builds when public blog content changes.
 * Version: 1.0.0
 */
if (!defined('ABSPATH')) { exit; }

// Keep the secret build hook in wp-config.php, never in this plugin or Git.
// define('BCHU_NETLIFY_BUILD_HOOK', 'https://api.netlify.com/build_hooks/...');
// define('BCHU_REBUILD_DELAY', 300); // Batch editorial changes for five minutes.
function bchu_astro_queue() {
    update_option('bchu_astro_dirty', wp_generate_uuid4(), false);
    if (!wp_next_scheduled('bchu_astro_rebuild')) {
        wp_schedule_single_event(time() + (defined('BCHU_REBUILD_DELAY') ? max(60, (int) BCHU_REBUILD_DELAY) : 300), 'bchu_astro_rebuild');
    }
}
add_action('wp_after_insert_post', function ($id, $post, $update, $before) {
    if (wp_is_post_revision($id) || wp_is_post_autosave($id)) { return; }
    if ($post->post_type === 'post' && ($post->post_status === 'publish' || ($before && $before->post_status === 'publish'))) {
        bchu_astro_queue();
    }
}, 10, 4);
add_action('before_delete_post', function ($id, $post) {
    if ($post->post_type === 'post' && $post->post_status === 'publish') { bchu_astro_queue(); }
}, 10, 2);
add_action('edited_term', function ($id, $tt_id, $taxonomy) {
    if (in_array($taxonomy, array('category', 'post_tag'), true)) { bchu_astro_queue(); }
}, 10, 3);
add_action('delete_term', function ($id, $tt_id, $taxonomy) {
    if (in_array($taxonomy, array('category', 'post_tag'), true)) { bchu_astro_queue(); }
}, 10, 3);
add_action('profile_update', function ($id) {
    if (count_user_posts($id, 'post', true) > 0) { bchu_astro_queue(); }
});
add_action('updated_post_meta', function ($meta_id, $post_id, $key) {
    if (get_post_type($post_id) === 'attachment' && $key === '_wp_attachment_image_alt') { bchu_astro_queue(); }
}, 10, 3);
add_action('edit_attachment', 'bchu_astro_queue');
add_action('delete_attachment', 'bchu_astro_queue');

add_action('bchu_astro_rebuild', function () {
    $generation = get_option('bchu_astro_dirty');
    if (!$generation) { return; }
    $url = defined('BCHU_NETLIFY_BUILD_HOOK') ? BCHU_NETLIFY_BUILD_HOOK : '';
    // Restrict the destination so a mistaken configuration cannot send requests elsewhere.
    if (!preg_match('~^https://api\.netlify\.com/build_hooks/[a-zA-Z0-9_-]+$~', $url)) {
        update_option('bchu_astro_error', 'Configure a valid BCHU_NETLIFY_BUILD_HOOK in wp-config.php.', false);
        return;
    }
    $response = wp_remote_post($url, array('timeout' => 20, 'redirection' => 0, 'body' => '{}', 'headers' => array('Content-Type' => 'application/json')));
    $status = is_wp_error($response) ? 0 : wp_remote_retrieve_response_code($response);
    if ($status >= 200 && $status < 300) {
        if (get_option('bchu_astro_dirty') === $generation) { delete_option('bchu_astro_dirty'); }
        delete_option('bchu_astro_error');
        delete_option('bchu_astro_attempts');
        update_option('bchu_astro_last_requested', time(), false);
        if (get_option('bchu_astro_dirty') && !wp_next_scheduled('bchu_astro_rebuild')) {
            wp_schedule_single_event(time() + 300, 'bchu_astro_rebuild');
        }
    } else {
        $attempt = (int) get_option('bchu_astro_attempts', 0) + 1;
        update_option('bchu_astro_attempts', $attempt, false);
        update_option('bchu_astro_error', 'Netlify build request failed. Check Netlify and use Retry sync below. HTTP status: ' . $status, false);
        if ($attempt < 5 && !wp_next_scheduled('bchu_astro_rebuild')) {
            wp_schedule_single_event(time() + min(3600, 300 * (2 ** ($attempt - 1))), 'bchu_astro_rebuild');
        }
    }
});
add_action('admin_notices', function () {
    if (!current_user_can('manage_options')) { return; }
    $error = get_option('bchu_astro_error');
    if ($error) {
        echo '<div class="notice notice-error"><p>Bchu Astro: ' . esc_html($error) . ' <a href="' . esc_url(wp_nonce_url(admin_url('admin-post.php?action=bchu_astro_retry'), 'bchu_astro_retry')) . '">Retry sync</a></p></div>';
    }
});
add_action('admin_post_bchu_astro_retry', function () {
    if (!current_user_can('manage_options')) { wp_die('Not allowed'); }
    check_admin_referer('bchu_astro_retry');
    delete_option('bchu_astro_attempts');
    bchu_astro_queue();
    wp_safe_redirect(admin_url());
    exit;
});
register_activation_hook(__FILE__, 'bchu_astro_queue');
register_deactivation_hook(__FILE__, function () { wp_clear_scheduled_hook('bchu_astro_rebuild'); });
