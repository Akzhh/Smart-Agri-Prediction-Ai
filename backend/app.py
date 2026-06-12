import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import pandas as pd
import numpy as np
from data_fetcher import get_location_metrics

app = Flask(__name__)
CORS(app)

# Load the model and feature importance (absolute path relative to app.py)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'models', 'crop_model.pkl')
IMPORTANCE_PATH = os.path.join(BASE_DIR, 'models', 'feature_importance.pkl')

model = None
feature_importance = None

def load_model():
    global model, feature_importance
    try:
        with open(MODEL_PATH, 'rb') as f:
            model = pickle.load(f)
        with open(IMPORTANCE_PATH, 'rb') as f:
            feature_importance = pickle.load(f)
        print("Model loaded successfully")
    except FileNotFoundError:
        print("Model file not found. Please run train_model.py first.")

@app.route('/predict', methods=['POST'])
def predict():
    if model is None:
        load_model()
        if model is None:
            return jsonify({'error': 'Model not trained'}), 500
            
    data = request.get_json()
    
    try:
        # Extract features in correct order
        features = ['N', 'P', 'K', 'temperature', 'humidity', 'ph', 'rainfall']
        input_data = [data[f] for f in features]
        
        # Predict
        prediction = model.predict([input_data])[0]
        probabilities = model.predict_proba([input_data])[0]
        classes = model.classes_
        
        # Get top 3 predictions
        top_indices = np.argsort(probabilities)[-3:][::-1]
        top_predictions = [
            {'crop': classes[i], 'probability': float(probabilities[i])} 
            for i in top_indices
        ]
        
        # Return prediction + XAI data
        return jsonify({
            'recommendation': prediction,
            'top_recommendations': top_predictions,
            'feature_importance': feature_importance,
            'input_data': data
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        'message': 'Smart Agri Predict API is running',
        'endpoints': {
            '/': 'GET - This API index',
            '/health': 'GET - Health check status',
            '/predict': 'POST - Predict crop recommendation (manual input features)',
            '/auto-predict': 'POST - Auto-predict crop based on latitude/longitude (soil & weather APIs)',
            '/location-metrics': 'POST - Retrieve soil and weather metrics for latitude/longitude without prediction',
            '/iot-override': 'POST - Send IoT sensor data override (stub)'
        }
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'model_loaded': model is not None})

@app.route('/auto-predict', methods=['POST'])
def auto_predict():
    if model is None:
        load_model()
        if model is None:
            return jsonify({'error': 'Model not trained'}), 500
            
    data = request.get_json()
    lat = data.get('latitude')
    lon = data.get('longitude')
    iot_data = data.get('iot_data')
    
    if lat is None or lon is None:
        return jsonify({'error': 'latitude and longitude are required'}), 400
        
    try:
        # Fetch metrics
        metrics = get_location_metrics(float(lat), float(lon), iot_data)
        features = ['N', 'P', 'K', 'temperature', 'humidity', 'ph', 'rainfall']
        input_data = [metrics['values'][f] for f in features]
        
        # Predict
        prediction = model.predict([input_data])[0]
        probabilities = model.predict_proba([input_data])[0]
        classes = model.classes_
        
        # Get top 3 predictions
        top_indices = np.argsort(probabilities)[-3:][::-1]
        top_predictions = [
            {'crop': classes[i], 'probability': float(probabilities[i])} 
            for i in top_indices
        ]
        
        return jsonify({
            'recommendation': prediction,
            'top_recommendations': top_predictions,
            'feature_importance': feature_importance,
            'input_data': metrics['values'],
            'sources': metrics['sources']
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to generate recommendation: {str(e)}'}), 400

@app.route('/location-metrics', methods=['POST'])
def location_metrics():
    data = request.get_json()
    lat = data.get('latitude')
    lon = data.get('longitude')
    iot_data = data.get('iot_data')
    
    if lat is None or lon is None:
        return jsonify({'error': 'latitude and longitude are required'}), 400
        
    try:
        metrics = get_location_metrics(float(lat), float(lon), iot_data)
        return jsonify(metrics)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/iot-override', methods=['POST'])
def iot_override():
    data = request.get_json()
    return jsonify({'status': 'success', 'message': 'IoT override data received', 'data': data})

if __name__ == '__main__':
    load_model()
    # Bind to 0.0.0.0 and dynamic environment PORT for Render deployment
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
