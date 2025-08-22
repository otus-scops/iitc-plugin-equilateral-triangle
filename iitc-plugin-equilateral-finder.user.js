// ==UserScript==
// @id           iitc-plugin-equilateral-finder
// @name         IITC plugin: Equilateral Triangle Finder
// @category     Layer
// @version      1.0.1
// @namespace    https://github.com/jonatkins/ingress-intel-total-conversion
// @updateURL    https://raw.githubusercontent.com/IITC-CE/Community-plugins/master/dist/equilateral_finder/equilateral_finder.meta.js
// @downloadURL  https://raw.githubusercontent.com/IITC-CE/Community-plugins/master/dist/equilateral_finder/equilateral_finder.user.js
// @description  Finds sets of three portals that can form a nearly equilateral triangle control field.
// @match        https://intel.ingress.com/*
// @grant        none
// ==/UserScript==

function wrapper(plugin_info) {
  // ensure plugin framework is there, even if iitc is not yet loaded
  if (typeof window.plugin !== 'function') window.plugin = function() {};

  // PLUGIN START ////////////////////////////////////////////////////////

  window.plugin.equilateralFinder = function() {};
  const self = window.plugin.equilateralFinder;

  // --- 設定値 (デフォルト) ---
  self.settings = {
    tolerance: 5,  // 許容誤差 (%)
    maxResults: 20, // 最大表示件数
    maxPortals: 300 // 計算対象の最大ポータル数 (パフォーマンスのため)
  };

  // --- 描画用レイヤー ---
  self.drawLayer = null;

  // --- メイン処理 ---
  self.findTriangles = function() {
    // 描画をクリア
    self.drawLayer.clearLayers();

    // 1. 表示範囲内のポータルを取得
    const bounds = window.map.getBounds();
    const visiblePortals = [];
    for (const guid in window.portals) {
      const p = window.portals[guid];
      if (bounds.contains(p.getLatLng())) {
        visiblePortals.push(p);
      }
    }

    if (visiblePortals.length < 3) {
      alert('正三角形の計算には、少なくとも3つのポータルが画面内に必要です。');
      return;
    }

    if (visiblePortals.length > self.settings.maxPortals) {
      if (!confirm(`警告: 画面内に${visiblePortals.length}個のポータルがあります。計算に時間がかかる可能性があります (推奨は${self.settings.maxPortals}個以下)。続行しますか？`)) {
        return;
      }
    }

    // 2. 組み合わせを計算
    const triangles = [];
    const portalCount = visiblePortals.length;

    // ダイアログで進捗を表示
    const progressDialog = dialog({
      title: '正三角形を検索中',
      html: `<p>計算中... (${portalCount}個のポータル)</p><div id="eq-progress"></div>`,
      width: 300,
      modal: true
    }).dialog('open');


    // 非同期処理でUIのフリーズを防ぐ
    setTimeout(() => {
        for (let i = 0; i < portalCount; i++) {
          for (let j = i + 1; j < portalCount; j++) {
            for (let k = j + 1; k < portalCount; k++) {
              const p1 = visiblePortals[i];
              const p2 = visiblePortals[j];
              const p3 = visiblePortals[k];

              const pos1 = p1.getLatLng();
              const pos2 = p2.getLatLng();
              const pos3 = p3.getLatLng();

              const dist12 = pos1.distanceTo(pos2);
              const dist23 = pos2.distanceTo(pos3);
              const dist31 = pos3.distanceTo(pos1);

              const maxDist = Math.max(dist12, dist23, dist31);
              const minDist = Math.min(dist12, dist23, dist31);

              // 3. 許容誤差をチェック
              const difference = ((maxDist - minDist) / maxDist) * 100;

              if (difference < self.settings.tolerance) {
                triangles.push({
                  portals: [p1, p2, p3],
                  diff: difference,
                  avgDist: (dist12 + dist23 + dist31) / 3
                });
              }
            }
          }
        }
        progressDialog.dialog('close');

        // 4. 結果を誤差の少ない順にソート
        triangles.sort((a, b) => a.diff - b.diff);

        // 5. 最大件数に絞る
        const finalResults = triangles.slice(0, self.settings.maxResults);

        // 6. 結果を表示
        self.showResults(finalResults);
    }, 10); // 10ms待ってから重い処理を開始
  };

  // --- 結果表示 ---
  self.showResults = function(results) {
    let html = '<div>';
    if (results.length === 0) {
      html += '<p>条件に合う組み合わせは見つかりませんでした。</p>';
    } else {
      html += '<ul>';
      results.forEach((result, index) => {
        const p1 = result.portals[0].options.data;
        const p2 = result.portals[1].options.data;
        const p3 = result.portals[2].options.data;
        const avgDistStr = result.avgDist > 1000 ? `${(result.avgDist/1000).toFixed(2)} km` : `${Math.round(result.avgDist)} m`;

        html += `
          <li style="margin-bottom: 5px;">
            <a href="#" onclick="window.plugin.equilateralFinder.drawTriangle(${index}); return false;">
              <strong>${index + 1}. 誤差: ${result.diff.toFixed(2)}%</strong> (辺長: 約${avgDistStr})<br>
              <small style="white-space: normal;">
                - ${p1.title || 'N/A'}<br>
                - ${p2.title || 'N/A'}<br>
                - ${p3.title || 'N/A'}
              </small>
            </a>
          </li>`;
      });
      html += '</ul>';
    }
    html += '</div>';

    // グローバルに結果を保存して、描画関数からアクセスできるようにする
    self.currentResults = results;

    dialog({
      title: `正三角形フィールド候補 (${results.length}件)`,
      html: html,
      width: 400,
      closeCallback: () => {
        self.drawLayer.clearLayers();
        self.currentResults = [];
      }
    }).dialog('open');
  };

  // --- 三角形描画 ---
  self.drawTriangle = function(index) {
    if (!self.currentResults || !self.currentResults[index]) return;

    const result = self.currentResults[index];
    const portals = result.portals;
    const latlngs = portals.map(p => p.getLatLng());

    self.drawLayer.clearLayers();

    const triangle = L.polygon(latlngs, {
      color: '#FF0000',
      weight: 2,
      opacity: 0.8,
      fillColor: '#FF0000',
      fillOpacity: 0.3
    });
    triangle.addTo(self.drawLayer);

    // 3つのポータルが収まるように画面を調整
    window.map.fitBounds(triangle.getBounds().pad(0.2));
  };


  // --- UI設定 ---
  self.setupUI = function() {
    $('#toolbox').append('<a onclick="window.plugin.equilateralFinder.showConfigDialog()" title="正三角形フィールド検索">正三角形検索</a>');
  };

  self.showConfigDialog = function() {
    const html = `
      <div>
        <p>表示されているポータルから、正三角形に近い組み合わせを検索します。</p>
        <div style="display: flex; align-items: center; margin-bottom: 10px;">
          <label for="eq-tolerance" style="width: 120px;">辺長の許容誤差:</label>
          <input type="number" id="eq-tolerance" value="${self.settings.tolerance}" style="width: 60px;"> %
        </div>
        <div style="display: flex; align-items: center;">
          <label for="eq-maxresults" style="width: 120px;">最大表示件数:</label>
          <input type="number" id="eq-maxresults" value="${self.settings.maxResults}" style="width: 60px;"> 件
        </div>
      </div>
    `;

    dialog({
      title: '正三角形検索 設定',
      html: html,
      width: 350,
      buttons: {
        '検索実行': function() {
          self.settings.tolerance = parseFloat($('#eq-tolerance').val());
          self.settings.maxResults = parseInt($('#eq-maxresults').val(), 10);

          // 設定値をブラウザに保存
          localStorage.setItem('equilateralFinder-settings', JSON.stringify(self.settings));

          $(this).dialog('close');
          self.findTriangles();
        },
        'キャンセル': function() {
          $(this).dialog('close');
        }
      }
    }).dialog('open');
  };

  // --- セットアップ ---
  var setup = function() {
    // 保存された設定を読み込み
    const savedSettings = localStorage.getItem('equilateralFinder-settings');
    if (savedSettings) {
      self.settings = JSON.parse(savedSettings);
    }

    // 描画レイヤーをマップに追加
    self.drawLayer = new L.FeatureGroup();
    window.map.addLayer(self.drawLayer);

    self.setupUI();
  };


  // IITCプラグインのブートストラップ
  setup.info = plugin_info;
  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);
  // if IITC is already loaded, immediately run the setup function
  if (window.iitcLoaded) setup();

  // PLUGIN END //////////////////////////////////////////////////////////
}


// Greasemonkey/Tampermonkey ラッパー
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
  info.script = {
    version: GM_info.script.version,
    name: GM_info.script.name,
    description: GM_info.script.description
  };
}
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);