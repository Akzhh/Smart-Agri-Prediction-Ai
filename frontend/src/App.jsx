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
  Check,
  Thermometer,
  CloudRain,
  Activity,
  Info,
  Compass
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
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
  const [coordinates, setCoordinates] = useState({ lat: 21.1458, lon: 79.0882 }); // Nagpur default
  const [latInput, setLatInput] = useState("21.1458");
  const [lonInput, setLonInput] = useState("79.0882");
  const [locationName, setLocationName] = useState("Nagpur, Maharashtra, India");
  const [fetchingLocationName, setFetchingLocationName] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [metricsError, setMetricsError] = useState(null);

  // Form parameters
  const [formData, setFormData] = useState({
    N: 90.0,
    P: 42.0,
    K: 43.0,
    temperature: 20.8,
    humidity: 82.0,
    ph: 6.5,
    rainfall: 202.9
  });

  // Source mapping for features (API vs Default vs Override)
  const [sources, setSources] = useState({
    N: 'Default',
    P: 'Default',
    K: 'Default',
    temperature: 'Default',
    humidity: 'Default',
    ph: 'Default',
    rainfall: 'Default'
  });

  // Tracking which fields have manual overrides in auto mode
  const [overriddenFields, setOverriddenFields] = useState({});

  // Inline editing state for parameter cards
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState("");

  // Recommendation responses
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  // Weather & Soil APIs: Fetch metrics from backend
  const fetchMetricsForLocation = async (lat, lon) => {
    setLoadingMetrics(true);
    setMetricsError(null);
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
      handleLocationChange(21.1458, 79.0882);
    }, 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const featureData = prediction ? Object.entries(prediction.feature_importance).map(([name, value]) => ({
    name,
    value: value * 100
  })).sort((a, b) => b.value - a.value) : [];

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  // Card renderer
  const renderParamCard = (field, label, icon, unit) => {
    const isEditing = editingField === field;
    const value = formData[field];
    const source = sources[field] || 'Default';

    let sourceLabel = 'Fallback';
    let badgeClass = 'badge-fallback';
    if (source.includes('Forecast') || source.includes('Weather')) {
      sourceLabel = '🌐 Weather API';
      badgeClass = 'badge-weather';
    } else if (source.includes('SoilGrids') || source.includes('Soil')) {
      sourceLabel = '🗺️ Soil API';
      badgeClass = 'badge-soil';
    } else if (source.includes('Override') || source.includes('Manual')) {
      sourceLabel = '✍️ Overridden';
      badgeClass = 'badge-override';
    } else if (source.includes('IoT')) {
      sourceLabel = '📡 IoT live';
      badgeClass = 'badge-iot';
    }

    return (
      <div className={`param-card ${overriddenFields[field] ? 'card-overridden' : ''}`} key={field}>
        <div className="card-header">
          <div className="card-title">
            {icon}
            <span>{label}</span>
          </div>
          <span className={`badge ${badgeClass}`}>{sourceLabel}</span>
        </div>

        <div className="card-body">
          {isEditing ? (
            <div className="card-edit-group">
              <input
                type="number"
                step={field === 'ph' ? '0.1' : '1'}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="card-edit-input"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveOverride(field);
                  if (e.key === 'Escape') setEditingField(null);
                }}
              />
              <button className="btn-save" onClick={() => saveOverride(field)}>
                <Check size={16} />
              </button>
            </div>
          ) : (
            <div className="card-value-display">
              <span className="card-value">
                {value !== undefined ? value.toFixed(1) : '--'}
                <span className="unit">{unit}</span>
              </span>
              <button className="btn-edit" onClick={() => startEditing(field)} title="Override value">
                <Edit2 size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSkeletonCard = (index) => (
    <div className="param-card skeleton-card" key={`skeleton-${index}`}>
      <div className="skeleton-header">
        <div className="skeleton skeleton-title"></div>
        <div className="skeleton skeleton-badge"></div>
      </div>
      <div className="skeleton-body">
        <div className="skeleton skeleton-value"></div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <header>
        <div className="logo">
          <Sprout size={32} color="#10b981" />
          <span>AgriPredict AI</span>
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
          <button className="btn-secondary" onClick={() => handleLocationChange(coordinates.lat, coordinates.lon)} title="Re-fetch API Data">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <main className="dashboard-grid">
        {/* Left Column: Coordinates & Parameters */}
        <section className="left-column" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* Geolocation & Map Settings in Auto Mode */}
          {!isManualMode && (
            <div className="glass-card animate-fade-in">
              <h2 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MapPin size={24} color="#3b82f6" />
                Select Prediction Site
              </h2>

              <div className="location-picker-actions" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
                <button className="btn-secondary detect-btn" onClick={handleDetectLocation} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <Compass size={18} className={fetchingLocationName ? 'animate-spin' : ''} />
                  Detect Location
                </button>
              </div>

              {/* Coordinates Forms */}
              <form onSubmit={handleManualCoordsApply} className="coords-form" style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
                <div className="input-group" style={{ margin: 0, flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Latitude</label>
                  <input type="number" step="0.0001" value={latInput} onChange={(e) => setLatInput(e.target.value)} />
                </div>
                <div className="input-group" style={{ margin: 0, flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Longitude</label>
                  <input type="number" step="0.0001" value={lonInput} onChange={(e) => setLonInput(e.target.value)} />
                </div>
                <button type="submit" className="btn-secondary" style={{ alignSelf: 'flex-end', height: '42px', padding: '0 1rem' }}>
                  Apply
                </button>
              </form>

              {/* Mini Leaflet Interactive Map */}
              <div className="map-container mini-map" style={{ height: '200px', marginTop: 0, marginBottom: '1rem' }}>
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
                      Prediction Location: <br />
                      {coordinates.lat.toFixed(4)}, {coordinates.lon.toFixed(4)}
                    </Popup>
                  </Marker>
                </MapContainer>
              </div>

              {/* Geocoded Address Panel */}
              <div className="location-name-panel" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1rem', borderRadius: '0.75rem', fontSize: '0.875rem' }}>
                <MapIcon size={16} color="#10b981" />
                <span className={fetchingLocationName ? 'pulse-text' : ''} style={{ color: '#e2e8f0' }}>
                  {fetchingLocationName ? 'Determining place name...' : locationName}
                </span>
              </div>
            </div>
          )}

          {/* Environmental data parameters panel */}
          <div className="glass-card animate-fade-in" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Droplets size={24} color="#3b82f6" />
              Soil & Environment Metrics
            </h2>

            {isManualMode ? (
              /* Manual Input Form mode */
              <div className="input-grid" style={{ marginBottom: '1.5rem' }}>
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
            ) : (
              /* Location Auto-Fetched Cards Grid */
              <div className="metrics-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1rem', marginBottom: '1.5rem', flexGrow: 1 }}>
                {loadingMetrics ? (
                  Array.from({ length: 7 }).map((_, i) => renderSkeletonCard(i))
                ) : (
                  <>
                    {renderParamCard('N', 'Nitrogen', <Sprout size={16} color="#10b981" />, 'cg/kg')}
                    {renderParamCard('P', 'Phosphorus', <Sprout size={16} color="#8b5cf6" />, 'mg/kg')}
                    {renderParamCard('K', 'Potassium', <Sprout size={16} color="#3b82f6" />, 'mg/kg')}
                    {renderParamCard('temperature', 'Temperature', <Thermometer size={16} color="#ef4444" />, '°C')}
                    {renderParamCard('humidity', 'Humidity', <Droplets size={16} color="#06b6d4" />, '%')}
                    {renderParamCard('ph', 'Soil pH', <Activity size={16} color="#f59e0b" />, '')}
                    {renderParamCard('rainfall', 'Annual Rainfall', <CloudRain size={16} color="#3b82f6" />, 'mm')}
                  </>
                )}
              </div>
            )}

            {metricsError && !isManualMode && (
              <p style={{ color: '#f59e0b', marginBottom: '1rem', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Info size={14} />
                {metricsError}
              </p>
            )}

            <button className="btn-primary" onClick={getPrediction} disabled={loading || loadingMetrics}>
              {loading ? <RefreshCw className="animate-spin" /> : <Search size={20} />}
              Generate Recommendation
            </button>

            {error && <p style={{ color: '#ef4444', marginTop: '1rem', fontSize: '0.875rem' }}>{error}</p>}
          </div>
        </section>

        {/* Right Column: Results & XAI */}
        <section className="results-column">
          <AnimatePresence mode="wait">
            {!prediction ? (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card"
                style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', minHeight: '400px' }}
              >
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '2rem', borderRadius: '50%', marginBottom: '1.5rem' }}>
                  <Sprout size={64} color="#10b981" />
                </div>
                <h3>Ready to Analyze</h3>
                <p style={{ color: '#94a3b8', maxWidth: '300px', marginTop: '0.5rem' }}>
                  {isManualMode
                    ? "Enter parameters manually and click Generate Recommendation."
                    : "Select a location coordinates or click Detect Location to auto-gather climate & soil data."}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="results"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="results-container"
                style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}
              >
                {/* Main Prediction Card */}
                <div className="glass-card prediction-result">
                  <span className="crop-badge">🌾</span>
                  <p style={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.75rem', fontWeight: 600 }}>Recommended Crop</p>
                  <h1 className="crop-name">{prediction.recommendation}</h1>

                  <div className="confidence-container" style={{ maxWidth: '400px', margin: '0 auto' }}>
                    <div className="confidence-bar">
                      <div
                        className="confidence-fill"
                        style={{ width: `${prediction.top_recommendations[0].probability * 100}%` }}
                      ></div>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                      Confidence Score: {(prediction.top_recommendations[0].probability * 100).toFixed(1)}%
                    </p>
                  </div>

                  <div className="stat-grid">
                    <div className="stat-card">
                      <div className="stat-value">{formData.temperature.toFixed(1)}°C</div>
                      <div className="stat-label">Climate</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{formData.ph.toFixed(1)}</div>
                      <div className="stat-label">Soil pH</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{formData.rainfall.toFixed(0)}mm</div>
                      <div className="stat-label">Water</div>
                    </div>
                  </div>
                </div>

                {/* XAI: Why this crop? */}
                <div className="glass-card">
                  <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <BarChart3 size={20} color="#f59e0b" />
                    Explainable AI Insights
                  </h3>
                  <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                    The model prioritized the following features for this recommendation:
                  </p>

                  <div className="chart-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={featureData} layout="vertical" margin={{ left: 20, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="name"
                          type="category"
                          stroke="#94a3b8"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                          itemStyle={{ color: '#10b981' }}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                          {featureData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Regional Map centered on selected coords */}
                <div className="glass-card">
                  <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <MapIcon size={20} color="#8b5cf6" />
                    Regional Suitability Map
                  </h3>
                  <div className="map-container">
                    <MapContainer center={[coordinates.lat, coordinates.lon]} zoom={6} style={{ height: '100%', width: '100%' }}>
                      <ChangeMapCenter center={[coordinates.lat, coordinates.lon]} />
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      />
                      <Circle
                        center={[coordinates.lat, coordinates.lon]}
                        pathOptions={{ color: '#10b981', fillOpacity: 0.25 }}
                        radius={150000}
                      >
                        <Popup>
                          Recommended cultivation region centered on selected coordinates.
                        </Popup>
                      </Circle>
                    </MapContainer>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      <footer style={{ marginTop: '4rem', textAlign: 'center', color: '#64748b', fontSize: '0.875rem', paddingBottom: '2rem' }}>
        <p>&copy; 2026 AgriPredict AI - Smart Agriculture Intelligence System</p>
        <p style={{ marginTop: '0.5rem' }}>Automated Soil & Weather API Integration Pipeline</p>
      </footer>

      <style dangerouslySetInnerHTML={{
        __html: `
        .input-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 2rem;
        }
        @media (max-width: 640px) {
          .input-grid { grid-template-columns: 1fr; }
        }
        .btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border);
          color: white;
          padding: 0.5rem;
          border-radius: 0.5rem;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
        }
        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .pulse-text {
          animation: textPulse 1.5s ease-in-out infinite;
        }
        @keyframes textPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}} />
    </div>
  );
};

export default App;
