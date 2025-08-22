// ==UserScript==
// @name         IITC plugin: Equilateral Triangle Helper
// @version      3.0.0
// @description  [2025-08-22] Select two portals explicitly from the sidebar to find a third portal that forms an equilateral triangle. This version is fully self-contained and does not require any other plugins.
// @author       Gemini
// @id           iitc-plugin-equilateral-triangle-helper
// @category     Layer
// @namespace    https://github.com/IITC-CE/ingress-intel-total-conversion
// @match        https://intel.ingress.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function wrapper(plugin_info) {
        if (typeof window.plugin !== 'function') window.plugin = function() {};

        const self = window.plugin.equilateralTriangle = {};
        self.portal1 = null;
        self.portal2 = null;
        self.currentlySelectedGuid = null;
        self.resultLayer = null;
        self.MAX_DEVIATION = 0.05;
        self.EARTH_RADIUS = 6371e3; // meters

        // Helper to convert degrees to radians
        self.toRadians = (deg) => deg * Math.PI / 180;
        // Helper to convert radians to degrees
        self.toDegrees = (rad) => rad * 180 / Math.PI;

        self.escapeHtml = (str) => str ? String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[s]) : '';

        // ▼▼▼【変更点】依存関係をなくすため、方位角の計算を独自に実装 ▼▼▼
        self.calculateBearing = function(latlng1, latlng2) {
            const φ1 = self.toRadians(latlng1.lat);
            const φ2 = self.toRadians(latlng2.lat);
            const Δλ = self.toRadians(latlng2.lng - latlng1.lng);
            const y = Math.sin(Δλ) * Math.cos(φ2);
            const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
            const θ = Math.atan2(y, x);
            return (self.toDegrees(θ) + 360) % 360; // Bearing in degrees
        };

        // ▼▼▼【変更点】依存関係をなくすため、目的地の計算を独自に実装 ▼▼▼
        self.destinationPoint = function(startLatLng, bearing, distance) {
            const δ = distance / self.EARTH_RADIUS; // Angular distance in radians
            const θ = self.toRadians(bearing);
            const φ1 = self.toRadians(startLatLng.lat);
            const λ1 = self.toRadians(startLatLng.lng);
            const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
            const φ2 = Math.asin(sinφ2);
            const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
            const x = Math.cos(δ) - Math.sin(φ1) * sinφ2;
            const λ2 = λ1 + Math.atan2(y, x);
            return L.latLng(self.toDegrees(φ2), self.toDegrees(λ2));
        };

        self.calculateDeviation = (a, b, c) => {
            if (a <= 0 || b <= 0 || c <= 0) return 1;
            const avg = (a + b + c) / 3.0;
            return (Math.abs(a - avg) + Math.abs(b - avg) + Math.abs(c - avg)) / avg;
        };

        self.calculateThirdVertices = (latlng1, latlng2) => {
            const d = latlng1.distanceTo(latlng2);
            const h = d * Math.sqrt(3) / 2;
            const midPoint = L.latLngBounds(latlng1, latlng2).getCenter();
            const bearing = self.calculateBearing(midPoint, latlng2);
            // 2つの候補点を計算
            return [self.destinationPoint(midPoint, bearing + 90, h), self.destinationPoint(midPoint, bearing - 90, h)];
        };

        self.drawCandidates = function() {
            if (!self.resultLayer) return;
            self.resultLayer.clearLayers();
            if (!self.portal1 || !self.portal2) return;

            const { latlng: latlng1, guid: guid1 } = self.portal1;
            const { latlng: latlng2, guid: guid2 } = self.portal2;

            L.polyline([latlng1, latlng2], { color: '#00FFFF', weight: 2, opacity: 0.8, dashArray: '5, 8', interactive: false }).addTo(self.resultLayer);
            [latlng1, latlng2].forEach(latlng => L.circle(latlng, { radius: 40, color: '#00FFFF', weight: 2, fillOpacity: 0.2, interactive: false }).addTo(self.resultLayer));

            const baseDistance = latlng1.distanceTo(latlng2);
            if (baseDistance < 1) return;

            const vertices = self.calculateThirdVertices(latlng1, latlng2);
            const searchRadius = baseDistance * self.MAX_DEVIATION * 2;
            vertices.forEach(v => {
                L.circle(v, { radius: searchRadius, color: '#FFD700', weight: 2, fillOpacity: 0.1, interactive: false }).addTo(self.resultLayer);
                L.circle(v, { radius: 20, color: '#FFD700', weight: 2, fillOpacity: 0.5, interactive: false }).addTo(self.resultLayer);
            });

            const mapBounds = window.map.getBounds();
            for (const guid in window.portals) {
                if (guid === guid1 || guid === guid2) continue;
                const portal = window.portals[guid];
                if (mapBounds.contains(portal.getLatLng())) {
                    if (self.calculateDeviation(baseDistance, portal.getLatLng().distanceTo(latlng1), portal.getLatLng().distanceTo(latlng2)) <= self.MAX_DEVIATION) {
                        L.circle(portal.getLatLng(), { radius: 35, color: '#FFD700', weight: 3, opacity: 0.9, fillOpacity: 0.3, interactive: false }).addTo(self.resultLayer);
                    }
                }
            }
        };

        self.setPortal = function(slot) {
            if (!self.currentlySelectedGuid) return;
            const portal = window.portals[self.currentlySelectedGuid];
            if (!portal) return;
            const data = { guid: self.currentlySelectedGuid, name: portal.options.data.title, latlng: portal.getLatLng() };
            if (slot === 1) self.portal1 = data; else self.portal2 = data;
            self.updateSidebar();
            self.drawCandidates();
        };

        self.clearSelection = function() {
            self.portal1 = null; self.portal2 = null;
            if (self.resultLayer) self.resultLayer.clearLayers();
            self.updateSidebar();
        };

        self.handlePortalSelect = function(data) {
            self.currentlySelectedGuid = data.selectedPortalGuid;
            self.updateSidebar();
        };

        self.updateSidebar = function() {
            let html = '<h4>正三角形ヘルパー</h4>';
            html += '<p><b>ポータル#1:</b> ' + (self.portal1 ? self.escapeHtml(self.portal1.name) : '') + '<i><button id="setPortal1" style="cursor: pointer; font-weight: bold;">[設定/更新]</button></i></p>';
            html += '<p><b>ポータル#2:</b> ' + (self.portal2 ? self.escapeHtml(self.portal2.name) : '') + '<i><button id="setPortal2" style="cursor: pointer; font-weight: bold;">[設定/更新]</button></i></p><hr>';
            const current = self.currentlySelectedGuid ? window.portals[self.currentlySelectedGuid] : null;
            if (!current || !current.options.data.title) {
                html += '<p>地図上でポータルを選択してください</p>';
            }
            html += '<a id="clearEquilateralSelection" style="cursor: pointer;">全てクリア</a>';
            $('#eq_triangle_status').html(html);
            $('#setPortal1').on('click', () => self.setPortal(1));
            $('#setPortal2').on('click', () => self.setPortal(2));
            $('#clearEquilateralSelection').on('click', self.clearSelection);
        };

        self.setup = function() {
            self.resultLayer = L.layerGroup();
            window.addLayerGroup('Equilateral Triangle', self.resultLayer, true);
            window.addHook('portalSelected', self.handlePortalSelect);
            $('#sidebar').append('<div id="eq_triangle_status" class="card" style="padding: 8px; margin-top: 5px;"></div>');
            self.updateSidebar();
            console.log('IITC plugin "Equilateral Triangle Helper" v3.0.0 loaded.');
        };

        const setup = self.setup;
        setup.info = plugin_info;
        if (!window.bootPlugins) window.bootPlugins = [];
        window.bootPlugins.push(setup);
        if (window.iitcLoaded && typeof setup === 'function') setup();
    }

    let script = document.createElement('script');
    let info = {};
    if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
    script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
    (document.body || document.head || document.documentElement).appendChild(script);
})();