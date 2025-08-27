// ==UserScript==
// @id           iitc-plugin-equilateral-finder
// @name         IITC plugin: Equilateral Triangle Finder
// @category     Layer
// @version      1.3.1
// @namespace    https://github.com/jonatkins/ingress-intel-total-conversion
// @updateURL    https://github.com/otus-scops/iitc-plugin-equilateral-triangle/raw/refs/heads/main/iitc-plugin-equilateral-finder.user.js
// @downloadURL  https://github.com/otus-scops/iitc-plugin-equilateral-triangle/raw/refs/heads/main/iitc-plugin-equilateral-finder.user.js
// @description  Finds sets of three portals that can form a nearly equilateral triangle control field, optionally including one or two selected portals.
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
    minPercentage: 95, // 最低正三角形度 (%)
    maxResults: 20,    // 最大表示件数
    maxPortals: 500    // 計算対象の最大ポータル数 (起点指定時は多めに)
  };

  // --- 選択されたポータル ---
  self.pivotPortals = [];

  // --- 描画用レイヤー ---
  self.drawLayer = null;

  // --- メイン処理 ---
  self.findTriangles = function() {
    self.drawLayer.clearLayers();

    // 1. 表示範囲内のポータルを取得
    const bounds = window.map.getBounds();
    const visiblePortals = [];
    const pivotGuids = self.pivotPortals.map(p => p.guid);
    for (const guid in window.portals) {
      if (!pivotGuids.includes(guid)) {
        const p = window.portals[guid];
        if (bounds.contains(p.getLatLng())) {
          visiblePortals.push(p);
        }
      }
    }
    
    const pivotCount = self.pivotPortals.length;
    if ((pivotCount === 0 && visiblePortals.length < 3) || (pivotCount > 0 && visiblePortals.length < (3 - pivotCount))) {
        alert('検索を実行するには、画面内にもっと多くのポータルが必要です。');
        return;
    }

    if (visiblePortals.length > self.settings.maxPortals) {
      if (!confirm(`警告: 画面内に${visiblePortals.length}個のポータルがあります。計算に時間がかかる可能性があります。続行しますか？`)) {
        return;
      }
    }

    // 2. 組み合わせを計算
    const triangles = [];
    const progressDialog = dialog({
      title: '正三角形を検索中',
      html: `<p>計算中... (${visiblePortals.length}個のポータル)</p>`,
      width: 300,
      modal: true
    }).dialog('open');

    // 非同期処理でUIのフリーズを防ぐ
    setTimeout(() => {
      // 検索ロジックの分岐
      if (pivotCount === 0) {
        // 全検索
        for (let i = 0; i < visiblePortals.length; i++) {
          for (let j = i + 1; j < visiblePortals.length; j++) {
            for (let k = j + 1; k < visiblePortals.length; k++) {
              self.checkAndAddTriangle([visiblePortals[i], visiblePortals[j], visiblePortals[k]], triangles);
            }
          }
        }
      } else if (pivotCount === 1) {
        // 起点1つ
        const p1 = window.portals[self.pivotPortals[0].guid];
        for (let i = 0; i < visiblePortals.length; i++) {
          for (let j = i + 1; j < visiblePortals.length; j++) {
            self.checkAndAddTriangle([p1, visiblePortals[i], visiblePortals[j]], triangles);
          }
        }
      } else if (pivotCount === 2) {
        // 起点2つ
        const p1 = window.portals[self.pivotPortals[0].guid];
        const p2 = window.portals[self.pivotPortals[1].guid];
        for (let i = 0; i < visiblePortals.length; i++) {
            self.checkAndAddTriangle([p1, p2, visiblePortals[i]], triangles);
        }
      }

      progressDialog.dialog('close');

      // 3. パーセンテージが高い順（100%に近い順）にソート
      triangles.sort((a, b) => b.percentage - a.percentage);
      
      // 4. 最大件数に絞る & 結果を表示
      const finalResults = triangles.slice(0, self.settings.maxResults);
      self.showResults(finalResults);
    }, 10);
  };
  
  // 正三角形度を計算し、条件を満たせばリストに追加する関数
  self.checkAndAddTriangle = function(portalSet, triangles) {
      const [p1, p2, p3] = portalSet;
      if (!p1 || !p2 || !p3) return; 

      const pos1 = p1.getLatLng();
      const pos2 = p2.getLatLng();
      const pos3 = p3.getLatLng();

      // 3辺の長さを計算
      const a = pos1.distanceTo(pos2);
      const b = pos2.distanceTo(pos3);
      const c = pos3.distanceTo(pos1);

      // 1. 最長リンク(L_max)を特定
      const L_max = Math.max(a, b, c);
      if (L_max === 0) return;

      // 2. 実際の面積を計算（ヘロンの公式）
      const s = (a + b + c) / 2; // 半周長
      const actualArea = Math.sqrt(s * (s - a) * (s - b) * (s - c));
      
      // 3. 最大可能面積を計算（最長リンクを1辺とする正三角形の面積）
      const maxPossibleArea = (Math.sqrt(3) / 4) * Math.pow(L_max, 2);

      if (maxPossibleArea === 0) return;

      // 4. 正三角形度パーセンテージを算出
      const percentage = (actualArea / maxPossibleArea) * 100;

      // 5. 設定された最低パーセンテージをクリアしているかチェック
      if (percentage >= self.settings.minPercentage) {
        triangles.push({
          portals: [p1, p2, p3],
          percentage: percentage,
          avgDist: s * 2 / 3
        });
      }
  };

  // --- 結果表示 ---
  self.showResults = function(results) {
    const style = `
      <style>
        #eq-results-list li a { display: block; padding: 5px; border-radius: 4px; text-decoration: none; color: #ffce00; border: 1px solid transparent; }
        #eq-results-list li.eq-finder-selected a { background-color: #004565; border-color: #087fb3; }
        #eq-results-list li a:hover { background-color: #005684; }
      </style>
    `;

    let html = '<div>';
    if (results.length === 0) {
      html += '<p>条件に合う組み合わせは見つかりませんでした。</p>';
    } else {
      html += '<ul id="eq-results-list" style="list-style-type: none; padding-left: 0; margin: 0;">';
      results.forEach((result, index) => {
        const p1 = result.portals[0].options.data;
        const p2 = result.portals[1].options.data;
        const p3 = result.portals[2].options.data;
        const avgDistStr = result.avgDist > 1000 ? `${(result.avgDist/1000).toFixed(2)} km` : `${Math.round(result.avgDist)} m`;

        html += `
          <li id="eq-result-item-${index}" style="margin-bottom: 2px;">
            <a href="#" onclick="window.plugin.equilateralFinder.drawTriangle(${index}); return false;">
              <strong>${index + 1}. 正三角形度: ${result.percentage.toFixed(2)}%</strong> (辺長: 約${avgDistStr})<br>
              <div style="font-size: 0.9em; white-space: normal; color: #eee; padding-left: 8px;">
                - ${p1.title || 'N/A'}<br>
                - ${p2.title || 'N/A'}<br>
                - ${p3.title || 'N/A'}
              </div>
            </a>
          </li>`;
      });
      html += '</ul>';
    }
    html += '</div>';

    self.currentResults = results;

    dialog({
      title: `正三角形フィールド候補 (${results.length}件)`,
      html: style + html,
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

    // ハイライト処理
    const allItems = document.querySelectorAll('#eq-results-list li');
    allItems.forEach(item => item.classList.remove('eq-finder-selected'));
    const selectedItem = document.getElementById(`eq-result-item-${index}`);
    if (selectedItem) {
        selectedItem.classList.add('eq-finder-selected');
    }
    // ★★★ハイライト処理ここまで★★★

    const result = self.currentResults[index];
    const portals = result.portals;
    const latlngs = portals.map(p => p.getLatLng());

    self.drawLayer.clearLayers();

    // 三角形を描画
    const triangle = L.polygon(latlngs, {
      color: '#FF0000',
      weight: 2,
      opacity: 0.8,
      fillColor: '#FF0000',
      fillOpacity: 0.3
    });
    triangle.addTo(self.drawLayer);

    // ポータル位置にマーカーを設置
    portals.forEach(p => {
        L.circleMarker(p.getLatLng(), { radius: 5, color: 'yellow', fillColor: 'red', fillOpacity: 1 }).addTo(self.drawLayer);
    });

    // 画面を調整
    window.map.fitBounds(triangle.getBounds().pad(0.2));
  };


  // --- UI設定 ---
  self.setupUI = function() {
    $('#toolbox').append('<a onclick="window.plugin.equilateralFinder.showMainMenu()" title="正三角形フィールド検索">正三角形検索</a>');
    window.addHook('portalDetailsUpdated', self.addPivotLink);
  };
  
  self.showMainMenu = function() {
      const pivotInfo = self.pivotPortals.map(p => `- ${p.title}`).join('<br>');
      const searchButtonLabel = self.pivotPortals.length > 0 ? '選択したポータルを含めて検索' : '画面内全体を検索';
      
      const html = `
        <div>
          <p><strong>現在の起点ポータル:</strong></p>
          <div style="min-height: 40px; margin-bottom: 10px; background: #1b415e; padding: 5px; border-radius: 4px;">
            ${self.pivotPortals.length > 0 ? pivotInfo : 'なし (画面全体を検索)'}
          </div>
          ${self.pivotPortals.length > 0 ? '<button id="eq-clear-pivots" class="ui-button ui-widget ui-state-default ui-corner-all ui-button-text-only" style="font-size: 0.9em;">起点クリア</button>' : ''}
          <hr>
          <p>検索設定:</p>
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
            <label for="eq-min-percentage" style="width: 120px;">最低正三角形度:</label>
            <input type="number" id="eq-min-percentage" value="${self.settings.minPercentage}" min="0" max="100" style="width: 60px;"> %
          </div>
          <div style="display: flex; align-items: center;">
            <label for="eq-maxresults" style="width: 120px;">最大表示件数:</label>
            <input type="number" id="eq-maxresults" value="${self.settings.maxResults}" style="width: 60px;"> 件
          </div>
        </div>
      `;
      
      const dialogOptions = {
        title: '正三角形検索',
        html: html,
        width: 380,
        buttons: {
          [searchButtonLabel]: function() {
            self.settings.minPercentage = parseFloat($('#eq-min-percentage').val());
            self.settings.maxResults = parseInt($('#eq-maxresults').val(), 10);
            localStorage.setItem('equilateralFinder-settings', JSON.stringify(self.settings));
            $(this).dialog('close');
            self.findTriangles();
          },
          '閉じる': function() {
            $(this).dialog('close');
          }
        },
        open: function() {
             $('#eq-clear-pivots').on('click', function() {
                self.pivotPortals = [];
                $('.ui-dialog-content').dialog('close');
                self.showMainMenu();
             });
        }
      };

      dialog(dialogOptions).dialog('open');
  };

  // ポータル詳細に起点追加リンクを挿入
  self.addPivotLink = function(data) {
    const guid = data.guid;
    const details = window.portalDetail.get(guid);
    if (!details) return;

    const isPivot = self.pivotPortals.some(p => p.guid === guid);

    $('.linkdetails').append(`
        <aside>
            <a href="#" onclick="window.plugin.equilateralFinder.togglePivot('${guid}', '${details.title.replace(/'/g, "\\'")}')" title="正三角形検索の起点に設定/解除">
                ${isPivot ? '起点から解除' : '起点に追加'}
            </a>
        </aside>
    `);
  };
  
  // 起点ポータルの追加・削除
  self.togglePivot = function(guid, title) {
      const index = self.pivotPortals.findIndex(p => p.guid === guid);
      if (index > -1) {
          self.pivotPortals.splice(index, 1);
          alert(`ポータル「${title}」を起点から解除しました。`);
      } else {
          if (self.pivotPortals.length >= 2) {
              alert('起点ポータルは最大2つまでしか設定できません。');
              return;
          }
          self.pivotPortals.push({ guid, title });
          alert(`ポータル「${title}」を起点に追加しました。\n現在の起点: ${self.pivotPortals.length}個`);
      }
      window.renderPortalDetails(guid);
  };

  // --- セットアップ ---
  var setup = function() {
    const savedSettings = localStorage.getItem('equilateralFinder-settings');
    if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        // 古い設定（tolerance）からの移行処理
        if (parsed.tolerance && !parsed.minPercentage) {
            parsed.minPercentage = 95; // 古い設定があった場合はデフォルト値に
            delete parsed.tolerance;
        }
        self.settings = { ...self.settings, ...parsed };
    }
    self.drawLayer = new L.FeatureGroup();
    window.map.addLayer(self.drawLayer);
    self.setupUI();
  };

  setup.info = plugin_info;
  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);
  if (window.iitcLoaded) setup();

  // PLUGIN END //////////////////////////////////////////////////////////
}

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
