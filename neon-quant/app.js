const $ = id => document.getElementById(id);
const fmt = (n, digits = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const usd = n => '$' + fmt(n);
const signed = (n, suffix = '%') => (n > 0 ? '+' : '') + fmt(n) + suffix;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let current = null;
let requesting = false;
let toastTimer;
const symbols = { SPY: ['S&P 500 ETF', 'S'], QQQ: ['Nasdaq 100 ETF', 'Q'], AAPL: ['Apple', 'A'], MSFT: ['Microsoft', 'M'], NVDA: ['Nvidia', 'N'] };

function toast(message, error = false) {
  const el = $('toast'); el.textContent = message; el.classList.toggle('error', error); el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 4500);
}
async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, cache: 'no-store', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
  return json;
}
async function reload(silent = false) {
  if (requesting) return;
  requesting = true;
  try { const data = await api('/api/state'); current = data; render(data); }
  catch (e) { if (!silent) toast(e.message, true); }
  finally { requesting = false; }
}
async function mutate(path, body, label) {
  if (requesting) return;
  requesting = true;
  $('scanBtn').disabled = true; $('autoBtn').disabled = true;
  try {
    const data = await api(path, 'POST', body);
    toast(label ? label(data) : 'Saved');
  } catch (e) { toast(e.message, true); }
  finally { requesting = false; $('scanBtn').disabled = false; $('autoBtn').disabled = false; await reload(); }
}
function localTime(t) {
  if (!t) return 'NEVER';
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function drawChart(history, defaultEquity) {
  const points = (history.length ? history : [{ equity: defaultEquity }]).filter(x => Number.isFinite(Number(x.equity)));
  const min = Math.min(...points.map(p => p.equity)), max = Math.max(...points.map(p => p.equity));
  const range = Math.max(max - min, max * 0.025, 1), base = min - range * 0.25, top = max + range * 0.25;
  const scaled = points.map((p, i) => ({ x: points.length === 1 ? 380 : 15 + (i / (points.length - 1)) * 730, y: 10 + (1 - (p.equity - base) / (top - base)) * 190 }));
  const coords = scaled.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`);
  const d = 'M ' + coords.join(' L ');
  $('linePath').setAttribute('d', d);
  $('areaPath').setAttribute('d', d + ` L ${scaled.at(-1).x},210 L ${scaled[0].x},210 Z`);
  $('endPoint').setAttribute('cx', scaled.at(-1).x); $('endPoint').setAttribute('cy', scaled.at(-1).y);
  $('chartEmpty').style.display = history.length ? 'none' : 'grid';
  $('chartStart').textContent = history.length ? localTime(history[0].at) : 'START';
  $('chartEnd').textContent = history.length ? localTime(history.at(-1).at) : 'NOW';
}
function render(data) {
  const { account: a, automation: c, provider: p } = data;
  $('currentDate').textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  $('marketBanner').classList.toggle('real', p.real);
  $('marketLabel').textContent = p.label;
  $('marketNote').textContent = p.note;
  $('marketAsOf').textContent = p.real ? 'Fetched ' + localTime(p.updatedAt) : 'FICTIONAL / OFFLINE';
  $('marketClock').textContent = p.clock ? new Date(p.clock).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}) : '—';
  $('capitalSelect').value = String(data.controls.capital);
  $('profileSelect').value = data.controls.profile;
  $('replayBtn').disabled = p.real || c.killSwitch;
  $('historyBtn').disabled = !data.controls.historyAvailable;
  $('historyConnection').textContent = data.controls.historyAvailable ? 'IEX keys configured · completed sessions only' : 'Add ALPACA_KEY_ID + ALPACA_SECRET_KEY to .env';
  const risk = data.controls.risk;
  $('riskPerTrade').textContent = (risk.riskFraction * 100).toFixed(1) + '% EQ';
  $('dailyLossLimit').textContent = (risk.maxDailyLoss * 100).toFixed(1) + '%';
  $('peakLimit').textContent = (risk.maxPeakDrawdown * 100).toFixed(1) + '%';
  $('dailyEntryLimit').textContent = String(risk.maxEntriesPerDay).padStart(2,'0');
  $('frictionCost').textContent = data.controls.frictionBpsPerSide + ' BPS';
  $('dayPnl').textContent = (a.dailyPnl < 0 ? '−' : a.dailyPnl > 0 ? '+' : '') + usd(Math.abs(a.dailyPnl));
  $('dayPnl').classList.toggle('negative', a.dailyPnl < 0);
  $('realizedToday').textContent = (a.realizedDay < 0 ? '−' : a.realizedDay > 0 ? '+' : '') + usd(Math.abs(a.realizedDay));
  $('realizedToday').classList.toggle('negative', a.realizedDay < 0);
  $('entriesToday').textContent = a.entriesToday;
  $('sidebarMode').textContent = p.real ? 'REAL DATA · PAPER ORDERS' : 'SYNTHETIC DATA · PAPER ORDERS';
  $('equity').textContent = usd(a.equity);
  $('cash').textContent = usd(a.cash);
  $('pnl').textContent = `${a.pnl < 0 ? '−' : a.pnl > 0 ? '+' : ''}${usd(Math.abs(a.pnl))}`;
  $('pnl').classList.toggle('negative', a.pnl < 0);
  $('pnlPercent').textContent = signed(a.pnlPct);
  $('pnlPercent').classList.toggle('negative', a.pnlPct < 0);
  $('holdingsCount').textContent = `${a.holdings.length} open position${a.holdings.length === 1 ? '' : 's'}`;
  $('winRate').textContent = a.winRate === null ? '—' : fmt(a.winRate, 1) + '%';
  $('closedTrades').textContent = `${a.closed} closed trade${a.closed === 1 ? '' : 's'}`;
  $('drawdown').textContent = fmt(a.drawdown) + '%';
  $('chartSubhead').textContent = p.real ? 'IEX MARKET DATA' : 'SYNTHETIC SIMULATION';
  $('chartHint').textContent = `${data.equityHistory.length} paper equity samples`;
  drawChart(data.equityHistory, a.equity);
  $('engineState').textContent = c.killSwitch ? 'HALTED' : c.autoEnabled ? 'AUTONOMOUS' : 'STANDBY';
  $('sessionState').textContent = p.real ? (c.marketSessionOpen ? 'REGULAR HOURS' : 'MARKET CLOSED') : 'ANYTIME / DEMO';
  $('scanCount').textContent = data.scanCount;
  $('lastScan').textContent = localTime(data.scannedAt);
  $('autoDescription').textContent = c.autoEnabled ? `One new minute scan every ${c.intervalMinutes} min` : 'Manual operation';
  $('autoBtn').innerHTML = c.autoEnabled ? 'Ⅱ <span>Pause auto</span>' : '▶ <span>Enable auto</span>';
  $('autoToggle').checked = c.autoEnabled;
  $('autoToggle').disabled = c.killSwitch;
  $('killToggle').checked = c.killSwitch;
  $('scanBtn').disabled = c.killSwitch;
  $('aiStatus').textContent = data.ai.mode === 'replay' ? 'QUANT-ONLY REPLAY' : data.ai.mode === 'on' ? 'AI REVIEW ENABLED' : data.ai.mode === 'error' ? 'AI ERROR' : data.ai.mode === 'configured' ? 'AI READY' : 'QUANT ONLY';
  $('aiNote').textContent = data.ai.note || 'No analyst output yet.';
  renderMarket(data.quotes, data.signals);
  renderPositions(a.holdings);
  renderSignals(data.signals);
  renderActivity(data.events);
  renderTrades(data.trades);
}
function renderMarket(quotes, signals) {
  $('marketRows').innerHTML = Object.entries(symbols).map(([symbol, [name, letter]]) => {
    const q = quotes[symbol], s = signals.find(x => x.symbol === symbol);
    if (!q) return '';
    const action = s?.action || 'WAIT';
    const delta = q.changePct;
    const trendUp = s?.stats ? s.stats.ema9 >= s.stats.ema21 : delta >= 0;
    return `<tr><td><div class="asset-wrap"><span class="asset-icon">${letter}</span><span class="asset-name-wrap"><span class="symbol">${symbol}</span><span class="asset-name">${esc(name)}</span></span></div></td><td>${usd(q.price)}</td><td class="${delta < 0 ? 'negative' : ''}" style="color:${delta >= 0 ? 'var(--mint)' : ''}">${signed(delta)}</td><td><span class="trend ${trendUp ? '' : 'down'}"><i></i>${trendUp ? 'BULLISH' : 'BEARISH'}</span></td><td><span class="signal-tag ${action.toLowerCase()}">${action}</span></td></tr>`;
  }).join('');
}
function renderPositions(items) {
  $('positionChip').textContent = `${items.length} OPEN`;
  $('positionsList').innerHTML = items.length ? items.map(p => `<div class="position-item"><div><div class="item-title">${esc(p.symbol)} <span class="item-sub">· ${fmt(p.qty, 4)} shares</span></div><div class="item-sub">Cost ${usd(p.cost)} / Mark ${usd(p.value)} · Stop ${usd(p.stopPrice)} · Target ${usd(p.targetPrice)}</div></div><div class="item-value">${usd(p.value)}<small class="${p.pnl < 0 ? 'negative' : ''}" style="color:${p.pnl >= 0 ? 'var(--mint)' : ''}">${p.pnl >= 0 ? '+' : '−'}${usd(Math.abs(p.pnl))} (${signed(p.pnlPct)})</small></div></div>`).join('') : '<div class="empty-state">No open positions. Capital is available for simulated intraday trades.</div>';
}
function renderSignals(items) {
  $('signalsList').innerHTML = items.length ? items.map(s => `<div class="signal-item"><div><div class="item-title">${esc(s.symbol)} <span class="item-sub">· ${s.confidence}% score</span></div><div class="item-sub" title="${esc(s.reason)}">${esc(s.decision?.reason || s.reason)}</div></div><span class="signal-tag ${s.action.toLowerCase()}">${esc(s.action)}</span></div>`).join('') : '<div class="empty-state">Advance the demo minute clock or scan real IEX bars to evaluate breakout signals.</div>';
}
function renderActivity(items) {
  $('activityList').innerHTML = items.length ? items.slice(0, 14).map(e => {
    const k = String(e.kind || '').toLowerCase();
    const icon = k === 'fill' ? '↗' : k === 'scan' ? '◈' : k === 'control' ? '!' : '+';
    return `<div class="activity-item ${esc(k)}"><span class="activity-symbol">${icon}</span><div><div class="activity-text">${esc(e.text)}</div><div class="activity-time">${localTime(e.at)}</div></div></div>`;
  }).join('') : '<div class="empty-state">No activity recorded. Scans and simulated fills appear here.</div>';
}
function renderTrades(items) {
  $('blotterCount').textContent = `${items.length} VIRTUAL FILLS`;
  $('tradeRows').innerHTML = items.length ? items.slice(0,40).map(t => {
    const time = new Date(t.at).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'});
    return `<tr title="${esc(t.reason)}"><td>${esc(time)}</td><td><strong>${esc(t.symbol)}</strong></td><td class="${t.side==='BUY'?'side-buy':'side-sell'}">${esc(t.side)}</td><td>${fmt(t.qty,4)}</td><td>${usd(t.fillPrice)}</td><td>${usd(t.notional)}</td><td class="${t.pnl < 0 ? 'negative':''}">${t.pnl==null?'—':(t.pnl>=0?'+':'−')+usd(Math.abs(t.pnl))}</td></tr>`;
  }).join('') : '<tr><td colspan="7" class="empty-state">No simulated fills. Advance the synthetic clock to see orders, or connect IEX.</td></tr>';
}
function etDay(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(date).map(x=>[x.type,x.value]));
  return {iso:`${p.year}-${p.month}-${p.day}`,weekday:p.weekday};
}
function defaultHistoricalDay() {
  let t=Date.now()-86400000;
  for(let i=0;i<5;i++){
    const p=etDay(new Date(t));
    if(!['Sat','Sun'].includes(p.weekday))return p.iso;
    t-=86400000;
  }
  return etDay(new Date(Date.now()-86400000)).iso;
}
$('historyDate').value = defaultHistoricalDay();
$('historyDate').max = defaultHistoricalDay();
function renderHistorical(result) {
  $('historyStatus').classList.remove('error');
  $('historyStatus').textContent = `${result.date} · ${result.feed} · ${result.strategy} · ${result.warning}`;
  $('historyRows').innerHTML = result.results.map(r => `<tr><td><strong>${usd(r.capital)}</strong></td><td>${esc(r.profile.toUpperCase())}</td><td class="${r.pnl<0?'negative':'side-buy'}">${r.pnl>=0?'+':'−'}${usd(Math.abs(r.pnl))} (${signed(r.pnlPct)})</td><td>${r.winRate===null?'—':fmt(r.winRate,1)+'%'}</td><td>${r.closed} closed / ${r.entries} entries</td><td>${fmt(r.peakDrawdownPct)}%</td><td class="${r.vsSpyHoldPnl<0?'negative':''}">${r.vsSpyHoldPnl===null?'—':(r.vsSpyHoldPnl>=0?'+':'−')+usd(Math.abs(r.vsSpyHoldPnl))}</td></tr>`).join('');
  if (result.results.some(r=>!r.allFlat)) $('historyStatus').textContent += ' WARNING: One or more virtual positions could not be closed due to missing late-session bars.';
}
$('historyBtn').addEventListener('click', async () => {
  if(requesting)return;
  requesting=true;
  $('historyBtn').disabled=true;
  $('historyStatus').textContent='Loading historical IEX minute candles and running chronological paper fills…';
  $('historyStatus').classList.remove('error');
  try{
    const response=await api('/api/backtest','POST',{date:$('historyDate').value,profile:current.controls.profile});
    renderHistorical(response);
    toast('Real-data historical research completed. No actual trades were placed.');
  }catch(e){$('historyStatus').classList.add('error');$('historyStatus').textContent=e.message;toast(e.message,true);}
  finally{requesting=false;$('historyBtn').disabled=!current?.controls.historyAvailable;}
});
$('scanBtn').addEventListener('click', () => mutate('/api/scan', {}, r => `Minute processed: ${r.filled} virtual fill${r.filled === 1 ? '' : 's'}.`));
$('replayBtn').addEventListener('click', () => mutate('/api/replay', {minutes:30}, r => `Advanced ${r.minutes} FICTIONAL minutes · ${r.filled} paper fills · AI not used.`));
$('autoBtn').addEventListener('click', () => mutate('/api/auto', { enabled: !current?.automation.autoEnabled }, r => r.enabled ? 'Scheduled PAPER scans enabled.' : 'Automatic scans paused.'));
$('autoToggle').addEventListener('change', e => mutate('/api/auto', { enabled: e.target.checked }, r => r.enabled ? 'Paper scans enabled.' : 'Paper scans paused.'));
$('killToggle').addEventListener('change', e => mutate('/api/kill', { enabled: e.target.checked }, () => e.target.checked ? 'Emergency stop engaged.' : 'Emergency stop released.'));
async function resetPaper(capital,profile) {
  const confirmation = prompt(`Erase ALL paper holdings, fills, and profit history, and start a NEW $${Number(capital).toLocaleString()} virtual account? Type RESET PAPER to continue.`);
  if(confirmation === 'RESET PAPER') await mutate('/api/reset', {confirmation,capital:Number(capital),profile}, () => 'New virtual account initialized. All trades remain PAPER ONLY.');
  else {toast('No reset performed.',true);await reload();}
}
$('capitalSelect').addEventListener('change',e => resetPaper(e.target.value,$('profileSelect').value));
$('profileSelect').addEventListener('change',e => mutate('/api/profile',{profile:e.target.value},r => `New paper risk profile: ${r.profile}.`));
$('resetBtn').addEventListener('click', () => resetPaper($('capitalSelect').value,$('profileSelect').value));
reload();
setInterval(() => reload(true), 15000);
