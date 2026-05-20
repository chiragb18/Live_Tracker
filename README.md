# 🛰️ HyperTrack: Admin-First Fleet Tracking Console & Client Dashboard

HyperTrack is a premium, high-performance, real-time live location tracking web application designed with a futuristic dark dashboard theme, interactive map telemetry, and glowing radar pings. It is completely serverless, utilizing a free **Firebase Realtime Database** for instant syncing and **Leaflet.js** + **OpenStreetMap (via CartoDB)** for beautiful, responsive mapping controls with **zero paid services** or API limits.

It features an **Admin-First Workflow** designed for live multi-session tracking:
1. **The Admin Console (`admin.html`):** A central master panel where a single admin can generate trackable URLs, copy them, and monitor all active/offline devices live on a Leaflet map with a detailed sidebar list.
2. **The Frictionless Broadcaster (`track.html`):** The client page opened by the target user. Tracking **starts automatically on load** (using the session ID from the URL query), captures network IP coordinates instantly (Zero-Permission Fallback), watches GPS positions in the background, and gives the user a prominent **"Stop Sharing"** button to guarantee their privacy.

---

## 🌟 Premium Features

- **Centralized Link Generation:** Click a single button to generate secure, human-friendly tracker links (e.g., `track.html?id=active-scout-32`) pointing directly to your server.
- **Multi-Agent Sidebar:** Subscribes to the fleet list in real time. Displays active devices, their speeds, and lock types (GPS vs IP fallback) in a beautiful glowing list.
- **Zero-Permission IP Fallback:** Users opening the tracking link will show up on your map **instantly without any permission prompts** using approximate network IP geolocation. The system then requests GPS in the background and upgrades smoothly to high-accuracy street tracking once allowed!
- **Glowing Radar Pin Markers:** Custom HTML/CSS Map DivIcons render tracked users as high-contrast glowing radar dots with concentric pulsing expansion rings.
- **Glowing Movement Trails:** Automatically draws a glowing purple-and-cyan pathway showing the exact chronological movement history of selected devices.
- **Self-Contained Client Config:** A visual **Firebase Drawer** built directly into the UI saves database API credentials in browser `localStorage`, making the app completely modular and immediately deployable without hardcoded backend configs.

---

## 📂 Project Architecture

```bash
d:\LiveTracker\
├── admin.html          # Central Admin Console Panel (Master Map Dashboard)
├── admin.js            # Fleet list synchronization, link generator & active Leaflet controllers
├── track.html          # Frictionless Client Auto-Broadcaster (Mobile-Optimized User page)
├── track.js            # Auto-broadcasting coordinate generator (IP fallback & GPS watch position)
├── firebase-config.js  # Dynamically loads Google CDN scripts & manages multi-session database list hooks
└── styles.css          # Design System, Glassmorphic components & Radar pulse animations
```

---

## ⚡ Quick Start & Local Testing

The application has a built-in **Zero-Setup Offline Demo Mode** which simulates Firebase Realtime Database using the browser's built-in `BroadcastChannel` API and `localStorage`. This allows you to run and verify the entire live-tracker locally in 10 seconds without making a Firebase account!

### Step 1: Start the Local Web Server
Open a terminal (PowerShell or command prompt) inside your project directory and run:
```powershell
# Navigate to workspace
cd d:\LiveTracker

# Launch Python server on port 8080
python -m http.server 8080
```

### Step 2: Open the Admin Console
Open your web browser and navigate to:
👉 **`http://localhost:8080/admin.html`**

### Step 3: Generate a Tracking Link
1. Click the glowing purple **`⚡ Generate Tracker Link`** button.
2. A unique tracking URL (such as `http://localhost:8080/track.html?id=active-scout-32`) will instantly generate.
3. Click the **Copy Icon** next to the text box to copy the link.

### Step 4: Open the Broadcaster Client
1. Open a **new tab or browser window** (you can even open it on your mobile phone if it is connected to the same Wi-Fi!).
2. Paste and open the generated link.
3. **Frictionless Auto-Start:** The page will immediately load, read the tracker ID from the URL, and start broadcasting! 
   * It fetches the **Zero-Permission IP location** in under 200ms and streams it.
   * At the same time, it prompts for browser GPS permission. Click **Allow** to upgrade to high-accuracy GPS tracking, or click **Block** to continue streaming approximate city-level IP coordinates flawlessly!

### Step 5: Live Real-Time Fleet Tracking!
1. Go back to your **Admin Console** tab.
2. Under the **"ACTIVE FLEET"** sidebar, you will instantly see your new generated ID pop up in the list showing **`Active (GPS)`** or **`Approx. (IP)`**!
3. **Click on the tracker row** inside the fleet list to zoom and lock the camera on the target, view stats, and watch their glowing historical trail update in real time!

---

## 🔥 Free 2-Minute Firebase Setup Guide

Since the application utilizes a serverless real-time web sync, it requires a Firebase Realtime Database. Setting it up is **100% free** and takes less than 2 minutes:

### Step 1: Create a Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add Project** (or **Create a project**).
3. Enter a name (e.g., `HyperTrack`), click **Continue**, disable Google Analytics (optional, to speed up setup), and click **Create Project**.

### Step 2: Establish the Realtime Database
1. In the left sidebar of your new dashboard, expand **Build** and select **Realtime Database**.
2. Click **Create Database**.
3. Choose **Start in test mode** (this configures the database rules to be open, allowing your HTML page to read/write location telemetry without custom login scripts).
4. Click **Enable**.

Ensure your rules under the **Rules** tab look exactly like this:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

### Step 3: Register a Web App and Copy Credentials
1. Go back to your Firebase **Project Overview** (click the gear icon in the top-left sidebar &rarr; **Project settings**).
2. Scroll down to the **Your apps** card at the bottom, and click the Web icon (represented by the **`</>`** code symbol).
3. Enter a nickname for your app (e.g., `LiveTracker Web App`) and click **Register app**.
4. Firebase will display your Web App Config script. Copy the following three properties from the configuration block:
   - `apiKey`
   - `projectId`
   - `databaseURL`

### Step 4: Link Admin Console to Firebase
1. Open **[admin.html](file:///d:/LiveTracker/admin.html)** in a browser tab.
2. Click the **Firebase Setup** button (represented by a gear/setting button in the dashboard).
3. Paste your copied `Project ID`, `API Key`, and `Database URL` into the form fields, then click **Save Credentials**.
4. Close the drawer. Your Admin Console is now connected to the real Firebase database cloud! Share generated links to track devices anywhere in the world!

