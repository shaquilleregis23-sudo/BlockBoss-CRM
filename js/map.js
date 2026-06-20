// ── Leaflet Map Init ──────────────────────────────────────────────────────────
const map = L.map('map', { zoomControl:false, preferCanvas:true }).setView([40.6815, -73.9301], 12);
const dark   = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution:'© OpenStreetMap © CARTO', maxZoom:19, subdomains:'abcd' });
const sat    = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution:'© Esri', maxZoom:19 });
const labels = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', { attribution:'', maxZoom:19, subdomains:'abcd', opacity:.9 });
dark.addTo(map);
L.control.zoom({ position:'bottomright' }).addTo(map);
const markerLayer = typeof L.markerClusterGroup === 'function'
  ? L.markerClusterGroup({ chunkedLoading:true, chunkInterval:80, chunkDelay:24, disableClusteringAtZoom:17, maxClusterRadius:46, removeOutsideVisibleBounds:true })
  : L.layerGroup();
markerLayer.addTo(map);
const territoryProgressLayer=L.layerGroup().addTo(map);

// ── Marker Rendering ──────────────────────────────────────────────────────────
function leadIcon(l) {
  const badge = addrBadge(l.addr), name = shortName(l);
  const label = (badge || name)
    ? `<div class="prop-label">${badge ? `<span class="prop-num">${badge}</span>` : ''}${name ? `<span class="prop-name">${esc(name)}</span>` : ''}</div>` : '';
  return L.divIcon({ className:'', html:`<div class="sun-wrap"><div class="dot-pin ${markerClass(l)}"></div>${label}</div>`, iconSize:[10,10], iconAnchor:[5,5], popupAnchor:[0,-8] });
}
function renderMarkers() {
  let rows=filterLeads();
  const zoom=map.getZoom(), bounds=map.getBounds().pad(.35);
  if(zoom>=12) rows=rows.filter(l=>l.lat&&l.lng&&bounds.contains([+l.lat,+l.lng]));
  else if(rows.length>8000) rows=rows.slice().sort((a,b)=>leadQuality(b)-leadQuality(a)).slice(0,8000);
  const limit=matchMedia('(max-width:760px)').matches?9000:14000;
  const desired=new Map(rows.slice(0,limit).filter(l=>l.lat&&l.lng).map(l=>[l.id,l]));
  Object.keys(markers).forEach(id=>{if(!desired.has(id)){markerLayer.removeLayer(markers[id]);delete markers[id];}});
  desired.forEach(l => {
    if (!l.lat || !l.lng) return;
    const sig=[l.status,l.first,l.last,l.addr,l.sun_score,l.lat,l.lng].join('|');
    const existing=markers[l.id];
    if(existing){
      if(existing._renderSig!==sig){existing.setLatLng([+l.lat,+l.lng]);existing.setIcon(leadIcon(l));existing.setPopupContent(`<b>${esc(nameOf(l))}</b><br>${esc(l.addr||'')}<br>☀ ${sunScore(l)} · Q${leadQuality(l)} · ${LABEL[l.status||'fresh']}`);existing._renderSig=sig;}
      return;
    }
    const m = L.marker([+l.lat, +l.lng], { icon:leadIcon(l) });
    m.on('click', () => {window._blockWalkDirection=1;openLead(l.id);});
    m.bindPopup(`<b>${esc(nameOf(l))}</b><br>${esc(l.addr||'')}<br>☀ ${sunScore(l)} · Q${leadQuality(l)} · ${LABEL[l.status||'fresh']}`);
    m._renderSig=sig; markerLayer.addLayer(m); markers[l.id] = m;
  });
}
function updateMarker(l) { if (markers[l.id]) { markers[l.id].setIcon(leadIcon(l)); markers[l.id]._renderSig=''; } }

// ── Filter Bar ────────────────────────────────────────────────────────────────
function renderFilter() {
  const bar = document.getElementById('filterBar'), arr = scopedLeads();
  const filters = [['all','All'],['hot','🔥 Hot'],['high_sun','☀️ Sun'],['fresh','Fresh'],['knocked','Knock'],['not_home','Not Home'],['interested','Interested'],['callback','Callback'],['set','Set'],['sat','Sat'],['closed','Closed'],['do_not_knock','DNK'],['pluto','PLUTO'],['manual','Manual'],['imported','CSV'],['entity','LLC'],['hpd','🔓 HPD'],['acris','📜 ACRIS'],['owner_low','⚠ Owner Low'],['joint','👥 Joint'],['verify','🔍 Verify'],['assigned','Assigned']];
  const counts = {}; filters.forEach(([k]) => counts[k] = filterLeadsBy(k, arr).length);
  const active = filters.find(x => x[0] === state.filter) || filters[0];
  document.getElementById('filterToggle').textContent = `Filter: ${active[1]} ${counts[active[0]]||0} ▾`;
  bar.innerHTML = filters.map(([k, l]) => `<div class="chip ${state.filter===k?'active':''}" data-filter="${k}">${l}<span class="count">${counts[k]||0}</span></div>`).join('');
  bar.querySelectorAll('.chip').forEach(c => c.onclick = () => { state.filter = c.dataset.filter; saveState(); bar.classList.remove('open'); renderAll(); });
}

// ── Route Optimizer ───────────────────────────────────────────────────────────
function optimizeRoute() {
  const leads = filterLeads().filter(l => l.lat && l.lng && !['closed','not_interested','do_not_knock','not_qualified'].includes(l.status)).slice(0, 80);
  if (!leads.length) return toast('No leads to route');
  let cur = draftMarker ? draftMarker.getLatLng() : { lat:+leads[0].lat, lng:+leads[0].lng };
  let remaining = [...leads], route = [];
  while (remaining.length) {
    let best = null, bd = Infinity;
    remaining.forEach(l => { const d = Math.hypot(+l.lat - cur.lat, +l.lng - cur.lng); if (d < bd) { bd = d; best = l; } });
    route.push(best); remaining = remaining.filter(l => l.id !== best.id); cur = { lat:+best.lat, lng:+best.lng };
  }
  clearRoute();
  const pts = [];
  route.forEach((l, i) => {
    const html = `<div style="background:#1f6feb;color:white;font-size:9px;font-weight:900;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,.5)">${i+1}</div>`;
    const m = L.marker([+l.lat, +l.lng], { icon:L.divIcon({className:'',html,iconSize:[22,22],iconAnchor:[11,11]}), zIndexOffset:300 }).addTo(map);
    m.on('click', () => openLead(l.id)); routeMarkers.push(m); pts.push([+l.lat, +l.lng]);
  });
  routePolyline = L.polyline(pts, { color:'#58a6ff', weight:2, opacity:.45, dashArray:'6,9' }).addTo(map);
  map.fitBounds(L.latLngBounds(pts).pad(.1));
  toast(`✓ Route: ${route.length} stops`);
  document.getElementById('fieldMenu').classList.remove('open');
}
function clearRoute() {
  routeMarkers.forEach(m => map.removeLayer(m)); routeMarkers = [];
  if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }
}

// ── Field Tools ───────────────────────────────────────────────────────────────
function toggleSatellite() {
  satellite = !satellite;
  if (satellite) { map.removeLayer(dark); sat.addTo(map); labels.addTo(map); }
  else { map.removeLayer(sat); map.removeLayer(labels); dark.addTo(map); }
  renderMarkers(); toast(satellite ? 'Satellite on' : 'Satellite off');
}
function locate() {
  navigator.geolocation?.getCurrentPosition(p => {
    map.setView([p.coords.latitude, p.coords.longitude], 18);
    if (draftMarker) draftMarker.remove();
    draftMarker = L.marker([p.coords.latitude, p.coords.longitude], { icon:L.divIcon({ className:'', html:`<div class="dot-pin dot-cold dot-selected"></div>`, iconSize:[34,34], iconAnchor:[17,17] }) }).addTo(map);
    toast('✓ Location found');
  }, e => toast('GPS unavailable: ' + e.message), { enableHighAccuracy:true, timeout:10000 });
}
function fitLeads() {
  const arr = filterLeads().filter(l => l.lat && l.lng);
  if (!arr.length) return toast('No visible leads');
  map.fitBounds(L.latLngBounds(arr.map(l => [+l.lat, +l.lng])).pad(.18));
  toast('✓ Fit visible leads');
}

// ── Label Visibility (zoom-based) ─────────────────────────────────────────────
function updateLabelViz() { document.getElementById('map').classList.toggle('show-prop-labels', map.getZoom() >= 17); }
