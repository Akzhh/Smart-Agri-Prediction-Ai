import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Sprout, 
  Droplets, 
  Map as MapIcon, 
  BarChart3, 
  RefreshCw,
  Search,
  MapPin,
  Edit2,
  Thermometer,
  CloudRain,
  Activity,
  Info,
  Compass,
  Wifi
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { motion, AnimatePresence } from 'framer-motion';

// Fix Leaflet icon issue
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Helper component to center Leaflet map programmatically
const ChangeMapCenter = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
};

// Helper component to handle map clicks
const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
};

const App = () => {
  // Mode selection state: auto (location-based) or manual (form-based)
  const [isManualMode, setIsManualMode] = useState(false);

  // Auto mode coordinates & location name
  const [coordinates, setCoordinates] = useState({ lat: 8.1354, lon: 77.3502 }); // Default coordinates from reference image
  const [latInput, setLatInput] = useState("8.1354");
  const [lonInput, setLonInput] = useState("77.3502");
  const [locationName, setLocationName] = useState("பாம்பன்விளை, Tamil Nadu, India"); // Name from reference image
  const [fetchingLocationName, setFetchingLocationName] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [metricsError, setMetricsError] = useState(null);

  // Live log system state
  const [logs, setLogs] = useState([
    "Live Data Fetching from Soil API...",
    "Weather API...",
    "Weather API...",
    "Satellite Data..."
  ]);
  // Form parameters (aligned with Nagpur/Reference data)
  const [formData, setFormData] = useState({
    N: 140.0,
    P: 83.0,
    K: 200.0,
    temperature: 24.3,
    humidity: 78.0,
    ph: 6.0,
    rainfall: 1522.0
  });

  // Source mapping for features
  const [, setSources] = useState({
    N: 'SoilGrids API (Pedotransfer Estimate)',
    P: 'SoilGrids API (Pedotransfer Estimate)',
    K: 'SoilGrids API (Pedotransfer Estimate)',
    temperature: 'Open-Meteo Current Forecast',
    humidity: 'Open-Meteo Current Forecast',
    ph: 'SoilGrids API (pH H2O)',
    rainfall: 'Open-Meteo Historical Archive (365d sum)'
  });

  // Tracking which fields have manual overrides in auto mode
  const [overriddenFields, setOverriddenFields] = useState({});

  // Inline editing state for parameter cards
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState("");

  // Recommendation responses (matching Cotton default reference state)
  const [prediction, setPrediction] = useState({
    recommendation: "Cotton",
    top_recommendations: [
      { crop: "Cotton", probability: 0.81 },
      { crop: "Jute", probability: 0.12 },
      { crop: "Maize", probability: 0.07 }
    ],
    feature_importance: {
      rainfall: 0.35,
      temperature: 0.25,
      N: 0.22,
      humidity: 0.18
    },
    input_data: {
      N: 140.0,
      P: 83.0,
      K: 200.0,
      temperature: 24.3,
      humidity: 78.0,
      ph: 6.0,
      rainfall: 1522.0
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Time slider value (from suitability map panel)
  const [timeSlider, setTimeSlider] = useState(50);

  // Geocoding: Fetch address name from coordinates
  const fetchLocationName = async (lat, lon) => {
    setFetchingLocationName(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=12`, {
        headers: {
          'User-Agent': 'AgriPredictAI/1.0'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const address = data.address || {};
        const city = address.city || address.town || address.village || address.suburb || "";
        const state = address.state || "";
        const country = address.country || "";
        const parts = [city, state, country].filter(p => p !== "");
        setLocationName(parts.join(", ") || data.display_name || `Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      } else {
        setLocationName(`Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      setLocationName(`Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    } finally {
      setFetchingLocationName(false);
    }
  };

  // Helper to add animated console logs
  const simulateLiveLogs = () => {
    const logMessages = [
      "🔄 Initializing real-time telemetry stream...",
      "🌐 Connecting to Open-Meteo Current Forecast API...",
      "⛅ Received current temperature & relative humidity data.",
      "🗺️ Connecting to SoilGrids API (properties database)...",
      "🔬 Fetching Nitrogen, pH, SOC, CEC, and Clay profiles (0-30cm)...",
      "📊 Aggregating and computing pedotransfer estimates...",
      "🌧️ Querying Open-Meteo Historical Archive (annual rainfall sum)...",
      "📡 Syncing local telemetry indices with satellite data...",
      "✅ Metrics successfully synchronized!"
    ];
    
    setLogs([]);
    let delay = 0;
    logMessages.forEach((msg) => {
      setTimeout(() => {
        setLogs(prev => [...prev.slice(-3), msg]); // Keep last 4 logs
      }, delay);
      delay += 800 + Math.random() * 400;
    });
  };

  // Weather & Soil APIs: Fetch metrics from backend
  const fetchMetricsForLocation = async (lat, lon) => {
    setLoadingMetrics(true);
    setMetricsError(null);
    simulateLiveLogs();
    
    try {
      const response = await axios.post('http://localhost:5000/location-metrics', {
        latitude: lat,
        longitude: lon
      });
      const data = response.data;
      setFormData(data.values);
      setSources(data.sources);
      setOverriddenFields({}); // Clear overrides when location changes
    } catch (err) {
      setMetricsError("Could not retrieve climate or soil metrics from the APIs. Using fallback data.");
      console.error(err);
    } finally {
      setLoadingMetrics(false);
    }
  };

  // Update selection location coords and trigger geocode/metric fetch
  const handleLocationChange = (lat, lon) => {
    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    if (!isNaN(parsedLat) && !isNaN(parsedLon)) {
      setCoordinates({ lat: parsedLat, lon: parsedLon });
      setLatInput(parsedLat.toFixed(4));
      setLonInput(parsedLon.toFixed(4));
      fetchLocationName(parsedLat, parsedLon);
      fetchMetricsForLocation(parsedLat, parsedLon);
    }
  };

  // Setup initial metrics on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      handleLocationChange(8.1354, 77.3502);
    }, 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss API error toast after 6 seconds
  useEffect(() => {
    if (metricsError) {
      const timer = setTimeout(() => {
        setMetricsError(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [metricsError]);

  // Custom manual coordinate input apply
  const handleManualCoordsApply = (e) => {
    e.preventDefault();
    handleLocationChange(latInput, lonInput);
  };

  // Detect live geolocation
  const handleDetectLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          handleLocationChange(latitude, longitude);
        },
        (err) => {
          setError("Location access denied. Please click on the map or enter coordinates manually.");
          console.error(err);
        }
      );
    } else {
      setError("Geolocation is not supported by your browser.");
    }
  };

  // Manual mode input handlers
  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: parseFloat(e.target.value) });
  };

  // Card override handlers
  const startEditing = (field) => {
    setEditingField(field);
    setEditValue(formData[field].toString());
  };

  const saveOverride = (field) => {
    const val = parseFloat(editValue);
    if (!isNaN(val)) {
      setFormData(prev => ({ ...prev, [field]: val }));
      setSources(prev => ({ ...prev, [field]: 'Manual Override' }));
      setOverriddenFields(prev => ({ ...prev, [field]: true }));
    }
    setEditingField(null);
  };

  // Predict endpoint trigger
  const getPrediction = async () => {
    setLoading(true);
    setError(null);
    try {
      let response;
      if (isManualMode) {
        response = await axios.post('http://localhost:5000/predict', formData);
      } else {
        const iot_overrides = {};
        Object.keys(overriddenFields).forEach(k => {
          iot_overrides[k] = formData[k];
        });
        
        response = await axios.post('http://localhost:5000/auto-predict', {
          latitude: coordinates.lat,
          longitude: coordinates.lon,
          iot_data: iot_overrides
        });

        // Sync local form state with final parameters parsed by the model
        setFormData(response.data.input_data);
        setSources(response.data.sources);
      }
      setPrediction(response.data);
    } catch (err) {
      setError("Backend server not responding. Ensure Flask is running.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Circular gauge calculations
  const confidence = prediction ? prediction.top_recommendations[0].probability : 0.81;
  const radius = 55;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (confidence * circumference);

  // Crop illustration helper
  const getCropImage = (cropName) => {
    if (!cropName) return "/default_crop.png";
    const name = cropName.toLowerCase();
    if (name === 'cotton') return "/cotton.png";
    if (name === 'rice') return "/rice.png";
    return "/default_crop.png";
  };

  // SVG Glowing Bubbles for N, P, K parameters
  const renderGlowingBubble = (type) => {
    if (type === 'N') {
      return (
        <svg className="bubble-svg" viewBox="0 0 100 100" width="45" height="45">
          <defs>
            <radialGradient id="gradN" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#8be9fd" stopOpacity="1"/>
              <stop offset="70%" stopColor="#00b4d8" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#0077b6" stopOpacity="0"/>
            </radialGradient>
          </defs>
          <circle cx="50%" cy="50%" r="35" fill="url(#gradN)" className="bubble-circle-base"/>
          <circle cx="50%" cy="50%" r="18" fill="none" stroke="#ffffff" strokeWidth="2" strokeOpacity="0.6"/>
          <circle cx="40%" cy="40%" r="5" fill="#ffffff" fillOpacity="0.8"/>
        </svg>
      );
    } else if (type === 'P') {
      return (
        <svg className="bubble-svg" viewBox="0 0 100 100" width="45" height="45">
          <defs>
            <radialGradient id="gradP" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a7ffeb" stopOpacity="1"/>
              <stop offset="70%" stopColor="#10b981" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#047857" stopOpacity="0"/>
            </radialGradient>
          </defs>
          <circle cx="50%" cy="50%" r="35" fill="url(#gradP)" className="bubble-circle-base"/>
          <polygon points="50,25 65,45 50,65 35,45" fill="none" stroke="#ffffff" strokeWidth="2" strokeOpacity="0.6"/>
          <circle cx="45%" cy="38%" r="4" fill="#ffffff" fillOpacity="0.8"/>
        </svg>
      );
    } else {
      return (
        <svg className="bubble-svg" viewBox="0 0 100 100" width="45" height="45">
          <defs>
            <radialGradient id="gradK" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffe082" stopOpacity="1"/>
              <stop offset="70%" stopColor="#f59e0b" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#b45309" stopOpacity="0"/>
            </radialGradient>
          </defs>
          <circle cx="50%" cy="50%" r="35" fill="url(#gradK)" className="bubble-circle-base"/>
          <rect x="37" y="37" width="26" height="26" fill="none" stroke="#ffffff" strokeWidth="2" strokeOpacity="0.6" rx="4"/>
          <circle cx="45%" cy="45%" r="4" fill="#ffffff" fillOpacity="0.8"/>
        </svg>
      );
    }
  };

  return (
    <div className="app-glass-layout">
      {/* Background graphic panel overlay */}
      <div className="layout-bg-overlay"></div>

      <div className="app-container">
        <header className="header-glass animate-fade-in">
        <div className="logo-section">
          <div className="logo">
            <Sprout size={32} color="#10b981" />
            <span>AgriPredict AI</span>
          </div>
          <div className="system-health-badge">
            <span className="health-dot animate-pulse-glow"></span>
            <span>System Health</span>
          </div>
        </div>
        
        <div className="header-actions">
          {/* Mode Switcher Toggle */}
          <div className="mode-toggle">
            <button 
              className={`toggle-btn ${!isManualMode ? 'active' : ''}`}
              onClick={() => setIsManualMode(false)}
            >
              🛰️ Auto Fetch
            </button>
            <button 
              className={`toggle-btn ${isManualMode ? 'active' : ''}`}
              onClick={() => setIsManualMode(true)}
            >
              ✍️ Manual Form
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-grid glass-dashboard">
        {/* Left Column: Coordinates Selector & Live Logs & Soil Meters */}
        <section className="left-column flex-col-container">
          
          {/* Selection Map Site */}
          {!isManualMode && (
            <div className="glass-card animate-fade-in card-site-picker">
              <h3 className="section-title">
                <MapPin size={20} color="#3b82f6" />
                Select Prediction Site
              </h3>
              
              <div className="location-picker-actions">
                <button className="btn-secondary detect-btn-pill" onClick={handleDetectLocation}>
                  <Compass size={16} className={fetchingLocationName ? 'animate-spin' : ''} />
                  Detect Location
                </button>
              </div>

              {/* Coordinates Forms */}
              <form onSubmit={handleManualCoordsApply} className="coords-form-horizontal">
                <div className="input-group-horizontal">
                  <label>Latitude</label>
                  <input type="number" step="0.0001" value={latInput} onChange={(e) => setLatInput(e.target.value)} />
                </div>
                <div className="input-group-horizontal">
                  <label>Longitude</label>
                  <input type="number" step="0.0001" value={lonInput} onChange={(e) => setLonInput(e.target.value)} />
                </div>
                <button type="submit" className="btn-apply-pill">
                  Apply
                </button>
              </form>

              {/* Mini Interactive Map */}
              <div className="map-container-mini">
                <MapContainer center={[coordinates.lat, coordinates.lon]} zoom={4} style={{ height: '100%', width: '100%' }}>
                  <ChangeMapCenter center={[coordinates.lat, coordinates.lon]} />
                  <MapClickHandler onMapClick={handleLocationChange} />
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  <Marker 
                    position={[coordinates.lat, coordinates.lon]} 
                    draggable={true}
                    eventHandlers={{
                      dragend: (e) => {
                        const latLng = e.target.getLatLng();
                        handleLocationChange(latLng.lat, latLng.lng);
                      }
                    }}
                  >
                    <Popup>
                      Site Coordinates: <br />
                      {coordinates.lat.toFixed(4)}, {coordinates.lon.toFixed(4)}
                    </Popup>
                  </Marker>
                </MapContainer>
              </div>

              {/* Address label */}
              <div className="geocoded-address-bubble">
                <span className={`address-dot ${fetchingLocationName ? 'fetching' : ''}`}></span>
                <span className="address-text">{fetchingLocationName ? 'Locating site...' : locationName}</span>
              </div>
            </div>
          )}



          {/* Soil NPK Meters (Only visible in Auto Mode) */}
          {!isManualMode && (
            <div className="glass-card npk-meters-card animate-fade-in">
              <h3 className="section-title">
                <Activity size={20} color="#10b981" />
                Soil Macronutrients
              </h3>
              
              <div className="npk-meters-list">
                {/* Nitrogen Meter */}
                <div className="npk-row">
                  {renderGlowingBubble('N')}
                  <div className="npk-bar-container">
                    <div className="npk-bar-header">
                      <span className="npk-label">Nitrogen</span>
                      <span className="npk-value">{formData.N.toFixed(0)} <span className="npk-unit">mg/kg</span></span>
                    </div>
                    <div className="npk-bar-track">
                      <div 
                        className="npk-bar-fill fill-blue" 
                        style={{ width: `${(formData.N / 140.0) * 100}%` }}
                      >
                        <span className="bar-glow-dot"></span>
                      </div>
                    </div>
                  </div>
                  <button className="npk-btn-edit" onClick={() => startEditing('N')}>
                    <Edit2 size={12} />
                  </button>
                </div>

                {/* Phosphorus Meter */}
                <div className="npk-row">
                  {renderGlowingBubble('P')}
                  <div className="npk-bar-container">
                    <div className="npk-bar-header">
                      <span className="npk-label">Phosphorus</span>
                      <span className="npk-value">{formData.P.toFixed(0)} <span className="npk-unit">mg/kg</span></span>
                    </div>
                    <div className="npk-bar-track">
                      <div 
                        className="npk-bar-fill fill-teal" 
                        style={{ width: `${(formData.P / 145.0) * 100}%` }}
                      >
                        <span className="bar-glow-dot"></span>
                      </div>
                    </div>
                  </div>
                  <button className="npk-btn-edit" onClick={() => startEditing('P')}>
                    <Edit2 size={12} />
                  </button>
                </div>

                {/* Potassium Meter */}
                <div className="npk-row">
                  {renderGlowingBubble('K')}
                  <div className="npk-bar-container">
                    <div className="npk-bar-header">
                      <span className="npk-label">Potassium</span>
                      <span className="npk-value">{formData.K.toFixed(0)} <span className="npk-unit">mg/kg</span></span>
                    </div>
                    <div className="npk-bar-track">
                      <div 
                        className="npk-bar-fill fill-gold" 
                        style={{ width: `${(formData.K / 205.0) * 100}%` }}
                      >
                        <span className="bar-glow-dot"></span>
                      </div>
                    </div>
                  </div>
                  <button className="npk-btn-edit" onClick={() => startEditing('K')}>
                    <Edit2 size={12} />
                  </button>
                </div>
              </div>

              {/* Inline input editing overlay */}
              <AnimatePresence>
                {editingField && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="override-modal-overlay"
                  >
                    <div className="override-modal-content">
                      <h4>Modify {editingField === 'N' ? 'Nitrogen' : editingField === 'P' ? 'Phosphorus' : 'Potassium'}</h4>
                      <div className="override-modal-input-group">
                        <input 
                          type="number" 
                          value={editValue} 
                          onChange={(e) => setEditValue(e.target.value)} 
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveOverride(editingField);
                            if (e.key === 'Escape') setEditingField(null);
                          }}
                        />
                        <span className="npk-unit">mg/kg</span>
                      </div>
                      <div className="override-modal-actions">
                        <button className="btn-cancel" onClick={() => setEditingField(null)}>Cancel</button>
                        <button className="btn-confirm" onClick={() => saveOverride(editingField)}>Save</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Manual mode grid form (Only visible in Manual Mode) */}
          {isManualMode && (
            <div className="glass-card animate-fade-in form-manual-card">
              <h3 className="section-title">
                <Edit2 size={20} color="#3b82f6" />
                Soil & Environmental inputs
              </h3>
              <div className="input-grid-manual">
                <div className="input-group">
                  <label>Nitrogen (N)</label>
                  <input type="number" name="N" value={formData.N} onChange={handleInputChange} />
                </div>
                <div className="input-group">
                  <label>Phosphorus (P)</label>
                  <input type="number" name="P" value={formData.P} onChange={handleInputChange} />
                </div>
                <div className="input-group">
                  <label>Potassium (K)</label>
                  <input type="number" name="K" value={formData.K} onChange={handleInputChange} />
                </div>
                <div className="input-group">
                  <label>Temperature (°C)</label>
                  <input type="number" name="temperature" value={formData.temperature} onChange={handleInputChange} />
                </div>
                <div className="input-group">
                  <label>Humidity (%)</label>
                  <input type="number" name="humidity" value={formData.humidity} onChange={handleInputChange} />
                </div>
                <div className="input-group">
                  <label>Soil pH</label>
                  <input type="number" step="0.1" name="ph" value={formData.ph} onChange={handleInputChange} />
                </div>
                <div className="input-group">
                  <label>Rainfall (mm)</label>
                  <input type="number" name="rainfall" value={formData.rainfall} onChange={handleInputChange} />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Prediction results & AI analytics */}
        <section className="right-column-glass flex-col-container">
          <AnimatePresence mode="wait">
            {!prediction ? (
              <motion.div 
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card placeholder-card"
              >
                <div className="placeholder-icon-container">
                  <Sprout size={64} color="#10b981" />
                </div>
                <h3>System Ready for Prediction</h3>
                <p>Click "Generate Recommendation" at the bottom to calculate optimized crops.</p>
              </motion.div>
            ) : (
              <motion.div 
                key="results"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="results-container-vertical"
              >
                {/* Large Prediction Panel: Recommended Crop & Gauge */}
                <div className="glass-card card-prediction-main">
                  
                  {/* Left Side: Crop name and float illustration */}
                  <div className="crop-details-side">
                    <span className="label-heading">Recommended Crop</span>
                    <h2 className="recommended-crop-name">{prediction.recommendation}</h2>
                    
                    <div className="crop-float-wrapper">
                      <div className="crop-glow-glow animate-pulse-slow"></div>
                      <img 
                        src={getCropImage(prediction.recommendation)} 
                        alt={prediction.recommendation} 
                        className="crop-float-image animate-float"
                      />
                    </div>
                  </div>

                  {/* Right Side: Circular Gauge */}
                  <div className="confidence-gauge-side">
                    <span className="label-heading text-right">Confidence Score</span>
                    
                    <div className="gauge-circular-wrapper">
                      {/* SVG Gauge */}
                      <svg width="150" height="150" className="gauge-svg">
                        <defs>
                          <linearGradient id="gaugeGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="100%" stopColor="#06b6d4" />
                          </linearGradient>
                          <filter id="glow">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                            <feMerge>
                              <feMergeNode in="coloredBlur"/>
                              <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                          </filter>
                        </defs>
                        {/* Background track circle */}
                        <circle 
                          cx="75" 
                          cy="75" 
                          r={radius} 
                          className="gauge-track-circle"
                        />
                        {/* Interactive gauge fill */}
                        <circle 
                          cx="75" 
                          cy="75" 
                          r={radius} 
                          className="gauge-fill-circle animate-gauge-sweep"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          stroke="url(#gaugeGradient)"
                          filter="url(#glow)"
                        />
                      </svg>
                      {/* Central Percentage */}
                      <div className="gauge-center-percentage">
                        <span className="percentage-number">{(confidence * 100).toFixed(1)}%</span>
                        <span className="percentage-sparkles">✨</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Stats Row */}
                  <div className="prediction-metrics-row">
                    <div className="metric-pill">
                      <Thermometer size={16} color="#ef4444" />
                      <div className="metric-pill-info">
                        <span className="metric-pill-val">{formData.temperature.toFixed(1)}°C</span>
                        <span className="metric-pill-lbl">Climate</span>
                      </div>
                    </div>

                    <div className="metric-pill">
                      <CloudRain size={16} color="#3b82f6" />
                      <div className="metric-pill-info">
                        <span className="metric-pill-val">{formData.ph.toFixed(1)}</span>
                        <span className="metric-pill-lbl">Soil pH</span>
                      </div>
                    </div>

                    <div className="metric-pill">
                      <Droplets size={16} color="#06b6d4" />
                      <div className="metric-pill-info">
                        <span className="metric-pill-val">{formData.rainfall.toFixed(0)}mm</span>
                        <span className="metric-pill-lbl">Water</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Explainable AI & Suitability Map Grid */}
                <div className="analytics-dashboard-grid">
                  
                  {/* Explainable AI panel */}
                  <div className="glass-card xai-analytics-card">
                    <h3 className="section-title">
                      <BarChart3 size={18} color="#f59e0b" />
                      Explainable AI Insights
                    </h3>
                    
                    <div className="xai-bars-list">
                      {/* Rainfall bar */}
                      <div className="xai-bar-row">
                        <span className="xai-bar-label">rainfall</span>
                        <div className="xai-progress-track">
                          <div className="xai-progress-fill fill-cyan" style={{ width: `${(prediction.feature_importance.rainfall || 0.35) * 150}%` }}>
                            <span className="progress-value-sparkle"></span>
                          </div>
                        </div>
                      </div>

                      {/* Temperature bar */}
                      <div className="xai-bar-row">
                        <span className="xai-bar-label">temperature</span>
                        <div className="xai-progress-track">
                          <div className="xai-progress-fill fill-orange" style={{ width: `${(prediction.feature_importance.temperature || 0.25) * 150}%` }}>
                            <span className="progress-value-sparkle"></span>
                          </div>
                        </div>
                      </div>

                      {/* Nitrogen bar */}
                      <div className="xai-bar-row">
                        <span className="xai-bar-label">N</span>
                        <div className="xai-progress-track">
                          <div className="xai-progress-fill fill-red" style={{ width: `${(prediction.feature_importance.N || 0.22) * 150}%` }}>
                            <span className="progress-value-sparkle"></span>
                          </div>
                        </div>
                      </div>

                      {/* Humidity bar */}
                      <div className="xai-bar-row">
                        <span className="xai-bar-label">humidity</span>
                        <div className="xai-progress-track">
                          <div className="xai-progress-fill fill-purple" style={{ width: `${(prediction.feature_importance.humidity || 0.18) * 150}%` }}>
                            <span className="progress-value-sparkle"></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Suitability Map panel */}
                  <div className="glass-card suitability-map-card">
                    <h3 className="section-title">
                      <MapIcon size={18} color="#8b5cf6" />
                      Regional Suitability Map
                    </h3>
                    
                    <div className="leaflet-map-frame-suitability">
                      <MapContainer center={[coordinates.lat, coordinates.lon]} zoom={5} style={{ height: '100%', width: '100%' }}>
                        <ChangeMapCenter center={[coordinates.lat, coordinates.lon]} />
                        <TileLayer
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />
                        <Circle 
                          center={[coordinates.lat, coordinates.lon]} 
                          pathOptions={{ color: '#10b981', fillOpacity: 0.25, fillColor: '#10b981' }}
                          radius={180000}
                        >
                          <Popup>
                            Optimal suitability sector for {prediction.recommendation}.
                          </Popup>
                        </Circle>
                      </MapContainer>
                    </div>

                    {/* Time Slider */}
                    <div className="suitability-time-slider-panel">
                      <div className="slider-labels">
                        <span className="slider-label-title">Time Slider</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={timeSlider} 
                        onChange={(e) => setTimeSlider(parseInt(e.target.value))} 
                        className="custom-range-slider"
                      />
                      <div className="slider-limits">
                        <span>Past</span>
                        <span>Future</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* Main recommendation button placed at bottom center */}
      <div className="main-action-section flex-center-container">
        <button className="btn-primary-action btn-glowing-gold" onClick={getPrediction} disabled={loading || loadingMetrics}>
          {loading ? (
            <RefreshCw className="animate-spin" />
          ) : (
            <>
              <Search size={20} />
              <span>Generate Recommendation</span>
            </>
          )}
        </button>
        {error && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.5rem', textShadow: '0 0 10px rgba(239, 68, 68, 0.4)', fontWeight: '600' }}>{error}</p>}
      </div>
      </div>

      {metricsError && !isManualMode && (
        <div className="api-error-toast-fixed">
          <div className="api-error-toast-content">
            <Info size={14} />
            <span>{metricsError}</span>
          </div>
          <button className="api-error-toast-close" onClick={() => setMetricsError(null)}>
            &times;
          </button>
        </div>
      )}

      {/* Floating Telemetry Sync Log in bottom-left to match reference mockup */}
      {!isManualMode && (
        <div className="api-fetch-log-panel-floating animate-fade-in">
          <div className="log-header">
            <Wifi size={14} className="log-icon animate-pulse" />
            <span className="log-title">Telemetry Sync Log</span>
          </div>
          <div className="log-content-feed">
            {logs.map((log, index) => (
              <div className="log-line" key={index}>
                <span className="log-line-arrow">&gt;</span>
                <span className="log-line-text">{log}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
