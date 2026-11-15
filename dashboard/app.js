/* Launch Radar's dashboard: the board, the live-token comparables and the model, all from data.js.
   No network, no framework. The page re-ranks from the same rows the board scores, and the Model
   tab's sandbox re-runs the valuation with the reader's own constants. */
(function () {
  var D = window.RADAR;
  if (!D) { document.getElementById('board').textContent = 'Launch Radar needs data.js next to dashboard/.'; return; }
  var M = D.model;
  var root = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', wl: false, tab: 'board', sort: 'implied', dir: -1, selected: null };
  var sandbox = { live: false, prior: M.prior_peers, gw: M.growth_weight, gcap: M.growth_cap, peak: M.age_peak_days, old: M.age_old_factor };
  var params = new URLSearchParams(location.search);
  var shot = params.get('shot') || '';

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmtUsd(v) {
    if (v == null) return '—';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
    return '$' + Math.round(v);
  }
  function fmtNum(v) { return v == null ? '—' : v.toLocaleString('en-US'); }
  function fmtPct(v) { return v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'; }
  function fmtAge(d) { return d == null ? 'unknown' : d < 30 ? d + 'd' : d < 365 ? Math.round(d / 30) + 'mo' : (d / 365).toFixed(1) + 'y'; }
  function fmtX(v) { return v == null ? '—' : v.toFixed(2) + '×'; }
  function bySlug(slug) { for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) return D.rows[i]; return null; }

  /* The valuation, re-run in the page: the same four factors the model scores with. */
  function multFor(cat) {
    var m = null;
    for (var i = 0; i < D.multiples.length; i++) if (D.multiples[i].category === cat) m = D.multiples[i];
    var prior = sandbox.live ? sandbox.prior : M.prior_peers;
    var med = m && m.median != null ? m.median : null;
    var n = m ? m.peers : 0;
    var raw = med == null ? D.global_multiple : (n * med + prior * D.global_multiple) / (n + prior);
    return Math.min(M.multiple_cap, Math.max(M.multiple_floor, raw));
  }
  function launchOf(age) {
    if (age == null) return M.unknown_age_factor;
    if (age < M.age_young_days) return 0.8;
    var peak = sandbox.live ? sandbox.peak : M.age_peak_days;
    if (age <= peak) return 0.8 + 0.2 * ((age - M.age_young_days) / (peak - M.age_young_days));
    if (age <= M.age_hold_days) return 1;
    var old = sandbox.live ? sandbox.old : M.age_old_factor;
    return Math.max(old, 1 - 0.1 * Math.min((age - M.age_hold_days) / M.age_hold_days, 1));
  }
  function impliedOf(r) {
    if (!sandbox.live) return r.implied_value_usd;
    var gw = sandbox.gw, gcap = sandbox.gcap;
    var pct = Math.min(gcap, Math.max(M.growth_floor, r.change_7d == null ? 0 : r.change_7d));
    var growth = 1 + (pct / 100) * gw;
    var breadth = 1 + M.breadth_per_chain * Math.min(r.chains.length, M.breadth_max_chains);
    return Math.max(1, Math.round(r.tvl_usd * multFor(r.category || 'Other') * growth * launchOf(r.age_days) * breadth));
  }
  function scoredRows() {
    var rows = D.rows.map(function (r) { return { r: r, implied: impliedOf(r) }; });
    rows.sort(function (a, b) { return b.implied - a.implied || (a.r.slug < b.r.slug ? -1 : 1); });
    rows.forEach(function (x, i) { x.rank = i + 1; });
    return rows;
  }

  /* Hash state: the board, its filters and the open detail are all linkable. */
  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    if (h.get('tab')) state.tab = h.get('tab');
    if (h.get('q') != null) state.q = h.get('q');
    if (h.get('cat')) state.category = h.get('cat');
    if (h.get('chain')) state.chain = h.get('chain');
    if (h.get('wl')) state.wl = h.get('wl') === '1';
    if (h.get('p')) state.selected = h.get('p');
  }
  function writeHash() {
    var h = new URLSearchParams();
    if (state.tab !== 'board') h.set('tab', state.tab);
    if (state.q) h.set('q', state.q);
    if (state.category !== 'all') h.set('cat', state.category);
    if (state.chain !== 'all') h.set('chain', state.chain);
    if (state.wl) h.set('wl', '1');
    if (state.selected) h.set('p', state.selected);
    var s = h.toString();
    history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
  }

  function filteredRows(scored) {
    var q = state.q.trim().toLowerCase();
    return scored.filter(function (x) {
      var r = x.r;
      if (state.wl && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function sortRows(rows) {
    var key = state.sort, dir = state.dir;
    var val = function (x) {
      var r = x.r;
      if (key === 'name') return r.name.toLowerCase();
      if (key === 'tvl') return r.tvl_usd;
      if (key === 'growth') return r.change_7d == null ? -Infinity : r.change_7d;
      if (key === 'age') return r.age_days == null ? -1 : r.age_days;
      if (key === 'implied') return x.implied;
      return x.rank;
    };
    return rows.slice().sort(function (a, b) {
      var va = val(a), vb = val(b);
      if (va < vb) return -dir; if (va > vb) return dir; return a.r.slug < b.r.slug ? -1 : 1;
    });
  }

  function stat(num, lab) { var s = el('div', 'stat'); s.appendChild(el('div', 'num', num)); s.appendChild(el('div', 'lab', lab)); return s; }
  function header() {
    var shell = el('div', 'shell');
    var top = el('div', 'top');
    var h = el('h1', 'brand'); h.innerHTML = 'LAUNCH <b>RADAR</b><span class="dot">.</span>';
    top.appendChild(h);
    top.appendChild(el('span', 'top-meta', 'Snapshot ' + D.as_of + ' · ' + D.source + ' · floor ' + fmtUsd(D.floor_usd)));
    shell.appendChild(top);
    var lede = el('p', 'lede');
    lede.innerHTML = 'Every pre-token protocol in the snapshot, ranked by <b>implied value</b>: what a token would be worth if the protocol launched one at the market-cap / TVL multiple its own category trades at. The board covers the full watchlist and every other rankable protocol below the floor.';
    shell.appendChild(lede);
    var stats = el('div', 'stats');
    stats.appendChild(stat(fmtNum(D.board_size), 'protocols ranked'));
    stats.appendChild(stat(fmtNum(D.watchlist_size), 'on the watchlist'));
    stats.appendChild(stat(fmtNum(D.early_size), 'early, below the floor'));
    stats.appendChild(stat(fmtUsd(D.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0)), 'total implied value'));
    stats.appendChild(stat(fmtNum(D.live_size), 'live tokens priced'));
    shell.appendChild(stats);
    var tabs = el('div', 'tabs');
    [['board', 'Board'], ['live', 'Live token'], ['model', 'Model']].forEach(function (t) {
      var b = el('button', 'tab', t[1]);
      b.setAttribute('aria-pressed', state.tab === t[0] ? 'true' : 'false');
      b.onclick = function () { state.tab = t[0]; state.selected = null; writeHash(); render(); };
      tabs.appendChild(b);
    });
    shell.appendChild(tabs);
    return shell;
  }

  function boardTab(shell) {
    var scored = scoredRows();
    var shown = sortRows(filteredRows(scored));
    var cats = {}, chains = {};
    D.rows.forEach(function (r) { cats[r.category || 'Other'] = true; r.chains.forEach(function (c) { chains[c] = true; }); });
    if (sandbox.live) {
      var note = el('p', 'note', 'Sandbox active: the board is re-ranked with your constants below. Reset in the Model tab to return to the submitted model.');
      note.style.cssText = 'color:var(--accent2);margin:0 0 12px';
      shell.appendChild(note);
    }
    var chart = el('div', 'chart');
    chart.appendChild(el('h2', '', 'Top 10 by implied value'));
    var top = scored.slice(0, 10);
    var max = top.length ? top[0].implied : 1;
    top.forEach(function (x) {
      var row = el('div', 'bar-row');
      row.appendChild(el('span', 'bar-name', x.r.name));
      var track = el('div', 'bar-track');
      var fill = el('div', 'bar-fill'); fill.style.width = (100 * x.implied / max).toFixed(1) + '%';
      track.appendChild(fill); row.appendChild(track);
      row.appendChild(el('span', 'bar-val', fmtUsd(x.implied)));
      chart.appendChild(row);
    });
    shell.appendChild(chart);
    var controls = el('div', 'controls');
    var q = el('input'); q.type = 'search'; q.placeholder = 'Search name or slug…'; q.value = state.q; q.setAttribute('aria-label', 'Search protocols');
    q.oninput = function () { state.q = q.value; writeHash(); renderTable(); };
    controls.appendChild(q);
    var cat = el('select'); cat.setAttribute('aria-label', 'Filter by category');
    cat.appendChild(new Option('All categories', 'all'));
    Object.keys(cats).sort().forEach(function (c) { cat.appendChild(new Option(c, c)); });
    cat.value = state.category;
    cat.onchange = function () { state.category = cat.value; writeHash(); renderTable(); };
    controls.appendChild(cat);
    var ch = el('select'); ch.setAttribute('aria-label', 'Filter by chain');
    ch.appendChild(new Option('All chains', 'all'));
    Object.keys(chains).sort().forEach(function (c) { ch.appendChild(new Option(c, c)); });
    ch.value = state.chain;
    ch.onchange = function () { state.chain = ch.value; writeHash(); renderTable(); };
    controls.appendChild(ch);
    var wl = el('label');
    var wli = el('input'); wli.type = 'checkbox'; wli.checked = state.wl;
    wli.onchange = function () { state.wl = wli.checked; writeHash(); renderTable(); };
    wl.appendChild(wli); wl.appendChild(document.createTextNode('Watchlist only'));
    controls.appendChild(wl);
    controls.appendChild(el('span', 'count', ''));
    shell.appendChild(controls);
    var wrap = el('div', 'table-wrap');
    var table = el('table');
    var thead = el('thead');
    var tr = el('tr');
    [['rank', 'Rank'], ['name', 'Protocol'], ['category', 'Category'], ['chains', 'Chains'], ['tvl', 'TVL'], ['growth', '7d'], ['age', 'Age'], ['implied', 'Implied']].forEach(function (c) {
      var th = el('th'); if (c[0] === 'tvl' || c[0] === 'growth' || c[0] === 'age' || c[0] === 'implied' || c[0] === 'rank') th.className = 'num';
      var b = el('button', 'sort', c[1] + (state.sort === c[0] ? (state.dir === -1 ? ' ↓' : ' ↑') : ''));
      b.onclick = function () { if (state.sort === c[0]) state.dir = -state.dir; else { state.sort = c[0]; state.dir = c[0] === 'name' ? 1 : -1; } renderTable(); };
      th.appendChild(b); tr.appendChild(th);
    });
    thead.appendChild(tr); table.appendChild(thead);
    var tbody = el('tbody');
    table.appendChild(tbody);
    wrap.appendChild(table);
    shell.appendChild(wrap);
    shell.appendChild(el('p', 'note', 'Implied value = TVL × the category’s live-token multiple × growth × launch-readiness × chain breadth. Click a row for the breakdown and the farm plan. The watchlist is the floor: every slug on it is ranked, and the early radar covers every other rankable protocol below the floor.'));
    function renderTable() {
      var list = sortRows(filteredRows(scoredRows()));
      var count = shell.querySelector('.count');
      if (count) count.textContent = 'Showing ' + list.length + ' of ' + scored.length;
      tbody.innerHTML = '';
      if (!list.length) {
        var empty = el('tr'); var td = el('td'); td.colSpan = 8; td.className = 'empty';
        td.innerHTML = '<h2>Nothing on the radar matches</h2>Loosen the filters, or clear the search.';
        empty.appendChild(td); tbody.appendChild(empty); return;
      }
      list.forEach(function (x) {
        var r = x.r;
        var row = el('tr');
        if (state.selected === r.slug) row.className = 'sel';
        var rank = el('td', 'rank num', '#' + x.rank); row.appendChild(rank);
        var name = el('td'); var nm = el('b', '', r.name);
        name.appendChild(nm);
        if (r.watchlist) { var w = el('span', 'muted', ' ★ watchlist'); name.appendChild(w); }
        name.appendChild(el('div', 'muted', r.slug));
        row.appendChild(name);
        row.appendChild(el('td', '', r.category || '—'));
        row.appendChild(el('td', 'wrap', r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '')));
        row.appendChild(el('td', 'num', fmtUsd(r.tvl_usd)));
        var g = el('td', 'num ' + (r.change_7d == null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), fmtPct(r.change_7d)); row.appendChild(g);
        row.appendChild(el('td', 'num', fmtAge(r.age_days)));
        row.appendChild(el('td', 'num implied', fmtUsd(x.implied)));
        row.onclick = function () { state.selected = state.selected === r.slug ? null : r.slug; writeHash(); render(); };
        tbody.appendChild(row);
      });
    }
    renderTable();
  }

  function liveTab(shell) {
    shell.appendChild(el('p', 'lede', 'The live-token protocols the multiples are priced from: the market’s own values, ranked by market cap. A pre-token protocol is valued at the median market-cap / TVL of the live tokens in its own category, so a high ratio here is what lifts a category’s board.'));
    var wrap = el('div', 'table-wrap');
    var table = el('table');
    var thead = el('thead'); var tr = el('tr');
    ['#', 'Protocol', 'Category', 'Chains', 'TVL', 'Mcap', 'Mcap / TVL', '7d'].forEach(function (h, i) {
      var th = el('th', i >= 4 ? 'num' : '', h); tr.appendChild(th);
    });
    thead.appendChild(tr); table.appendChild(thead);
    var tbody = el('tbody');
    D.live.forEach(function (r, i) {
      var row = el('tr');
      row.appendChild(el('td', 'rank num', '#' + (i + 1)));
      var name = el('td'); name.appendChild(el('b', '', r.name)); name.appendChild(el('div', 'muted', r.slug)); row.appendChild(name);
      row.appendChild(el('td', '', r.category || '—'));
      row.appendChild(el('td', 'wrap', r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '')));
      row.appendChild(el('td', 'num', fmtUsd(r.tvl_usd)));
      row.appendChild(el('td', 'num', fmtUsd(r.mcap_usd)));
      row.appendChild(el('td', 'num', fmtX(r.mcap_tvl)));
      row.appendChild(el('td', 'num ' + (r.change_7d == null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), fmtPct(r.change_7d)));
      tbody.appendChild(row);
    });
    table.appendChild(tbody); wrap.appendChild(table);
    shell.appendChild(wrap);
  }

  function modelTab(shell) {
    var grid = el('div', 'model-grid');
    var formula = el('div', 'panel');
    formula.appendChild(el('h2', '', 'The valuation'));
    var p = el('p');
    p.innerHTML = 'implied = TVL × <code>category multiple</code> × <code>growth</code> × <code>launch-readiness</code> × <code>chain breadth</code>';
    formula.appendChild(p);
    formula.appendChild(el('p', '', 'Category multiple: the median market-cap / TVL of live-token peers in the same category, shrunk toward the whole-market median (' + fmtX(D.global_multiple) + ') with a prior of ' + M.prior_peers + ' peers, clamped to ' + M.multiple_floor + '–' + M.multiple_cap + '. A category with no live peers takes the whole-market median.'));
    formula.appendChild(el('p', '', 'Growth: 1 + ' + M.growth_weight + ' × 7-day change, clamped to ' + M.growth_floor + '%…+' + M.growth_cap + '%, so one hot week cannot run the board.'));
    formula.appendChild(el('p', '', 'Launch-readiness: 0.80 under ' + M.age_young_days + ' days, rising to 1.00 at ' + M.age_peak_days + ' days, held to ' + M.age_hold_days + ' days, then easing to ' + M.age_old_factor + ' for protocols that may never launch. Unknown age scores ' + M.unknown_age_factor + '.'));
    formula.appendChild(el('p', '', 'Chain breadth: 1 + ' + M.breadth_per_chain + ' per chain, up to ' + M.breadth_max_chains + ' chains. The model is ' + D.model_version + '; every factor is computed from the snapshot at run time, and no name is special-cased.'));
    grid.appendChild(formula);
    var sandboxPanel = el('div', 'panel');
    sandboxPanel.appendChild(el('h2', '', 'Model sandbox'));
    sandboxPanel.appendChild(el('p', '', 'Move a constant and the board re-ranks live, so the reader can test how sensitive a rank is to the model. The submitted board.json always uses the constants above.'));
    var debounce = null;
    function slider(label, min, max, step, get, set, fmt) {
      var row = el('div', 'slider-row');
      row.appendChild(el('label', '', label));
      var input = el('input'); input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = get();
      var out = el('output', '', fmt(get()));
      input.oninput = function () {
        set(parseFloat(input.value)); out.textContent = fmt(parseFloat(input.value)); sandbox.live = true;
        // Debounced: a drag fires many inputs, and a full re-render would destroy the slider mid-drag.
        clearTimeout(debounce);
        debounce = setTimeout(render, 250);
      };
      row.appendChild(input); row.appendChild(out);
      sandboxPanel.appendChild(row);
    }
    slider('Prior peers', 0, 10, 1, function () { return sandbox.prior; }, function (v) { sandbox.prior = v; }, function (v) { return v; });
    slider('Growth weight', 0, 0.6, 0.05, function () { return sandbox.gw; }, function (v) { sandbox.gw = v; }, function (v) { return v.toFixed(2); });
    slider('Growth cap %', 50, 400, 25, function () { return sandbox.gcap; }, function (v) { sandbox.gcap = v; }, function (v) { return '+' + v + '%'; });
    slider('Launch peak days', 180, 1460, 10, function () { return sandbox.peak; }, function (v) { sandbox.peak = v; }, function (v) { return v + 'd'; });
    slider('Old-age factor', 0.7, 1, 0.05, function () { return sandbox.old; }, function (v) { sandbox.old = v; }, function (v) { return v.toFixed(2); });
    var reset = el('button', 'button primary', 'Reset to the submitted model');
    reset.onclick = function () { sandbox.live = false; sandbox.prior = M.prior_peers; sandbox.gw = M.growth_weight; sandbox.gcap = M.growth_cap; sandbox.peak = M.age_peak_days; sandbox.old = M.age_old_factor; render(); };
    sandboxPanel.appendChild(reset);
    grid.appendChild(sandboxPanel);
    shell.appendChild(grid);
    var wrap = el('div', 'table-wrap');
    var table = el('table');
    var thead = el('thead'); var tr = el('tr');
    ['Category', 'Live peers', 'Median mcap / TVL', 'Multiple used'].forEach(function (h, i) {
      tr.appendChild(el('th', i > 0 ? 'num' : '', h));
    });
    thead.appendChild(tr); table.appendChild(thead);
    var tbody = el('tbody');
    D.multiples.forEach(function (m) {
      var row = el('tr');
      row.appendChild(el('td', '', m.category));
      row.appendChild(el('td', 'num', fmtNum(m.peers)));
      row.appendChild(el('td', 'num', fmtX(m.median)));
      row.appendChild(el('td', 'num implied', fmtX(m.multiple)));
      tbody.appendChild(row);
    });
    table.appendChild(tbody); wrap.appendChild(table);
    shell.appendChild(wrap);
    shell.appendChild(el('p', 'note', 'Categories with no live peers take the whole-market median of ' + fmtX(D.global_multiple) + '. The multiple is the median of live tokens, so one rich outlier cannot lift a category.'));
  }

  function detailDrawer() {
    var r = bySlug(state.selected);
    if (!r) return;
    var scored = scoredRows();
    var x = null;
    scored.forEach(function (s) { if (s.r.slug === r.slug) x = s; });
    var implied = x ? x.implied : r.implied_value_usd;
    var rank = x ? x.rank : r.rank;
    var base = Math.round(r.tvl_usd * r.category_multiple);
    var d = el('aside', 'detail');
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', r.name + ' detail');
    var close = el('button', 'close', 'Close ✕');
    close.onclick = function () { state.selected = null; writeHash(); render(); };
    d.appendChild(close);
    d.appendChild(el('h2', '', r.name));
    d.appendChild(el('p', 'sub', r.slug + ' · ' + (r.category || 'no category') + ' · ' + r.chains.join(', ')));
    var facts = el('div', 'facts');
    [['Implied value', fmtUsd(implied)], ['Rank', '#' + rank], ['TVL', fmtUsd(r.tvl_usd)], ['7-day change', fmtPct(r.change_7d)], ['Age', fmtAge(r.age_days)], ['Listed', r.listed_at || 'unknown']].forEach(function (f) {
      var fact = el('div', 'fact'); fact.appendChild(el('div', 'num', f[1])); fact.appendChild(el('div', 'lab', f[0])); facts.appendChild(fact);
    });
    d.appendChild(facts);
    var why = el('p', 'why');
    why.textContent = 'Ranked #' + rank + ' because ' + fmtUsd(r.tvl_usd) + ' of TVL prices at ' + fmtX(r.category_multiple) + ' (the ' + (r.category || 'whole-market') + ' comparable multiple), ' +
      (r.change_7d == null ? 'with no 7-day change recorded' : '7-day growth of ' + fmtPct(r.change_7d) + ' moves it ×' + r.growth_multiplier.toFixed(2)) +
      ', ' + fmtAge(r.age_days) + ' running with no token puts its launch factor at ×' + r.launch_multiplier.toFixed(2) +
      ', and ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ' add ×' + r.breadth_multiplier.toFixed(2) + '.';
    d.appendChild(why);
    d.appendChild(el('h3', '', 'How the value is built'));
    var eq = el('div', 'equation');
    eq.innerHTML =
      'TVL ' + fmtUsd(r.tvl_usd) + ' × multiple ' + fmtX(r.category_multiple) + ' = ' + fmtUsd(base) + '<br>' +
      '× growth ×' + r.growth_multiplier.toFixed(2) + ' = ' + fmtUsd(Math.round(base * r.growth_multiplier)) + '<br>' +
      '× launch ×' + r.launch_multiplier.toFixed(2) + ' = ' + fmtUsd(Math.round(base * r.growth_multiplier * r.launch_multiplier)) + '<br>' +
      '× breadth ×' + r.breadth_multiplier.toFixed(2) + ' = <span class="tot">' + fmtUsd(implied) + ' implied</span>';
    d.appendChild(eq);
    d.appendChild(el('h3', '', 'Farm plan'));
    var steps = el('ol', 'steps');
    r.farm_steps.forEach(function (s) {
      var li = el('li');
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var cost = at >= 0 ? s.slice(at + 1) : '';
      li.appendChild(document.createTextNode(action));
      if (cost) li.appendChild(el('div', 'cost', cost));
      steps.appendChild(li);
    });
    d.appendChild(steps);
    d.appendChild(el('p', 'note', 'The plan is generated from this protocol’s own record: its category, chains, TVL and age. Nothing here is financial advice, and a token is never guaranteed.'));
    document.body.appendChild(d);
  }

  function render() {
    root.innerHTML = '';
    var old = document.querySelector('.detail');
    if (old) old.remove();
    root.removeAttribute('aria-busy');
    var shell = header();
    if (state.tab === 'live') liveTab(shell);
    else if (state.tab === 'model') modelTab(shell);
    else boardTab(shell);
    root.appendChild(shell);
    var foot = el('p', 'footer', 'Launch Radar · model ' + D.model_version + ' · snapshot ' + D.as_of + ' from ' + D.source + ' · ranked ' + D.board_size + ' pre-token protocols · ' + D.watchlist_size + ' on the watchlist');
    root.appendChild(foot);
    if (state.selected) detailDrawer();
    window.__shotReady = true;
  }

  readHash();
  if (shot === 'detail') { var s1 = scoredRows(); if (s1.length) state.selected = s1[0].r.slug; state.tab = 'board'; }
  if (shot === 'filtered') {
    var cats = {};
    D.rows.forEach(function (r) { if (r.watchlist) cats[r.category || 'Other'] = (cats[r.category || 'Other'] || 0) + 1; });
    var best = 'all', n = 0;
    Object.keys(cats).forEach(function (c) { if (cats[c] > n) { n = cats[c]; best = c; } });
    state.category = best; state.tab = 'board';
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.selected) { state.selected = null; writeHash(); render(); } });
  render();
})();
