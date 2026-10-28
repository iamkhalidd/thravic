// The Thravic app page inside the Shopify admin (integrations/shopify).
//
// The merchant types their tracking ID once. It is saved in two places, both
// through App Bridge's Direct API access (`shopify:admin/...`), so the Thravic
// server never holds a Shopify token:
//   - the web pixel's settings, which reports checkouts and purchases;
//   - an app metafield (thravic.tracking_id) that the theme app embed reads.
// https://shopify.dev/docs/api/app-bridge-library/apis/resource-fetching
(function () {
    'use strict';

    var TRACKING_ID = /^TF-[0-9A-F]{8}$/;
    var EMBED_HANDLE = 'thravic-tracker'; // extensions/thravic-theme/blocks/thravic-tracker.liquid
    var ADMIN = 'shopify:admin/api/graphql.json';

    var form = document.getElementById('connect');
    var input = document.getElementById('tracking-id');
    var message = document.getElementById('message');
    var save = document.getElementById('save');
    var next = document.getElementById('next');
    var embed = document.getElementById('embed');
    var clientId = document.querySelector('meta[name="shopify-api-key"]').content;

    var state = { shopDomain: '', installationId: '', pixelId: '' };

    function say(text, kind) {
        message.textContent = text;
        message.className = kind || '';
    }

    function admin(query, variables) {
        return fetch(ADMIN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query, variables: variables || {} }),
        }).then(function (response) { return response.json(); });
    }

    function firstError(payload) {
        if (payload.errors && payload.errors.length) return payload.errors[0].message;
        var errors = payload.userErrors || [];
        return errors.length ? errors[0].message : '';
    }

    function load() {
        return admin(
            'query { shop { myshopifyDomain } currentAppInstallation { id ' +
            'metafield(namespace: "thravic", key: "tracking_id") { value } } }'
        ).then(function (result) {
            var data = result.data || {};
            state.shopDomain = (data.shop || {}).myshopifyDomain || '';
            var installation = data.currentAppInstallation || {};
            state.installationId = installation.id || '';
            if (installation.metafield) input.value = installation.metafield.value;
            // Errors (rather than null) when the store has no Thravic pixel yet.
            return admin('query { webPixel { id settings } }');
        }).then(function (result) {
            var pixel = (result.data || {}).webPixel;
            if (pixel) {
                state.pixelId = pixel.id;
                if (!input.value) {
                    var settings = typeof pixel.settings === 'string' ? JSON.parse(pixel.settings) : pixel.settings;
                    input.value = (settings && settings.trackingId) || '';
                }
            }
            if (input.value) next.hidden = false;
        }).catch(function () { /* first visit: nothing saved yet */ });
    }

    // The tracker's public config URL answers 404 for an unknown tracking ID.
    function exists(trackingId) {
        return fetch('/api/collect/' + encodeURIComponent(trackingId) + '/config')
            .then(function (response) { return response.ok; });
    }

    function savePixel(trackingId) {
        var settings = JSON.stringify({ trackingId: trackingId });
        var mutation = state.pixelId
            ? admin(
                'mutation($id: ID!, $webPixel: WebPixelInput!) { webPixelUpdate(id: $id, webPixel: $webPixel) ' +
                '{ userErrors { field message code } webPixel { id } } }',
                { id: state.pixelId, webPixel: { settings: settings } }
            ).then(function (result) { return result.errors ? result : (result.data || {}).webPixelUpdate; })
            : admin(
                'mutation($webPixel: WebPixelInput!) { webPixelCreate(webPixel: $webPixel) ' +
                '{ userErrors { field message code } webPixel { id } } }',
                { webPixel: { settings: settings } }
            ).then(function (result) { return result.errors ? result : (result.data || {}).webPixelCreate; });
        return mutation.then(function (payload) {
            payload = payload || {};
            var error = firstError(payload);
            if (error) throw new Error(error);
            if (payload.webPixel) state.pixelId = payload.webPixel.id;
        });
    }

    function saveMetafield(trackingId) {
        return admin(
            'mutation($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) ' +
            '{ userErrors { field message } } }',
            { metafields: [{
                ownerId: state.installationId,
                namespace: 'thravic',
                key: 'tracking_id',
                type: 'single_line_text_field',
                value: trackingId,
            }] }
        ).then(function (result) {
            var error = result.errors ? firstError(result) : firstError((result.data || {}).metafieldsSet || {});
            if (error) throw new Error(error);
        });
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        var trackingId = input.value.trim().toUpperCase();
        input.value = trackingId;
        if (!TRACKING_ID.test(trackingId)) {
            say('A tracking ID looks like TF-1A2B3C4D: "TF-" then 8 letters or numbers.', 'error');
            input.focus();
            return;
        }
        save.disabled = true;
        say('Checking…');
        exists(trackingId).then(function (found) {
            if (!found) throw new Error('We could not find this tracking ID. Copy it again from your Thravic dashboard.');
            return Promise.all([savePixel(trackingId), saveMetafield(trackingId)]);
        }).then(function () {
            say('Connected. Checkouts and purchases will show in Thravic.', 'ok');
            next.hidden = false;
            if (window.shopify && shopify.toast) shopify.toast.show('Thravic connected');
        }).catch(function (error) {
            say(error.message || 'Something went wrong. Please try again.', 'error');
        }).then(function () {
            save.disabled = false;
        });
    });

    embed.addEventListener('click', function () {
        var shop = state.shopDomain || (new URLSearchParams(location.search).get('shop') || '');
        var url = 'https://' + shop + '/admin/themes/current/editor?context=apps&activateAppId=' +
            encodeURIComponent(clientId) + '/' + EMBED_HANDLE;
        window.open(url, '_top');
    });

    load();
})();
