/**
 * HyperTrack Admin Console Dashboard Script
 * Manages fleet tracking, session link generation, and real-time Leaflet overlays.
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

const AdminApp = {
  // Leaflet references
  map: null,
  currentMarker: null,
  accuracyCircle: null,
  trailPolyline: null,
  trailShadowPolyline: null,

  // Selected state
  selectedSessionId: null,
  allTrackers: {},
  activeUnsubscribe: null,

  // UI switches
  isFollowEnabled: true,
  isTrailEnabled: true,

  // Settings elements
  settingsDrawer: null,

  async init() {
    this.settingsDrawer = document.getElementById('settings-drawer');

    // 1. Initialize Fullscreen Leaflet Map
    this.map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([0, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20
    }).addTo(this.map);

    // Zoom Controls to top right
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // 2. Bind Event Handlers
    document.getElementById('btn-generate-link').addEventListener('click', () => this.generateTrackerLink());
    document.getElementById('btn-copy-link').addEventListener('click', () => this.copyGeneratedLink());
    document.getElementById('btn-open-settings').addEventListener('click', () => this.openSettingsDrawer());
    document.getElementById('btn-close-settings').addEventListener('click', () => this.closeSettingsDrawer());
    document.getElementById('btn-save-settings').addEventListener('click', () => this.saveFirebaseCredentials());
    document.getElementById('btn-clear-settings').addEventListener('click', () => this.clearFirebaseCredentials());
    document.getElementById('btn-demo-mode').addEventListener('click', () => this.activateDemoMode());
    document.getElementById('btn-recenter-map').addEventListener('click', () => this.recenterCameraOnSelected());

    // Map controls checkboxes
    document.getElementById('sw-follow').addEventListener('change', (e) => {
      this.isFollowEnabled = e.target.checked;
    });
    document.getElementById('sw-trail').addEventListener('change', (e) => {
      this.isTrailEnabled = e.target.checked;
      this.refreshTrailVisibility();
    });

    // 3. Auto-configure Offline Demo if no keys
    if (!FirebaseHelper.isConfigured()) {
      const demoConfig = {
        apiKey: 'DEMO_MODE',
        projectId: 'demo-mode',
        databaseURL: 'https://demo-mode-rtdb.firebaseio.com/'
      };
      FirebaseHelper.saveConfig(demoConfig);
      console.log('⚡ HYPERTRACK: Auto-activated local Offline Demo mode in Admin Dashboard.');
    }

    // Toggle demo warning banner based on mode
    this.updateDemoWarningVisibility();

    // 4. Initialize Firebase & Listen for Fleet updates
    try {
      await FirebaseHelper.initialize();
      this.startListeningToFleet();
      Toast.show('Linked to active live location feed.', 'success');
    } catch (err) {
      Toast.show(`Firebase Error: ${err.message}`, 'error');
    }
  },

  startListeningToFleet() {
    FirebaseHelper.listenToAllTrackers((snapshot) => {
      const data = snapshot.val();
      this.allTrackers = data || {};
      this.renderFleetSidebar();
      
      // Update selected device coordinate tracking if already selected
      if (this.selectedSessionId && this.allTrackers[this.selectedSessionId]) {
        this.renderTrackerTelemetry(this.allTrackers[this.selectedSessionId]);
      }
    });
  },

  renderFleetSidebar() {
    const container = document.getElementById('fleet-list-container');
    const fleetCount = document.getElementById('fleet-count');
    
    container.innerHTML = '';
    const keys = Object.keys(this.allTrackers);
    fleetCount.innerText = `${keys.length} Active`;

    if (keys.length === 0) {
      container.innerHTML = `
        <div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 20px 0;">
          No generated trackers active. Use the generator above to invite someone!
        </div>
      `;
      return;
    }

    keys.forEach((id) => {
      const tracker = this.allTrackers[id];
      const isSelected = id === this.selectedSessionId;
      
      // Compute status indicator class
      let statusClass = 'status-dot';
      let lockText = 'Offline';
      
      if (tracker.status === 'online') {
        if (tracker.lockType === 'IP') {
          statusClass = 'status-dot warning'; // Orange pulsing IP
          lockText = 'Approx. (IP)';
        } else {
          statusClass = 'status-dot active'; // Green pulsing GPS
          lockText = 'Active (GPS)';
        }
      }

      const item = document.createElement('div');
      item.className = `fleet-item ${isSelected ? 'selected' : ''}`;
      item.innerHTML = `
        <div class="fleet-item-info">
          <span class="fleet-item-name">${id}</span>
          <span class="fleet-item-details">${lockText}</span>
        </div>
        <div class="${statusClass}"></div>
      `;

      item.addEventListener('click', () => this.selectTracker(id));
      container.appendChild(item);
    });
  },

  selectTracker(id) {
    if (this.selectedSessionId === id) return;
    this.selectedSessionId = id;
    
    // Clear existing leaflet marker & trails
    this.clearMapTelemetry();

    // Show telemetry/controls boxes in sidebar
    document.getElementById('telemetry-panel').style.display = 'flex';
    document.getElementById('controls-panel').style.display = 'flex';
    document.getElementById('selected-device-title').innerText = `TELEMETRY: ${id}`;

    // Highlight selected in fleet sidebar list
    this.renderFleetSidebar();

    // Load coordinates immediately
    const tracker = this.allTrackers[id];
    if (tracker) {
      this.renderTrackerTelemetry(tracker);
      
      // Auto-zoom map camera to target position on select
      const latlng = [tracker.latitude, tracker.longitude];
      this.map.setView(latlng, tracker.lockType === 'IP' ? 12 : 16);
    }
  },

  renderTrackerTelemetry(data) {
    const lat = data.latitude;
    const lng = data.longitude;
    const accuracy = data.accuracy || 0;
    const speed = data.speed !== null && data.speed !== undefined ? data.speed : null;
    const status = data.status || 'offline';
    const lastUpdated = data.lastUpdated;
    const lockType = data.lockType || 'GPS';
    
    const latlng = [lat, lng];

    // 1. Update stats elements
    document.getElementById('viewer-lat').innerText = lat.toFixed(6);
    document.getElementById('viewer-lng').innerText = lng.toFixed(6);
    document.getElementById('viewer-accuracy').innerText = Math.round(accuracy);
    
    const speedKmh = speed !== null && speed > 0 ? (speed * 3.6).toFixed(1) : '0.0';
    document.getElementById('viewer-speed').innerText = speedKmh;

    if (lastUpdated) {
      const updateTime = new Date(lastUpdated);
      document.getElementById('viewer-last-updated').innerText = updateTime.toLocaleTimeString();
    }

    const lockLabel = document.getElementById('viewer-lock-type');
    if (lockLabel) {
      if (lockType === 'IP') {
        lockLabel.innerText = 'Approximate (IP)';
        lockLabel.style.color = 'var(--accent-orange)';
      } else {
        lockLabel.innerText = 'High-Accuracy GPS';
        lockLabel.style.color = 'var(--accent-green)';
      }
    }

    // 2. Draw Marker
    const activeColor = lockType === 'IP' ? 'var(--accent-orange)' : 'var(--accent-cyan)';
    const activeShadow = lockType === 'IP' ? '0 0 10px var(--accent-orange)' : 'var(--shadow-neon-cyan)';
    
    const glowingRadarIcon = L.divIcon({
      className: 'radar-marker-div',
      html: `
        <div class="radar-marker">
          <div class="radar-center" style="background-color: ${activeColor}; box-shadow: ${activeShadow};"></div>
          <div class="radar-ring" style="border-color: ${activeColor};"></div>
          <div class="radar-ring-2" style="border-color: ${activeColor};"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    if (this.currentMarker) {
      this.currentMarker.setLatLng(latlng);
      this.currentMarker.setIcon(glowingRadarIcon);
    } else {
      this.currentMarker = L.marker(latlng, { icon: glowingRadarIcon }).addTo(this.map);
    }

    // 3. Draw Accuracy circle
    if (this.accuracyCircle) {
      this.accuracyCircle.setLatLng(latlng);
      this.accuracyCircle.setRadius(accuracy);
      this.accuracyCircle.setStyle({ color: activeColor, fillColor: activeColor });
    } else {
      this.accuracyCircle = L.circle(latlng, {
        radius: accuracy,
        color: activeColor,
        fillColor: activeColor,
        fillOpacity: 0.08,
        weight: 1,
        dashArray: '4, 4'
      }).addTo(this.map);
    }

    // Camera Auto-Pan locks
    if (this.isFollowEnabled) {
      this.map.panTo(latlng);
    }

    // 4. Draw Polyline trails
    const coordsList = [];
    if (data.history) {
      Object.values(data.history).forEach(point => {
        if (point.latitude && point.longitude) {
          coordsList.push([point.latitude, point.longitude]);
        }
      });
    }

    if (coordsList.length > 1 && this.isTrailEnabled) {
      if (this.trailShadowPolyline) {
        this.trailShadowPolyline.setLatLngs(coordsList);
      } else {
        this.trailShadowPolyline = L.polyline(coordsList, {
          color: 'var(--secondary-glow)',
          weight: 7,
          opacity: 0.35,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(this.map);
      }

      if (this.trailPolyline) {
        this.trailPolyline.setLatLngs(coordsList);
      } else {
        this.trailPolyline = L.polyline(coordsList, {
          color: 'var(--accent-purple)',
          weight: 3,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(this.map);
      }
    }
  },

  clearMapTelemetry() {
    if (this.currentMarker) {
      this.map.removeLayer(this.currentMarker);
      this.currentMarker = null;
    }
    if (this.accuracyCircle) {
      this.map.removeLayer(this.accuracyCircle);
      this.accuracyCircle = null;
    }
    if (this.trailPolyline) {
      this.map.removeLayer(this.trailPolyline);
      this.trailPolyline = null;
    }
    if (this.trailShadowPolyline) {
      this.map.removeLayer(this.trailShadowPolyline);
      this.trailShadowPolyline = null;
    }
  },

  refreshTrailVisibility() {
    if (!this.isTrailEnabled) {
      if (this.trailPolyline) this.map.removeLayer(this.trailPolyline);
      if (this.trailShadowPolyline) this.map.removeLayer(this.trailShadowPolyline);
      this.trailPolyline = null;
      this.trailShadowPolyline = null;
    } else if (this.selectedSessionId && this.allTrackers[this.selectedSessionId]) {
      this.renderTrackerTelemetry(this.allTrackers[this.selectedSessionId]);
    }
  },

  recenterCameraOnSelected() {
    if (this.selectedSessionId && this.allTrackers[this.selectedSessionId]) {
      const tracker = this.allTrackers[this.selectedSessionId];
      const latlng = [tracker.latitude, tracker.longitude];
      this.map.setView(latlng, tracker.lockType === 'IP' ? 13 : 17);
    }
  },

  generateTrackerLink() {
    const adjectives = ['swift', 'hyper', 'crypto', 'apex', 'delta', 'alpha'];
    const nouns = ['panther', 'falcon', 'ghost', 'runner', 'scout', 'ninja'];
    const randAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randNum = Math.floor(Math.random() * 90) + 10;
    const generatedId = `${randAdj}-${randNoun}-${randNum}`;

    // Construct url string pointing to mobile client page
    let trackerUrl = `${window.location.protocol}//${window.location.host}/track.html?id=${generatedId}`;
    
    // Append Firebase credentials if active (not DEMO_MODE) so client can connect
    const config = FirebaseHelper.getConfig();
    if (config && config.apiKey !== 'DEMO_MODE') {
      trackerUrl += `&fbProject=${encodeURIComponent(config.projectId)}&fbKey=${encodeURIComponent(config.apiKey)}&fbDb=${encodeURIComponent(config.databaseURL)}`;
    }
    
    document.getElementById('generated-link').value = trackerUrl;
    document.getElementById('link-box-wrapper').style.display = 'flex';

    // Push starting placeholder node to Firebase so it instantly displays in the Admin's list!
    FirebaseHelper.updateLocation(generatedId, {
      latitude: 0,
      longitude: 0,
      accuracy: 0,
      speed: 0,
      lockType: 'IP',
      status: 'offline' // Starts idle until the user opens the link!
    });

    Toast.show(`New Tracker Session Generated!`, 'success');
  },

  copyGeneratedLink() {
    const linkInput = document.getElementById('generated-link');
    linkInput.select();
    linkInput.setSelectionRange(0, 99999);
    
    navigator.clipboard.writeText(linkInput.value).then(() => {
      Toast.show('Shareable tracker link copied to clipboard!', 'success');
    }).catch(err => {
      Toast.show('Failed to copy. Please manually copy input text.', 'error');
    });
  },

  openSettingsDrawer() {
    this.settingsDrawer.classList.add('open');
    const config = FirebaseHelper.getConfig();
    if (config) {
      document.getElementById('fb-project-id').value = config.projectId || '';
      document.getElementById('fb-api-key').value = config.apiKey || '';
      document.getElementById('fb-db-url').value = config.databaseURL || '';
    }
  },

  closeSettingsDrawer() {
    this.settingsDrawer.classList.remove('open');
  },

  updateDemoWarningVisibility() {
    const banner = document.getElementById('demo-warning-banner');
    if (banner) {
      const config = FirebaseHelper.getConfig();
      if (config && config.apiKey === 'DEMO_MODE') {
        banner.style.display = 'block';
      } else {
        banner.style.display = 'none';
      }
    }
  },

  async saveFirebaseCredentials() {
    const projectId = document.getElementById('fb-project-id').value.trim();
    const apiKey = document.getElementById('fb-api-key').value.trim();
    const databaseURL = document.getElementById('fb-db-url').value.trim();

    if (!projectId || !apiKey || !databaseURL) {
      Toast.show('All fields are required.', 'error');
      return;
    }

    const config = { projectId, apiKey, databaseURL };
    const saved = FirebaseHelper.saveConfig(config);

    if (saved) {
      Toast.show('Credentials stored locally.', 'success');
      this.closeSettingsDrawer();
      this.updateDemoWarningVisibility();
      
      // Reload Firebase instance
      FirebaseHelper.isInitialized = false;
      try {
        await FirebaseHelper.initialize();
        this.startListeningToFleet();
        Toast.show('Firebase Database synced successfully!', 'success');
      } catch (err) {
        Toast.show(`Setup Error: ${err.message}`, 'error');
      }
    } else {
      Toast.show('Failed to store credentials.', 'error');
    }
  },

  clearFirebaseCredentials() {
    FirebaseHelper.clearConfig();
    Toast.show('Credentials cleared.', 'warning');
    
    // Pre-populate with offline demo mode automatically so it does not crash
    const demoConfig = {
      apiKey: 'DEMO_MODE',
      projectId: 'demo-mode',
      databaseURL: 'https://demo-mode-rtdb.firebaseio.com/'
    };
    FirebaseHelper.saveConfig(demoConfig);

    document.getElementById('fb-project-id').value = '';
    document.getElementById('fb-api-key').value = '';
    document.getElementById('fb-db-url').value = '';
    
    this.updateDemoWarningVisibility();
    FirebaseHelper.isInitialized = false;
    this.startListeningToFleet();
  },

  async activateDemoMode() {
    const demoConfig = {
      apiKey: 'DEMO_MODE',
      projectId: 'demo-mode',
      databaseURL: 'https://demo-mode-rtdb.firebaseio.com/'
    };

    FirebaseHelper.clearConfig();
    const saved = FirebaseHelper.saveConfig(demoConfig);

    if (saved) {
      Toast.show('⚡ Offline Demo Mode Activated!', 'success');
      this.closeSettingsDrawer();
      this.updateDemoWarningVisibility();
      
      FirebaseHelper.isInitialized = false;
      try {
        await FirebaseHelper.initialize();
        this.startListeningToFleet();
      } catch (err) {
        console.error(err);
      }
    }
  }
};

// Initialize Admin App when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  AdminApp.init();
});
