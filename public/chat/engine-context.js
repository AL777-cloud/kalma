/* Kálma Player — Context Engine
   Reads environmental signals: time, weather, season, movement, holidays */

class KalmaContext {
  constructor() {
    this.state = {
      timeOfDay: 'afternoon',
      weather: 'clear',
      season: 'spring',
      movement: 'still',
      holiday: null,
      temp: 25,
      lat: null,
      lon: null,
      hemisphere: 'north'
    };
    this._motionSamples = [];
    this._motionHandler = null;
    this._weatherTimer = null;
    this._listeners = [];
    this._prevStateKey = '';
  }

  /* ── Start continuous sensing ── */
  start() {
    this._updateTime();
    this._updateSeason();
    this._updateHoliday();
    this._requestLocation();
    this._startMotion();

    // Re-check time every 60s
    setInterval(() => {
      this._updateTime();
      this._updateSeason();
      this._updateHoliday();
      this._emitIfChanged();
    }, 60000);
  }

  onChange(fn) { this._listeners.push(fn); }

  _emit() { this._listeners.forEach(fn => fn(this.state)); }
  _emitIfChanged() {
    const key = JSON.stringify(this.state);
    if (key !== this._prevStateKey) {
      this._prevStateKey = key;
      this._emit();
    }
  }

  /* ── Time of Day ── */
  _updateTime() {
    const h = new Date().getHours();
    let tod;
    if (h >= 5 && h < 9) tod = 'morning';
    else if (h >= 9 && h < 12) tod = 'lateMorning';
    else if (h >= 12 && h < 17) tod = 'afternoon';
    else if (h >= 17 && h < 20) tod = 'evening';
    else if (h >= 20 && h < 23) tod = 'night';
    else tod = 'lateNight';

    if (tod !== this.state.timeOfDay) {
      this.state.timeOfDay = tod;
    }
  }

  /* ── Season (from date + hemisphere) ── */
  _updateSeason() {
    const m = new Date().getMonth(); // 0-11
    let season;
    if (m >= 2 && m <= 4) season = 'spring';
    else if (m >= 5 && m <= 7) season = 'summer';
    else if (m >= 8 && m <= 10) season = 'autumn';
    else season = 'winter';

    // Flip for southern hemisphere
    if (this.state.hemisphere === 'south') {
      const flip = { spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' };
      season = flip[season];
    }
    this.state.season = season;
  }

  /* ── Holidays ── */
  _updateHoliday() {
    const now = new Date();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    let holiday = null;

    // Major holidays (expand as needed)
    if (m === 12 && d >= 20 && d <= 31) holiday = 'christmas';
    else if (m === 1 && d <= 2) holiday = 'newYear';
    else if (m === 10 && d >= 28 && d <= 31) holiday = 'halloween';
    else if (m === 2 && d === 14) holiday = 'valentines';
    else if (m === 11 && d >= 20 && d <= 28) holiday = 'thanksgiving'; // approximate

    this.state.holiday = holiday;
  }

  /* ── Location + Weather ── */
  _requestLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        this.state.lat = pos.coords.latitude;
        this.state.lon = pos.coords.longitude;
        this.state.hemisphere = pos.coords.latitude >= 0 ? 'north' : 'south';
        this._updateSeason();
        this._fetchWeather();
        // Re-fetch weather every 15 minutes
        this._weatherTimer = setInterval(() => this._fetchWeather(), 15 * 60 * 1000);
      },
      () => {
        console.log('[Kálma Context] Location denied — using defaults');
        this._emitIfChanged();
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  }

  async _fetchWeather() {
    if (!this.state.lat || !this.state.lon) return;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${this.state.lat}&longitude=${this.state.lon}&current=temperature_2m,weather_code&timezone=auto`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.current) {
        this.state.temp = data.current.temperature_2m || 25;
        this.state.weather = this._weatherCodeToName(data.current.weather_code);
        this._emitIfChanged();
      }
    } catch (e) {
      console.warn('[Kálma Context] Weather fetch failed:', e.message);
    }
  }

  _weatherCodeToName(code) {
    // WMO Weather interpretation codes
    if (code === 0 || code === 1) return 'clear';
    if (code === 2 || code === 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 67) return 'rain';
    if (code >= 71 && code <= 77) return 'snow';
    if (code >= 80 && code <= 82) return 'rain';
    if (code >= 85 && code <= 86) return 'snow';
    if (code >= 95 && code <= 99) return 'storm';
    return 'clear';
  }

  /* ── Movement Detection ── */
  _startMotion() {
    if (!window.DeviceMotionEvent) return;

    // iOS 13+ requires permission
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      // Will request on first user gesture — store for later
      this._needsMotionPermission = true;
      return;
    }

    this._listenMotion();
  }

  requestMotionPermission() {
    if (!this._needsMotionPermission) return Promise.resolve(true);
    return DeviceMotionEvent.requestPermission().then(result => {
      if (result === 'granted') {
        this._needsMotionPermission = false;
        this._listenMotion();
        return true;
      }
      return false;
    }).catch(() => false);
  }

  _listenMotion() {
    this._motionHandler = (e) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      this._motionSamples.push(mag);
      if (this._motionSamples.length > 90) this._motionSamples.shift();
    };
    window.addEventListener('devicemotion', this._motionHandler);

    // Analyze motion every 3s — responsive to movement
    setInterval(() => this._analyzeMotion(), 3000);
  }

  _analyzeMotion() {
    if (this._motionSamples.length < 3) return;
    const avg = this._motionSamples.reduce((a, b) => a + b, 0) / this._motionSamples.length;
    // Gravity is ~9.8, walking adds variance
    const variance = this._motionSamples.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / this._motionSamples.length;

    // More sensitive thresholds — detect subtle movement early
    let movement;
    if (variance < 0.2) movement = 'still';
    else if (variance < 2.5) movement = 'walking';
    else movement = 'active';

    // Directional detection: track axis bias for "neutral movement" shimmer
    if (this._motionSamples.length >= 5) {
      const recent = this._motionSamples.slice(-5);
      const deltaAvg = recent.reduce((s, v, i) => i > 0 ? s + Math.abs(v - recent[i-1]) : s, 0) / (recent.length - 1);
      // Even tiny shifts (phone tilts, gentle sway) should register
      if (variance >= 0.08 && variance < 0.2 && deltaAvg > 0.05) {
        movement = 'neutral';  // subtle motion — triggers shimmer/modulation
      }
    }

    if (movement !== this.state.movement) {
      this.state.movement = movement;
      this._emitIfChanged();
    }
  }

  /* ── Cleanup ── */
  stop() {
    if (this._motionHandler) {
      window.removeEventListener('devicemotion', this._motionHandler);
    }
    if (this._weatherTimer) clearInterval(this._weatherTimer);
  }
}
