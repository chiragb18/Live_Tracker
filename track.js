/**
 * HyperTrack Mobile Auto-Broadcaster Script
 * Automatically triggers live location streaming on page load using URL session IDs.
 */

const Toast = {
  show(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '';
    if (type === 'success') {
      icon = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>';
    } else if (type === 'error') {
      icon = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
    } else if (type === 'warning') {
      icon = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>';
    } else {
      icon = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transform = 'translateX(120%)';
      toast.style.opacity = '0';
      toast.style.transition = 'all 0.5s ease';
      setTimeout(() => toast.remove(), 500);
    }, 4000);
  }
};

const TrackClient = {
  sessionId: '',
  isSharing: false,
  watchId: null,
  hasIPFallback: false,
  
  // Leaflet refs
  previewMap: null,
  currentMarker: null,
  accuracyCircle: null,

  // Dom refs
  statusBadge: null,
  btnDisconnect: null,

  async init() {
    this.statusBadge = document.getElementById('client-badge');
    this.btnDisconnect = document.getElementById('btn-disconnect');
    
    // 1. Extract session ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    let id = urlParams.get('id');
    
    if (!id) {
      // Generate fallback temporary ID
      const adjectives = ['swift', 'hyper', 'crypto', 'apex', 'delta', 'alpha'];
      const nouns = ['panther', 'falcon', 'ghost', 'runner', 'scout', 'ninja'];
      const randAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
      const randNoun = nouns[Math.floor(Math.random() * nouns.length)];
      const randNum = Math.floor(Math.random() * 90) + 10;
      id = `${randAdj}-${randNoun}-${randNum}`;
      
      // Update browser URL query string without reloading to show a correct share link
      const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?id=${id}`;
      window.history.replaceState({ path: newUrl }, '', newUrl);
    }
    
    this.sessionId = id.trim();
    document.getElementById('client-session-id').innerText = this.sessionId;

    // 2. Setup Leaflet Micro Map Preview
    this.previewMap = L.map('client-micro-map', {
      zoomControl: false,
      attributionControl: false
    }).setView([0, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20
    }).addTo(this.previewMap);

    // 3. Bind Actions
    this.btnDisconnect.addEventListener('click', () => this.toggleSharing());

    // 4. Auto-Configure Firebase offline fallback if unconfigured
    if (!FirebaseHelper.isConfigured()) {
      const demoConfig = {
        apiKey: 'DEMO_MODE',
        projectId: 'demo-mode',
        databaseURL: 'https://demo-mode-rtdb.firebaseio.com/'
      };
      FirebaseHelper.saveConfig(demoConfig);
      console.log('⚡ HYPERTRACK: Auto-activated local Offline Demo mode for zero-setup ease.');
    }

    // 5. Instantly trigger tracking
    try {
      await FirebaseHelper.initialize();
      this.startBroadcast();
    } catch (err) {
      Toast.show(`Setup Error: ${err.message}`, 'error');
    }
  },

  async startBroadcast() {
    this.isSharing = true;

    // A. Trigger instant Zero-Permission IP Fallback Geolocation
    this.fetchIPLocation();

    // B. Trigger background GPS Geolocation Watch
    if (!navigator.geolocation) {
      Toast.show('High accuracy GPS is not supported by your browser.', 'warning');
      return;
    }

    const geoOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    };

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onLocationSuccess(pos),
      (err) => this.onLocationError(err),
      geoOptions
    );

    // Update UI status badges
    this.statusBadge.innerText = 'SHARING ACTIVE';
    this.statusBadge.className = 'client-status-badge client-status-active';
    
    // Toggle pulse animation indicators
    document.getElementById('radar-pulse-1').style.display = 'block';
    document.getElementById('radar-pulse-2').style.display = 'block';
    document.getElementById('radar-center-dot').style.backgroundColor = 'var(--accent-green)';
    document.getElementById('radar-center-dot').style.boxShadow = '0 0 20px var(--accent-green), 0 0 40px var(--accent-green)';

    Toast.show('Live location broadcast active!', 'success');
  },

  async fetchIPLocation() {
    try {
      const response = await fetch('https://ipapi.co/json/');
      if (!response.ok) throw new Error('IP API failed');
      const data = await response.json();
      
      if (data && data.latitude && data.longitude) {
        console.log('📍 IP Geolocation resolved:', data.city, data.latitude, data.longitude);
        this.hasIPFallback = true;

        const badgeText = this.statusBadge.innerText;
        if (badgeText !== 'GPS ACTIVE' && this.isSharing) {
          // Update Coordinates Display
          document.getElementById('client-lat').innerText = data.latitude.toFixed(6);
          document.getElementById('client-lng').innerText = data.longitude.toFixed(6);
          document.getElementById('client-accuracy').innerText = 'approx. ' + Math.round(data.accuracy || 5000);
          document.getElementById('client-speed').innerText = '0.0';
          document.getElementById('client-lock-type').innerText = `FALLBACK (IP - ${data.city || 'Network'})`;
          document.getElementById('client-lock-type').style.color = 'var(--accent-orange)';

          // Update Firebase location node with IP label
          await FirebaseHelper.updateLocation(this.sessionId, {
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: data.accuracy || 5000,
            speed: 0,
            altitude: null,
            heading: null,
            lockType: 'IP'
          });

          // Adjust micro map
          const latlng = [data.latitude, data.longitude];
          this.previewMap.setView(latlng, 12);

          if (this.accuracyCircle) {
            this.previewMap.removeLayer(this.accuracyCircle);
          }
          this.accuracyCircle = L.circle(latlng, {
            radius: data.accuracy || 5000,
            color: 'var(--accent-orange)',
            fillColor: 'var(--accent-orange)',
            fillOpacity: 0.1,
            weight: 1.5,
            dashArray: '5, 5'
          }).addTo(this.previewMap);

          if (this.currentMarker) {
            this.currentMarker.setLatLng(latlng);
          } else {
            const customRadarIcon = L.divIcon({
              className: 'radar-marker-preview',
              html: `
                <div class="radar-marker">
                  <div class="radar-center" style="background-color: var(--accent-orange); box-shadow: 0 0 10px var(--accent-orange);"></div>
                  <div class="radar-ring" style="border-color: var(--accent-orange);"></div>
                </div>
              `,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            });
            this.currentMarker = L.marker(latlng, { icon: customRadarIcon }).addTo(this.previewMap);
          }

          Toast.show(`Instant network location resolved: ${data.city || 'Network'}`, 'info');
        }
      }
    } catch (err) {
      console.warn('IP Geolocation failed or was throttled:', err);
    }
  },

  async onLocationSuccess(position) {
    if (!this.isSharing) return;
    const coords = position.coords;

    // 1. Render data values in Stats Cards
    document.getElementById('client-lat').innerText = coords.latitude.toFixed(6);
    document.getElementById('client-lng').innerText = coords.longitude.toFixed(6);
    document.getElementById('client-accuracy').innerText = Math.round(coords.accuracy);
    
    const speedKmh = coords.speed !== null && coords.speed > 0 ? (coords.speed * 3.6).toFixed(1) : '0.0';
    document.getElementById('client-speed').innerText = speedKmh;
    
    document.getElementById('client-lock-type').innerText = 'HIGH-ACCURACY GPS';
    document.getElementById('client-lock-type').style.color = 'var(--accent-green)';
    this.statusBadge.innerText = 'GPS ACTIVE';

    // 2. Synchronize to Firebase RTDB
    try {
      await FirebaseHelper.updateLocation(this.sessionId, {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy || 0,
        altitude: coords.altitude,
        speed: coords.speed,
        heading: coords.heading,
        lockType: 'GPS' // Mark as official high-accuracy GPS
      });
    } catch (err) {
      console.error('Firebase DB upload failed:', err);
    }

    // 3. Update Preview Map
    const latlng = [coords.latitude, coords.longitude];
    this.previewMap.setView(latlng, 16);

    if (this.accuracyCircle) {
      this.accuracyCircle.setLatLng(latlng);
      this.accuracyCircle.setRadius(coords.accuracy);
      this.accuracyCircle.setStyle({ color: '#39ff14', fillColor: '#39ff14' });
    } else {
      this.accuracyCircle = L.circle(latlng, {
        radius: coords.accuracy,
        color: '#39ff14',
        fillColor: '#39ff14',
        fillOpacity: 0.1,
        weight: 1.5
      }).addTo(this.previewMap);
    }

    if (this.currentMarker) {
      this.currentMarker.setLatLng(latlng);
      const customRadarIcon = L.divIcon({
        className: 'radar-marker-preview',
        html: `
          <div class="radar-marker">
            <div class="radar-center" style="background-color: var(--accent-green); box-shadow: var(--shadow-neon-green);"></div>
            <div class="radar-ring" style="border-color: var(--accent-green);"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      this.currentMarker.setIcon(customRadarIcon);
    } else {
      const customRadarIcon = L.divIcon({
        className: 'radar-marker-preview',
        html: `
          <div class="radar-marker">
            <div class="radar-center" style="background-color: var(--accent-green); box-shadow: var(--shadow-neon-green);"></div>
            <div class="radar-ring" style="border-color: var(--accent-green);"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      this.currentMarker = L.marker(latlng, { icon: customRadarIcon }).addTo(this.previewMap);
    }
  },

  onLocationError(error) {
    console.error('GPS Geolocation Error:', error);
    let errorMsg = 'Failed to locate device GPS.';
    let shouldStop = false;

    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMsg = 'GPS Access Blocked. Broadcasting approximate network location.';
        if (!this.hasIPFallback) shouldStop = true;
        break;
      case error.POSITION_UNAVAILABLE:
        errorMsg = 'GPS chip coordinates unavailable. Broadcasting approximate network location.';
        break;
      case error.TIMEOUT:
        errorMsg = 'GPS lock timed out. Retrying Lock...';
        break;
    }

    if (shouldStop) {
      this.stopBroadcast();
      Toast.show(errorMsg, 'error');
    } else {
      Toast.show(errorMsg, 'warning');
    }
  },

  stopBroadcast() {
    this.isSharing = false;
    this.hasIPFallback = false;

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    // Set offline in DB
    FirebaseHelper.setOffline(this.sessionId);

    // Update UI Status Badges
    this.statusBadge.innerText = 'DISCONNECTED';
    this.statusBadge.className = 'client-status-badge client-status-idle';

    // Clear stats UI
    document.getElementById('client-lat').innerText = '--.------';
    document.getElementById('client-lng').innerText = '--.------';
    document.getElementById('client-speed').innerText = '0.0';
    document.getElementById('client-accuracy').innerText = '--';
    document.getElementById('client-lock-type').innerText = 'SHARING SUSPENDED';
    document.getElementById('client-lock-type').style.color = 'var(--text-secondary)';

    // Stop pulse animations
    document.getElementById('radar-pulse-1').style.display = 'none';
    document.getElementById('radar-pulse-2').style.display = 'none';
    document.getElementById('radar-center-dot').style.backgroundColor = 'var(--text-secondary)';
    document.getElementById('radar-center-dot').style.boxShadow = 'none';

    // Reset maps
    if (this.currentMarker) {
      this.previewMap.removeLayer(this.currentMarker);
      this.currentMarker = null;
    }
    if (this.accuracyCircle) {
      this.previewMap.removeLayer(this.accuracyCircle);
      this.accuracyCircle = null;
    }
    this.previewMap.setView([0, 0], 2);

    Toast.show('Broadcast suspended.', 'info');
  },

  toggleSharing() {
    if (this.isSharing) {
      this.stopBroadcast();
      this.btnDisconnect.className = 'btn btn-primary';
      this.btnDisconnect.innerHTML = `
        <svg width="18" height="18" fill="currentColor" stroke="none" viewBox="0 0 24 24" style="margin-right: 8px; vertical-align: middle;">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        Reconnect & Start Sharing
      `;
    } else {
      this.btnDisconnect.className = 'btn btn-danger';
      this.btnDisconnect.innerHTML = `
        <svg width="18" height="18" fill="currentColor" stroke="none" viewBox="0 0 24 24" style="margin-right: 8px; vertical-align: middle;">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
        Stop Sharing Location
      `;
      this.startBroadcast();
    }
  }
};

// Initialize when page elements are fully loaded
document.addEventListener('DOMContentLoaded', () => {
  TrackClient.init();
});
