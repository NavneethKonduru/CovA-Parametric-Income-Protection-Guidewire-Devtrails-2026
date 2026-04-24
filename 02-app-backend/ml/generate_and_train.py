import pandas as pd
import numpy as np
import json
import os
import random
from datetime import datetime
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score

# ============================================================
# CovA PREMIUM ML ENGINE — Synthetic Data Generation & Training
# ============================================================

def generate_synthetic_data(n_samples=1000, random_state=42):
    random.seed(random_state)
    np.random.seed(random_state)
    
    zones = {'ZONE_A': 1.0, 'ZONE_B': 1.3, 'ZONE_C': 0.8}
    archetypes = {'casual': 0.7, 'balanced': 1.0, 'heavy_peak': 1.4}
    hourly_rates = {'casual': 80, 'balanced': 120, 'heavy_peak': 150}
    seasons = [
        ('monsoon', 1.30),
        ('post-monsoon', 1.05),
        ('dry', 0.82),
        ('pre-monsoon', 0.95)
    ]
    
    data = []
    
    for _ in range(n_samples):
        zone_name = random.choice(list(zones.keys()))
        zone_risk = zones[zone_name]
        
        archetype_name = random.choice(list(archetypes.keys()))
        archetype_factor = archetypes[archetype_name]
        hourly_rate = hourly_rates[archetype_name]
        
        season_name, expected_seasonal_factor = random.choice(seasons)
        seasonal_factor = np.clip(random.gauss(expected_seasonal_factor, 0.05), 0.7, 1.4)
        
        claim_history_type = random.choice(['clean', 'baseline', 'high'])
        if claim_history_type == 'clean':
            claim_history_factor = random.uniform(0.85, 0.95)
        elif claim_history_type == 'baseline':
            claim_history_factor = random.uniform(1.0, 1.1)
        else:
            claim_history_factor = random.uniform(1.15, 1.3)
            
        if archetype_name == 'heavy_peak':
            peak_hours = random.uniform(25, 35)
        elif archetype_name == 'balanced':
            peak_hours = random.uniform(15, 25)
        else:
            peak_hours = random.uniform(10, 18)
            
        base = 35.0
        zone_component = base * (zone_risk - 1.0) * 1.8
        archetype_component = base * archetype_factor
        seasonal_component = base * 0.25 * (seasonal_factor - 1.0)
        claims_loading = base * 0.30 * (claim_history_factor - 1.0)
        peak_hours_component = peak_hours * 0.18
        
        premium = base + zone_component + archetype_component + seasonal_component + claims_loading + peak_hours_component
        premium += random.gauss(0, 2.5)
        premium = max(19.60, min(89.0, premium))
        
        data.append({
            'zone': zone_name,
            'zone_risk': zone_risk,
            'archetype': archetype_name,
            'archetype_factor': archetype_factor,
            'hourly_rate': hourly_rate,
            'season_name': season_name,
            'seasonal_factor': seasonal_factor,
            'claim_history_factor': claim_history_factor,
            'peak_hours_per_week': peak_hours,
            'premium': premium
        })
        
    return pd.DataFrame(data)

def train_and_export():
    df = generate_synthetic_data()
    
    features = ['zone_risk', 'archetype_factor', 'hourly_rate', 'seasonal_factor', 'claim_history_factor', 'peak_hours_per_week']
    X = df[features]
    y = df['premium']
    
    gbr = GradientBoostingRegressor(n_estimators=100, learning_rate=0.1, max_depth=3,
                                  min_samples_split=10, random_state=42)
    gbr.fit(X, y)
    y_pred_gbr = gbr.predict(X)
    mae_gbr = mean_absolute_error(y, y_pred_gbr)
    r2_gbr = r2_score(y, y_pred_gbr)
    
    lr = LinearRegression()
    lr.fit(X, y)
    y_pred_lr = lr.predict(X)
    mae_lr = mean_absolute_error(y, y_pred_lr)
    r2_lr = r2_score(y, y_pred_lr)
    
    lookup_table = {}
    zones = {'ZONE_A': 1.0, 'ZONE_B': 1.3, 'ZONE_C': 0.8}
    archetypes = {'casual': 0.7, 'balanced': 1.0, 'heavy_peak': 1.4}
    hourly_rates = {'casual': 80, 'balanced': 120, 'heavy_peak': 150}
    seasons = [
        ('monsoon', 1.30),
        ('post-monsoon', 1.05),
        ('dry', 0.82),
        ('pre-monsoon', 0.95)
    ]
    
    for zone, zr in zones.items():
        for arch, af in archetypes.items():
            for season_name, sf in seasons:
                if arch == 'heavy_peak': ph = 30
                elif arch == 'balanced': ph = 20
                else: ph = 14
                    
                row = pd.DataFrame([{
                    'zone_risk': zr,
                    'archetype_factor': af,
                    'hourly_rate': hourly_rates[arch],
                    'seasonal_factor': sf,
                    'claim_history_factor': 1.0,
                    'peak_hours_per_week': ph
                }])
                pred = gbr.predict(row)[0]
                pred = max(19.60, min(89.0, pred))
                key = f"{zone}_{arch}_{season_name}"
                lookup_table[key] = round(pred, 2)
                
    coefficients = {
        'model': 'GradientBoostingRegressor',
        'feature_importances': dict(zip(features, gbr.feature_importances_.tolist())),
        'lookup_table': lookup_table,
        'linear_fallback': {
            'intercept': lr.intercept_,
            'coefficients': dict(zip(features, lr.coef_.tolist()))
        },
        'peak_hours_per_week': {
            'per_hour_rate': 0.18
        }
    }
    
    with open('model_coefficients.json', 'w') as f:
        json.dump(coefficients, f, indent=2)
        
    stats = {
        'model_type': 'GradientBoostingRegressor',
        'feature_names': features,
        'feature_importances': dict(zip(features, [round(imp * 100, 2) for imp in gbr.feature_importances_])),
        'r2_gbr': round(r2_gbr, 4),
        'mae_gbr': round(mae_gbr, 4),
        'r2_linear': round(r2_lr, 4),
        'mae_linear': round(mae_lr, 4),
        'top_feature': features[np.argmax(gbr.feature_importances_)],
        'training_samples': 1000,
        'generated_at': datetime.utcnow().isoformat() + 'Z'
    }
    
    with open('training_stats.json', 'w') as f:
        json.dump(stats, f, indent=2)
        
    print("Training complete. Exported model_coefficients.json and training_stats.json.")

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    train_and_export()

# EXPECTED model_coefficients.json STRUCTURE:
# {
#   "model": "GradientBoostingRegressor",
#   "feature_importances": { ... },
#   "lookup_table": {
#     "ZONE_A_heavy_peak_monsoon": 71.4,
#     "ZONE_A_heavy_peak_post-monsoon": 68.2,
#     ... 36 entries in total ...
#   },
#   "linear_fallback": {
#     "intercept": -15.4,
#     "coefficients": { "zone_risk": 20.1, ... }
#   },
#   "peak_hours_per_week": {
#     "per_hour_rate": 0.18
#   }
# }
