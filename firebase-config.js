/**
 * Firebase Realtime Database & Offline Demo Synchronizer
 * Manages dynamically saving, loading, and initializing Firebase credentials or Offline Demo channel.
 */

class FirebaseHelperClass {
  constructor() {
    this.STORAGE_KEY = 'livetracker_firebase_config';
    this.db = null;
    this.isInitialized = false;
    this.isDemoMode = false;
    
    // BroadcastChannel for offline inter-tab communication
    this.demoChannel = null;
  }

  /**
   * Retrieves the saved configuration from LocalStorage
   * @returns {Object|null}
   */
  getConfig() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Failed to parse Firebase config from localStorage:', e);
      return null;
    }
  }

  /**
   * Saves the configuration to LocalStorage
   * @param {Object} config 
   * @returns {boolean}
   */
  saveConfig(config) {
    if (!config || !config.databaseURL || !config.apiKey || !config.projectId) {
      return false;
    }
    
    const cleanedConfig = {
      apiKey: config.apiKey.trim(),
      authDomain: config.authDomain ? config.authDomain.trim() : `${config.projectId.trim()}.firebaseapp.com`,
      databaseURL: config.databaseURL.trim(),
      projectId: config.projectId.trim(),
      storageBucket: config.storageBucket ? config.storageBucket.trim() : `${config.projectId.trim()}.appspot.com`,
      messagingSenderId: config.messagingSenderId ? config.messagingSenderId.trim() : '',
      appId: config.appId ? config.appId.trim() : ''
    };

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cleanedConfig));
      return true;
    } catch (e) {
      console.error('Failed to write Firebase config to localStorage:', e);
      return false;
    }
  }

  /**
   * Clears the saved configuration
   */
  clearConfig() {
    localStorage.removeItem(this.STORAGE_KEY);
    this.db = null;
    this.isInitialized = false;
    this.isDemoMode = false;
    if (this.demoChannel) {
      this.demoChannel.close();
      this.demoChannel = null;
    }
  }

  /**
   * Checks if credentials are configured
   * @returns {boolean}
   */
  isConfigured() {
    const config = this.getConfig();
    return !!(config && config.databaseURL && config.apiKey && config.projectId);
  }

  /**
   * Initializes standard Firebase Compat Database or offline mock systems.
   * @returns {Promise<boolean>}
   */
  async initialize() {
    if (this.isInitialized) return true;

    const config = this.getConfig();
    if (!config) {
      console.warn('Firebase cannot initialize: No config found in localStorage.');
      return false;
    }

    // 1. INTERCEPT FOR OFFLINE DEMO MODE
    if (config.apiKey === 'DEMO_MODE') {
      console.log('⚡ HYPERTRACK: Running in Local Offline Demo Mode');
      this.isDemoMode = true;
      this.isInitialized = true;
      this.demoChannel = new BroadcastChannel('hypertrack_offline_demo_sync');
      return true;
    }

    // 2. STANDARD FIREBASE WORKFLOW
    try {
      await this._ensureFirebaseScriptsLoaded();

      if (firebase.apps.length) {
        await firebase.app().delete();
      }
      
      firebase.initializeApp(config);

      this.db = firebase.database();
      this.isDemoMode = false;
      this.isInitialized = true;
      console.log('Firebase Realtime Database successfully initialized.');
      return true;
    } catch (error) {
      console.error('Firebase initialization failed:', error);
      throw error;
    }
  }

  /**
   * Guarantees Firebase Script CDNs are active.
   * @private
   */
  _ensureFirebaseScriptsLoaded() {
    return new Promise((resolve, reject) => {
      if (typeof firebase !== 'undefined') {
        resolve();
        return;
      }

      const appScript = document.createElement('script');
      appScript.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js';
      appScript.async = true;
      appScript.onload = () => {
        const dbScript = document.createElement('script');
        dbScript.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database-compat.js';
        dbScript.async = true;
        dbScript.onload = () => {
          resolve();
        };
        dbScript.onerror = () => reject(new Error('Failed loading Firebase Database script.'));
        document.head.appendChild(dbScript);
      };
      appScript.onerror = () => reject(new Error('Failed loading Firebase App script.'));
      document.head.appendChild(appScript);
    });
  }

  /**
   * Syncs active coordinates to Realtime Database or locally via BroadcastChannel
   * @param {string} sessionId 
   * @param {Object} data Coordinates object
   */
  async updateLocation(sessionId, data) {
    if (!this.isInitialized) await this.initialize();

    // DEMO INTERCEPT
    if (this.isDemoMode) {
      const timestamp = Date.now();
      const mockPayload = {
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy || 10,
        altitude: data.altitude !== undefined ? data.altitude : null,
        speed: data.speed !== undefined ? data.speed : null,
        heading: data.heading !== undefined ? data.heading : null,
        lockType: data.lockType || 'GPS',
        lastUpdated: timestamp,
        status: 'online'
      };

      // Persist in localStorage to act as database persistence
      localStorage.setItem(`demo_db_node_${sessionId}`, JSON.stringify(mockPayload));

      // Append to history
      const historyKey = `demo_db_history_${sessionId}`;
      const existingHistory = JSON.parse(localStorage.getItem(historyKey) || '[]');
      existingHistory.push({
        latitude: data.latitude,
        longitude: data.longitude,
        timestamp: timestamp
      });
      localStorage.setItem(historyKey, JSON.stringify(existingHistory));

      // Convert history list to indexed map object to match Firebase snapshot properties
      const historyObj = {};
      existingHistory.forEach((pt, index) => {
        historyObj[`mock_push_key_${index}`] = pt;
      });

      const fullMockSnapshot = {
        ...mockPayload,
        history: historyObj
      };

      // Broadcast coordinate change across all windows/tabs
      if (this.demoChannel) {
        this.demoChannel.postMessage({
          sessionId: sessionId,
          value: fullMockSnapshot
        });
      }
      return;
    }

    // STANDARD FIREBASE
    if (!this.db) throw new Error('Database is not initialized.');

    const trackerRef = this.db.ref(`trackers/${sessionId}`);
    await trackerRef.update({
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy || 0,
      altitude: data.altitude !== null ? data.altitude : null,
      speed: data.speed !== null ? data.speed : null,
      heading: data.heading !== null ? data.heading : null,
      lockType: data.lockType || 'GPS',
      lastUpdated: firebase.database.ServerValue.TIMESTAMP,
      status: 'online'
    });

    const historyRef = this.db.ref(`trackers/${sessionId}/history`).push();
    await historyRef.set({
      latitude: data.latitude,
      longitude: data.longitude,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  }

  /**
   * Suspends connection node
   * @param {string} sessionId 
   */
  async setOffline(sessionId) {
    if (!this.isInitialized) return;

    if (this.isDemoMode) {
      const nodeKey = `demo_db_node_${sessionId}`;
      const raw = localStorage.getItem(nodeKey);
      if (raw) {
        const payload = JSON.parse(raw);
        payload.status = 'offline';
        payload.lastUpdated = Date.now();
        localStorage.setItem(nodeKey, JSON.stringify(payload));

        const historyKey = `demo_db_history_${sessionId}`;
        const existingHistory = JSON.parse(localStorage.getItem(historyKey) || '[]');
        const historyObj = {};
        existingHistory.forEach((pt, idx) => {
          historyObj[`mock_push_key_${idx}`] = pt;
        });

        const fullMockSnapshot = {
          ...payload,
          history: historyObj
        };

        if (this.demoChannel) {
          this.demoChannel.postMessage({
            sessionId: sessionId,
            value: fullMockSnapshot
          });
        }
      }
      return;
    }

    try {
      if (this.db) {
        await this.db.ref(`trackers/${sessionId}`).update({
          status: 'offline',
          lastUpdated: firebase.database.ServerValue.TIMESTAMP
        });
      }
    } catch (e) {
      console.warn('Error saving offline status:', e);
    }
  }

  /**
   * Registers a callback listener to sync live telemetry
   * @param {string} sessionId 
   * @param {Function} callback 
   * @returns {Function} Unsubscribe method
   */
  listenToLocation(sessionId, callback) {
    if (this.isDemoMode) {
      const listenerChannel = new BroadcastChannel('hypertrack_offline_demo_sync');
      
      const channelHandler = (event) => {
        if (event.data && event.data.sessionId === sessionId) {
          // Construct Firebase style snapshot API interface
          callback({
            val: () => event.data.value
          });
        }
      };

      listenerChannel.addEventListener('message', channelHandler);

      // Instantly load current stored coords if already cached
      const cacheNode = localStorage.getItem(`demo_db_node_${sessionId}`);
      if (cacheNode) {
        const payload = JSON.parse(cacheNode);
        const historyList = JSON.parse(localStorage.getItem(`demo_db_history_${sessionId}`) || '[]');
        const historyObj = {};
        historyList.forEach((pt, idx) => {
          historyObj[`mock_push_key_${idx}`] = pt;
        });

        setTimeout(() => {
          callback({
            val: () => ({
              ...payload,
              history: historyObj
            })
          });
        }, 50);
      }

      return () => {
        listenerChannel.removeEventListener('message', channelHandler);
        listenerChannel.close();
      };
    }

    if (!this.db) throw new Error('Database is not initialized.');

    const ref = this.db.ref(`trackers/${sessionId}`);
    ref.on('value', callback);

    return () => ref.off('value', callback);
  }

  /**
   * Listen to all active trackers (Admin List hook)
   */
  listenToAllTrackers(callback) {
    if (this.isDemoMode) {
      const listenerChannel = new BroadcastChannel('hypertrack_offline_demo_sync');
      
      const channelHandler = (event) => {
        if (event.data && event.data.sessionId) {
          const allTrackers = this.getDemoTrackersList();
          callback({
            val: () => allTrackers
          });
        }
      };

      listenerChannel.addEventListener('message', channelHandler);

      // Instantly load current stored coords if already cached
      setTimeout(() => {
        const allTrackers = this.getDemoTrackersList();
        callback({
          val: () => allTrackers
        });
      }, 50);

      return () => {
        listenerChannel.removeEventListener('message', channelHandler);
        listenerChannel.close();
      };
    }

    if (!this.db) throw new Error('Database is not initialized.');

    const ref = this.db.ref('trackers');
    ref.on('value', callback);

    return () => ref.off('value', callback);
  }

  /**
   * Helper to retrieve all active demo session nodes from localStorage
   */
  getDemoTrackersList() {
    const list = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('demo_db_node_')) {
        const sessionId = key.substring('demo_db_node_'.length);
        const node = JSON.parse(localStorage.getItem(key));
        
        const historyList = JSON.parse(localStorage.getItem(`demo_db_history_${sessionId}`) || '[]');
        const historyObj = {};
        historyList.forEach((pt, idx) => {
          historyObj[`mock_push_key_${idx}`] = pt;
        });

        list[sessionId] = {
          ...node,
          history: historyObj
        };
      }
    }
    return list;
  }
}

const FirebaseHelper = new FirebaseHelperClass();
