import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
import pickle
import os

# Create a synthetic dataset for demonstration if not exists
def create_synthetic_data():
    np.random.seed(42)
    n_samples = 1000
    
    crops = ['Rice', 'Maize', 'Jute', 'Cotton', 'Coconut', 'Papaya', 'Orange', 'Apple', 'Muskmelon', 'Watermelon']
    
    data = {
        'N': np.random.randint(0, 140, n_samples),
        'P': np.random.randint(5, 145, n_samples),
        'K': np.random.randint(5, 205, n_samples),
        'temperature': np.random.uniform(10, 45, n_samples),
        'humidity': np.random.uniform(15, 100, n_samples),
        'ph': np.random.uniform(3.5, 10, n_samples),
        'rainfall': np.random.uniform(20, 300, n_samples),
        'label': np.random.choice(crops, n_samples)
    }
    
    # Add some basic logic to make the model "learnable"
    df = pd.DataFrame(data)
    
    # Rice likes high rainfall and humidity
    df.loc[df['rainfall'] > 200, 'label'] = 'Rice'
    # Watermelon likes high temp and low rainfall
    df.loc[(df['temperature'] > 30) & (df['rainfall'] < 100), 'label'] = 'Watermelon'
    # Apple likes low temp
    df.loc[df['temperature'] < 15, 'label'] = 'Apple'
    # Cotton likes high N and P
    df.loc[(df['N'] > 100) & (df['P'] > 80), 'label'] = 'Cotton'
    
    return df

def train():
    print("Generating/Loading data...")
    df = create_synthetic_data()
    
    X = df.drop('label', axis=1)
    y = df['label']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print("Training Random Forest Model...")
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    
    # Calculate feature importance for XAI
    feature_importance = dict(zip(X.columns, model.feature_importances_))
    
    print(f"Model Accuracy: {model.score(X_test, y_test):.2f}")
    
    # Save the model and feature importance
    if not os.path.exists('models'):
        os.makedirs('models')
        
    with open('models/crop_model.pkl', 'wb') as f:
        pickle.dump(model, f)
        
    with open('models/feature_importance.pkl', 'wb') as f:
        pickle.dump(feature_importance, f)
        
    print("Model saved to models/crop_model.pkl")

if __name__ == "__main__":
    train()
