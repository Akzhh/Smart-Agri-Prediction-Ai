import requests
import urllib.parse
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

# Default fallback values (representing typical average conditions)
DEFAULTS = {
    'N': 90.0,
    'P': 42.0,
    'K': 43.0,
    'temperature': 20.8,
    'humidity': 82.0,
    'ph': 6.5,
    'rainfall': 202.9
}

def estimate_npk(soil_raw: dict) -> dict:
    """
    Estimates N, P, K values based on SoilGrids raw properties.
    - nitrogen (cg/kg) -> plant available N (mg/kg/ppm)
    - soc (dg/kg), cec (mmol(c)/kg), clay (g/kg) -> pedotransfer estimations for P, K
    """
    estimates = {}
    
    # 1. Nitrogen Estimation
    # Total Nitrogen in SoilGrids is in cg/kg. 1 cg/kg = 10 mg/kg (ppm).
    # Typically, only 1-5% of total nitrogen is plant-available mineral nitrogen.
    # In the dataset, N is in [0, 140] range. We scale cg/kg to match this.
    nitrogen_raw = soil_raw.get('nitrogen')
    if nitrogen_raw is not None:
        # e.g., 150 cg/kg * 0.5 = 75 mg/kg (ppm)
        estimates['N'] = float(max(10.0, min(140.0, nitrogen_raw * 0.5)))
    else:
        estimates['N'] = DEFAULTS['N']
        
    # 2. Phosphorus (P) Estimation
    # P is highly correlated with Soil Organic Carbon (SOC) which is in dg/kg (decigrams/kg).
    # 1 dg/kg = 100 mg/kg.
    soc_raw = soil_raw.get('soc')
    if soc_raw is not None:
        # e.g., 200 dg/kg -> 200 * 0.15 + 15 = 45 mg/kg (ppm)
        estimates['P'] = float(max(10.0, min(140.0, (soc_raw / 10.0) * 1.5 + 15.0)))
    else:
        estimates['P'] = DEFAULTS['P']

    # 3. Potassium (K) Estimation
    # K availability correlates with Cation Exchange Capacity (CEC in mmol(c)/kg) and Clay content (g/kg).
    cec_raw = soil_raw.get('cec')
    clay_raw = soil_raw.get('clay')
    
    if cec_raw is not None and clay_raw is not None:
        # e.g., cec = 15, clay = 300 g/kg -> 15 * 1.8 + 3 * 4 + 10 = 27 + 12 + 10 = 49 mg/kg
        estimates['K'] = float(max(10.0, min(200.0, (cec_raw * 1.8) + (clay_raw / 100.0) * 4.0 + 10.0)))
    else:
        estimates['K'] = DEFAULTS['K']
        
    return estimates

def fetch_weather_data(lat: float, lon: float) -> dict:
    """
    Fetches temperature and humidity from Open-Meteo Forecast API,
    and annual precipitation from Open-Meteo Historical Archive API.
    """
    weather_data = {}
    sources = {}
    
    # 1. Current Temperature and Humidity
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m"
        r = requests.get(url, timeout=8)
        if r.status_code == 200:
            data = r.json()
            current = data.get("current", {})
            if "temperature_2m" in current:
                weather_data['temperature'] = float(current['temperature_2m'])
                sources['temperature'] = 'Open-Meteo Current Forecast'
            if "relative_humidity_2m" in current:
                weather_data['humidity'] = float(current['relative_humidity_2m'])
                sources['humidity'] = 'Open-Meteo Current Forecast'
        else:
            logger.warning(f"Open-Meteo Forecast HTTP {r.status_code}")
    except Exception as e:
        logger.error(f"Error fetching current weather: {e}")

    # 2. Historical Rainfall (last 365 days)
    try:
        today = datetime.now()
        # Open-Meteo archive has a small delay (2-3 days), so we query up to 3 days ago
        end_date = (today - timedelta(days=3)).strftime("%Y-%m-%d")
        start_date = (today - timedelta(days=368)).strftime("%Y-%m-%d")
        
        url_hist = f"https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}&start_date={start_date}&end_date={end_date}&daily=precipitation_sum"
        r_hist = requests.get(url_hist, timeout=12)
        if r_hist.status_code == 200:
            data_hist = r_hist.json()
            precip = data_hist.get("daily", {}).get("precipitation_sum", [])
            valid_precip = [p for p in precip if p is not None]
            if valid_precip:
                weather_data['rainfall'] = float(sum(valid_precip))
                sources['rainfall'] = 'Open-Meteo Historical Archive (365d sum)'
        else:
            logger.warning(f"Open-Meteo Archive HTTP {r_hist.status_code}")
    except Exception as e:
        logger.error(f"Error fetching historical rainfall: {e}")

    # Fallbacks for weather values if APIs failed
    if 'temperature' not in weather_data:
        weather_data['temperature'] = DEFAULTS['temperature']
        sources['temperature'] = 'Fallback Default'
    if 'humidity' not in weather_data:
        weather_data['humidity'] = DEFAULTS['humidity']
        sources['humidity'] = 'Fallback Default'
    if 'rainfall' not in weather_data:
        weather_data['rainfall'] = DEFAULTS['rainfall']
        sources['rainfall'] = 'Fallback Default'
        
    return {
        'values': weather_data,
        'sources': sources
    }

def fetch_soil_data(lat: float, lon: float) -> dict:
    """
    Queries SoilGrids API v2.0 for nitrogen, pH, CEC, SOC, and clay properties.
    """
    soil_raw = {}
    sources = {}
    
    try:
        # Note: SoilGrids API query expects lon before lat in URL query string, or correct query params:
        url = f"https://rest.isric.org/soilgrids/v2.0/properties/query?lon={lon}&lat={lat}&property=nitrogen&property=phh2o&property=cec&property=soc&property=clay&value=mean"
        headers = {'User-Agent': 'Mozilla/5.0'}
        r = requests.get(url, headers=headers, timeout=12)
        
        if r.status_code == 200:
            data = r.json()
            properties = data.get("properties", {})
            layers = properties.get("layers", [])
            
            for layer in layers:
                name = layer.get("name")
                depths = layer.get("depths", [])
                
                # Average values for top 30cm (labels: '0-5cm', '5-15cm', '15-30cm')
                valid_values = []
                for depth in depths:
                    label = depth.get("label")
                    if label in ['0-5cm', '5-15cm', '15-30cm']:
                        mean_val = depth.get("values", {}).get("mean")
                        if mean_val is not None:
                            valid_values.append(mean_val)
                            
                if valid_values:
                    soil_raw[name] = sum(valid_values) / len(valid_values)
                        
            if soil_raw:
                logger.info(f"Successfully retrieved soil data for lat={lat}, lon={lon}: {soil_raw.keys()}")
            else:
                logger.warning(f"SoilGrids returned 200 but layers list was empty/incomplete")
        else:
            logger.warning(f"SoilGrids HTTP {r.status_code}")
    except Exception as e:
        logger.error(f"Error querying SoilGrids API: {e}")

    # Apply calculations/conversions
    soil_processed = {}
    
    # 1. pH Conversion (phh2o unit is pH*10)
    phh2o = soil_raw.get('phh2o')
    if phh2o is not None:
        # clamp pH to reasonable range for crop recommendation dataset
        soil_processed['ph'] = float(max(3.5, min(10.0, phh2o / 10.0)))
        sources['ph'] = 'SoilGrids API (pH H2O)'
    else:
        soil_processed['ph'] = DEFAULTS['ph']
        sources['ph'] = 'Fallback Default'

    # 2. Estimates for N, P, K
    npk_estimates = estimate_npk(soil_raw)
    for k, v in npk_estimates.items():
        soil_processed[k] = v
        if (k == 'N' and 'nitrogen' in soil_raw) or (k == 'P' and 'soc' in soil_raw) or (k == 'K' and 'clay' in soil_raw and 'cec' in soil_raw):
            sources[k] = 'SoilGrids API (Pedotransfer Estimate)'
        else:
            sources[k] = 'Fallback Default'
            
    return {
        'values': soil_processed,
        'sources': sources
    }

def apply_iot_overrides(metrics: dict, iot_data: dict) -> dict:
    """
    Placeholder/Hook to inject/override fetched metrics with direct sensor readings.
    """
    if not iot_data:
        return metrics
        
    for k, v in iot_data.items():
        if k in metrics['values'] and v is not None:
            metrics['values'][k] = float(v)
            metrics['sources'][k] = 'IoT Live Sensor Override'
            
    return metrics

def get_location_metrics(lat: float, lon: float, iot_data: dict = None) -> dict:
    """
    Aggregates weather and soil data for a given location,
    applies pedotransfer estimations, and handles IoT overrides.
    """
    # Fetch data from both APIs
    weather = fetch_weather_data(lat, lon)
    soil = fetch_soil_data(lat, lon)
    
    # Merge values and sources
    metrics = {
        'values': {**weather['values'], **soil['values']},
        'sources': {**weather['sources'], **soil['sources']}
    }
    
    # Apply IoT overrides if present
    if iot_data:
        metrics = apply_iot_overrides(metrics, iot_data)
        
    return metrics
