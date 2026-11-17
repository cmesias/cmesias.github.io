/* NEON QUANT SHARE PREVIEW. All data and fills below are fictitious.
 * Runs entirely within the viewer's browser. Never sends an HTTP trading request.
 * Not a market simulator/backtest and not connected to AI.
 */
(() => {
  'use strict';
  const nativeFetch = window.fetch.bind(window);
  const tickers = ['SPY','QQQ','AAPL','MSFT','NVDA'];
  const bases = {SPY:580,QQQ:500,AAPL:240,MSFT:430,NVDA:140};
  const risk = {
    measured:{label:'Measured',riskFraction:.005,maxAllocation:.22,maxPositions:2,maxEntriesPerDay:5,maxDailyLoss:.02,maxPeakDrawdown:.10,stopPct:.008,rewardRisk:1.8,cooldownMinutes:12},
    aggressive:{label:'Aggressive / bounded',riskFraction:.01,maxAllocation:.35,maxPositions:3,maxEntriesPerDay:10,maxDailyLoss:.04,maxPeakDrawdown:.15,stopPct:.012,rewardRisk:1.8,cooldownMinutes:8}
  };
  const money = n => Math.round(n*100)/100;
  const t0 = Date.parse('2026-11-16T14:50:00.000Z');
  let S;
  const when = offset => new Date(t0+offset*60000).toISOString();
  function sampleTrade(symbol,side,qty,price,pnl,offset,reason) {
    return {id:'PREVIEW-'+symbol+'-'+side+'-'+offset,at:when(offset),symbol,side,qty,fillPrice:money(price),notional:money(qty*price),pnl,reason};
  }
  function seeded(capital,profile) {
    const p1 = Math.max(1,Math.floor(capital*.14/bases.NVDA));
    const p2 = Math.max(1,Math.floor(capital*.13/bases.AAPL));
    const realized = money(capital*.0022);
    const buyCost = money(p1*140.2+p2*239.6);
    const initial = {
      capital,profile, cash:money(capital-buyCost+realized),
      positions:{
        NVDA:{qty:p1,avgPrice:140.2,stopPrice:138.52,targetPrice:143.23},
        AAPL:{qty:p2,avgPrice:239.6,stopPrice:236.72,targetPrice:244.78}
      },
      trades:[
        sampleTrade('AAPL','BUY',p2,239.6,null,-7,'Fictional VWAP breakout entry'),
        sampleTrade('NVDA','BUY',p1,140.2,null,-10,'Fictional opening-range breakout'),
        sampleTrade('QQQ','SELL',Math.max(1,Math.floor(capital*.15/500)),502.2,realized,-17,'Fictional take-profit'),
        sampleTrade('QQQ','BUY',Math.max(1,Math.floor(capital*.15/500)),500,null,-26,'Fictional momentum entry')
      ],
      events:[
        {kind:'SCAN',at:when(0),text:'Showcase initialized • fictional market session'},
        {kind:'FILL',at:when(-7),text:'PAPER BUY AAPL · Sample order'},
        {kind:'FILL',at:when(-10),text:'PAPER BUY NVDA · Sample order'},
        {kind:'FILL',at:when(-17),text:'PAPER SELL QQQ · Sample win (not real)'},
        {kind:'SYSTEM',at:when(-27),text:'Demo only · No live AI, data or broker connections'}
      ],
      clockMinute:0,scanCount:12,autoEnabled:false,killSwitch:false,
      equityHistory:[], signals:[], realizedDay:realized, highWater:capital,
      scannedAt:when(0)
    };
    const equity = accountValue(initial);
    for(let i=0;i<45;i++) {
      const frac=i/44;
      const wave=Math.sin(i/3.9)*capital*.00035;
      initial.equityHistory.push({at:when(-44+i),equity:money(capital + (equity-capital)*frac+wave)});
    }
    initial.highWater=Math.max(capital,equity);
    initial.signals=makeSignals(initial);
    return initial;
  }
  function mark(s) {
    const i=tickers.indexOf(s);
    const step=S.clockMinute;
    return money(bases[s]*(1+((s==='NVDA'?.0095:s==='AAPL'?.0008:.0035))+
      .003*Math.sin(step/7+i*.8)+.0011*Math.sin(step/3+i*2)));
  }
  function accountValue(st=S) {
    return money(st.cash + Object.keys(st.positions).reduce((acc,sym)=>{
      const price=st===S?mark(sym):(sym==='NVDA'?141.35:239.95);
      return acc+st.positions[sym].qty*price;
    },0));
  }
  function makeSignals(st) {
    const reasons=['Above VWAP · awaiting range break','Elevated volume · scanning breakout','Price above EMA 9/21','Managing virtual position','Opening-range confirmation pending'];
    return tickers.map((symbol,i)=>{
      const price=bases[symbol]*(1+.001*i);
      return {symbol,action:i===1&&st.clockMinute%9===3?'BUY':'HOLD',
        confidence:Math.round(58+Math.sin(st.clockMinute+i)*12),
        reason:reasons[i],stats:{ema9:price*1.002,ema21:price*.998,vwap:price*.997}};
    });
  }
  function account() {
    const holdings=Object.keys(S.positions).map(symbol=>{
      const p=S.positions[symbol],price=mark(symbol);
      return {symbol,qty:p.qty,price,cost:money(p.qty*p.avgPrice),
        value:money(p.qty*price),pnl:money(p.qty*(price-p.avgPrice)),
        pnlPct:money(100*(price/p.avgPrice-1)),stopPrice:p.stopPrice,targetPrice:p.targetPrice};
    });
    const equity=money(S.cash+holdings.reduce((t,p)=>t+p.value,0));
    const closed=S.trades.filter(t=>t.side==='SELL');
    return {equity,cash:money(S.cash),pnl:money(equity-S.capital),
      pnlPct:money(100*(equity/S.capital-1)),
      holdings,winRate:closed.length?money(100*closed.filter(t=>t.pnl>0).length/closed.length):null,
      closed:closed.length,drawdown:money(Math.max(0,100*(1-equity/Math.max(equity,S.highWater)))),
      dailyPnl:money(equity-S.capital),realizedDay:money(S.realizedDay),
      entriesToday:S.trades.filter(t=>t.side==='BUY').length};
  }
  function data() {
    const quotes={};
    for(const symbol of tickers) {
      const price=mark(symbol);
      quotes[symbol]={symbol,price,changePct:money(100*(price/bases[symbol]-1)),
        asOf:when(S.clockMinute),bars:[]};
    }
    return {brand:'NEON / QUANT',version:2,paperOnly:true,
      provider:{source:'demo',real:false,label:'FICTIONAL SHOWCASE • NOT LIVE MARKET DATA',
        note:'Illustrative sample prices and trades. AI + broker disabled in this shareable preview.',
        updatedAt:when(S.clockMinute),clock:when(S.clockMinute)},
      quotes,account:account(),
      automation:{autoEnabled:S.autoEnabled,killSwitch:S.killSwitch,intervalMinutes:0.2,marketSessionOpen:true,busy:false},
      scanCount:S.scanCount,scannedAt:S.scannedAt,signals:S.signals,
      ai:{mode:'off',note:'SHOWCASE ONLY: The real app supports optional OpenAI review. No model is connected or called by this public preview.'},
      trades:S.trades,events:S.events,equityHistory:S.equityHistory,
      controls:{capital:S.capital,capitalOptions:[10000,50000],profile:S.profile,
        profileOptions:['measured','aggressive'],risk:risk[S.profile],
        frictionBpsPerSide:10,historyAvailable:false,dailyGoal:[50,100],
        demoCursor:35+S.clockMinute,demoSession:0},
      dailyTarget:{lower:50,upper:100,notice:'Research benchmark only, not a trading promise.'}};
  }
  function log(text,kind='SCAN') {
    S.events.unshift({kind,at:when(S.clockMinute),text});
    S.events=S.events.slice(0,50);
  }
  function fill(side,symbol,qty,price,reason) {
    let pnl=null;
    if(side==='BUY') {
      const cost=qty*price;
      if(cost>S.cash)return false;
      S.cash=money(S.cash-cost);
      S.positions[symbol]={qty,avgPrice:price,stopPrice:money(price*(1-risk[S.profile].stopPct)),
        targetPrice:money(price*(1+risk[S.profile].stopPct*1.8))};
    } else {
      const held=S.positions[symbol];
      if(!held)return false;
      qty=held.qty;
      pnl=money(qty*(price-held.avgPrice));
      S.realizedDay=money(S.realizedDay+pnl);
      S.cash=money(S.cash+qty*price);
      delete S.positions[symbol];
    }
    S.trades.unshift(sampleTrade(symbol,side,qty,price,pnl,S.clockMinute,reason));
    log('PAPER '+side+' '+symbol+' · Fictional illustrative fill','FILL');
    return true;
  }
  function minute() {
    if(S.killSwitch)return 0;
    S.clockMinute+=1;
    S.scanCount+=1;
    S.scannedAt=when(S.clockMinute);
    let filled=0;
    const phase=S.clockMinute%26;
    if(phase===5 && !S.positions.QQQ) {
      const px=mark('QQQ');
      const qty=Math.max(1,Math.floor(S.capital*.11/px));
      if(fill('BUY','QQQ',qty,px,'Showcase: fictional breakout'))filled++;
    }
    if(phase===17 && S.positions.QQQ) {
      if(fill('SELL','QQQ',0,mark('QQQ'),'Showcase: fictional intraday exit'))filled++;
    }
    S.signals=makeSignals(S);
    const equity=accountValue();
    S.highWater=Math.max(S.highWater,equity);
    S.equityHistory.push({at:when(S.clockMinute),equity});
    S.equityHistory=S.equityHistory.slice(-240);
    if(S.clockMinute%15===0)log('Sample market scan completed · synthetic bars');
    return filled;
  }
  function response(obj,status=200) {
    return Promise.resolve(new Response(JSON.stringify(obj),{
      status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
    }));
  }
  S=seeded(50000,'aggressive');
  window.fetch=(input,init={})=>{
    const path=typeof input==='string'?input:input.url||'';
    if(!path.startsWith('/api/'))return nativeFetch(input,init);
    let body={};
    try{body=init.body?JSON.parse(init.body):{};}catch{return response({error:'Invalid demo input'},400);}
    if(path==='/api/state')return response(data());
    if(path==='/api/scan')return response({ok:true,filled:minute()});
    if(path==='/api/replay'){
      const n=Math.max(1,Math.min(60,Number(body.minutes)||30));
      let filled=0;
      for(let i=0;i<n;i++)filled+=minute();
      return response({ok:true,filled,minutes:n});
    }
    if(path==='/api/auto'){
      if(S.killSwitch&&body.enabled)return response({error:'Release emergency stop first'},409);
      S.autoEnabled=!!body.enabled;
      log(S.autoEnabled?'Auto demo playback enabled':'Auto demo playback paused','CONTROL');
      return response({ok:true,enabled:S.autoEnabled});
    }
    if(path==='/api/kill'){
      S.killSwitch=!!body.enabled;
      if(S.killSwitch)S.autoEnabled=false;
      log(S.killSwitch?'Emergency demo stop enabled':'Emergency demo stop released','CONTROL');
      return response({ok:true});
    }
    if(path==='/api/profile'){
      if(!risk[body.profile])return response({error:'Unknown risk preset'},400);
      S.profile=body.profile;
      log('Risk preset changed to '+body.profile,'CONTROL');
      return response({ok:true,profile:S.profile});
    }
    if(path==='/api/reset'){
      if(body.confirmation!=='RESET PAPER')return response({error:'Type RESET PAPER to confirm'},400);
      if(![10000,50000].includes(body.capital)||!risk[body.profile])return response({error:'Invalid demo configuration'},400);
      S=seeded(body.capital,body.profile);
      return response({ok:true});
    }
    if(path==='/api/backtest')return response({error:'Real historical replay requires the private Node app and authorized Alpaca data keys.'},400);
    return response({error:'Unknown preview route'},404);
  };
  window.setInterval(()=>{if(S.autoEnabled&&!S.killSwitch)minute();},12000);
})();
