"""
Scenario Engine for Super Bowl LX Prediction.

Allows running what-if scenarios by modifying input parameters and re-running
predictions. Used for sensitivity analysis to understand which variables
most influence the prediction.
"""

import copy
import numpy as np
from typing import Dict, List, Optional, Tuple


class ScenarioEngine:
    """What-if scenario modeling for game predictions."""

    def __init__(self, models: dict, team_stats: dict, intangibles_model=None):
        """
        Initialize scenario engine.

        Args:
            models: Dict of {model_name: model_instance} - prediction models
            team_stats: Dict with 'patriots' and 'seahawks' team stats
            intangibles_model: Optional IntangiblesModel instance
        """
        self.models = models
        self.base_stats = copy.deepcopy(team_stats)
        self.intangibles_model = intangibles_model
        self._baseline = None

    def get_baseline(self) -> dict:
        """Get or compute baseline predictions from all models."""
        if self._baseline is None:
            self._baseline = self._run_all_models(self.base_stats)
        return self._baseline

    def _run_all_models(self, stats: dict) -> dict:
        """Run all models with given stats and return composite prediction."""
        results = {}
        ne_stats = stats.get('patriots', stats)
        sea_stats = stats.get('seahawks', stats)

        for name, model in self.models.items():
            try:
                pred = model.predict(ne_stats, sea_stats)
                results[name] = pred
            except Exception as e:
                results[name] = {
                    'patriots_win_prob': 0.5,
                    'seahawks_win_prob': 0.5,
                    'predicted_spread': 0.0,
                    'predicted_total': 44.0,
                    'error': str(e)
                }

        # Compute composite
        weights = {
            'Monte Carlo': 0.25,
            'Efficiency Composite': 0.20,
            'Bayesian Inference': 0.20,
            'Elo Rating': 0.15,
            'Logistic Regression': 0.10,
            'Pythagorean': 0.10
        }

        total_weight = 0
        composite_ne_prob = 0
        composite_spread = 0
        composite_total = 0

        for name, result in results.items():
            w = weights.get(name, 0.1)
            if 'error' not in result:
                composite_ne_prob += result.get('patriots_win_prob', 0.5) * w
                composite_spread += result.get('predicted_spread', 0) * w
                composite_total += result.get('predicted_total', 44) * w
                total_weight += w

        if total_weight > 0:
            composite_ne_prob /= total_weight
            composite_spread /= total_weight
            composite_total /= total_weight

        results['composite'] = {
            'patriots_win_prob': composite_ne_prob,
            'seahawks_win_prob': 1 - composite_ne_prob,
            'predicted_spread': composite_spread,
            'predicted_total': composite_total
        }

        return results

    def run_scenario(self, adjustments: dict) -> dict:
        """
        Run predictions with modified inputs.

        Args:
            adjustments: Dict describing modifications, e.g.:
                {'patriots': {'offense': {'epa_per_play': 0.08}}}
                or {'spread_adjustment': -2.0} for intangibles-only changes

        Returns:
            Dict with adjusted predictions and delta from baseline
        """
        baseline = self.get_baseline()

        if 'spread_adjustment' in adjustments:
            # Simple spread adjustment (e.g., from intangibles)
            adj = adjustments['spread_adjustment']
            adjusted = copy.deepcopy(baseline)
            for name in adjusted:
                if isinstance(adjusted[name], dict) and 'predicted_spread' in adjusted[name]:
                    adjusted[name]['predicted_spread'] += adj
                    # Recalculate win prob from spread (rough: each point ≈ 3% win prob)
                    spread = adjusted[name]['predicted_spread']
                    adjusted[name]['patriots_win_prob'] = self._spread_to_winprob(spread)
                    adjusted[name]['seahawks_win_prob'] = 1 - adjusted[name]['patriots_win_prob']
            return self._compute_deltas(baseline, adjusted)

        # Deep stat modification
        modified_stats = copy.deepcopy(self.base_stats)
        self._apply_adjustments(modified_stats, adjustments)
        adjusted = self._run_all_models(modified_stats)
        return self._compute_deltas(baseline, adjusted)

    def _spread_to_winprob(self, spread: float) -> float:
        """Convert point spread to win probability using logistic approximation.
        spread: negative means team is underdog (e.g., NE perspective, -4.5 means NE is 4.5 pt dog)
        """
        # Standard NFL conversion: each point ≈ 2.8-3% win probability
        from scipy.special import expit
        return float(expit(spread * 0.145))  # Calibrated so 3 pts ≈ 60%

    def _apply_adjustments(self, stats: dict, adjustments: dict):
        """Recursively apply adjustments to stats dict."""
        for key, value in adjustments.items():
            if key in stats:
                if isinstance(value, dict) and isinstance(stats[key], dict):
                    self._apply_adjustments(stats[key], value)
                else:
                    stats[key] = value
            else:
                stats[key] = value

    def _compute_deltas(self, baseline: dict, adjusted: dict) -> dict:
        """Compute difference between baseline and adjusted predictions."""
        result = {'adjusted': adjusted, 'deltas': {}}

        for name in adjusted:
            if name in baseline and isinstance(adjusted[name], dict) and isinstance(baseline[name], dict):
                delta = {}
                for key in ['patriots_win_prob', 'seahawks_win_prob', 'predicted_spread', 'predicted_total']:
                    if key in adjusted[name] and key in baseline[name]:
                        try:
                            delta[key] = adjusted[name][key] - baseline[name][key]
                        except (TypeError, ValueError):
                            delta[key] = 0
                result['deltas'][name] = delta

        return result

    def spillane_scenarios(self) -> dict:
        """Model Spillane at various health levels."""
        scenarios = {}

        # Baseline: questionable/limited (~70%)
        scenarios['limited_70pct'] = {
            'label': 'Spillane at 70% (baseline)',
            'spread_delta': 0.0,
            'prediction': self.get_baseline()['composite']
        }

        # 100% healthy
        adj_100 = self.run_scenario({'spread_adjustment': 2.5 * 0.85})
        scenarios['healthy_100pct'] = {
            'label': 'Spillane at 100%',
            'spread_delta': 2.5 * 0.85,
            'prediction': adj_100['adjusted'].get('composite', {})
        }

        # Out entirely
        adj_out = self.run_scenario({'spread_adjustment': -2.0 * 0.85})
        scenarios['out'] = {
            'label': 'Spillane OUT',
            'spread_delta': -2.0 * 0.85,
            'prediction': adj_out['adjusted'].get('composite', {})
        }

        return scenarios

    def landry_scenarios(self) -> dict:
        """Model Landry at various activity levels."""
        scenarios = {}

        # Baseline: likely inactive (snap count trend 26→11→0)
        scenarios['inactive'] = {
            'label': 'Landry INACTIVE (baseline)',
            'spread_delta': 0.0,
            'prediction': self.get_baseline()['composite']
        }

        # Active but limited (~15-20 snaps)
        adj_limited = self.run_scenario({'spread_adjustment': 1.5 * 0.85})
        scenarios['limited'] = {
            'label': 'Landry active (15-20 snaps)',
            'spread_delta': 1.5 * 0.85,
            'prediction': adj_limited['adjusted'].get('composite', {})
        }

        # Full participation (unlikely)
        adj_full = self.run_scenario({'spread_adjustment': 3.0 * 0.85})
        scenarios['full'] = {
            'label': 'Landry full participation',
            'spread_delta': 3.0 * 0.85,
            'prediction': adj_full['adjusted'].get('composite', {})
        }

        return scenarios

    def maye_shoulder_scenarios(self) -> dict:
        """Model Maye at various health levels."""
        scenarios = {}

        # 100%
        adj_100 = self.run_scenario({'spread_adjustment': 0.8 * 0.85})
        scenarios['healthy_100pct'] = {
            'label': 'Maye 100% healthy',
            'spread_delta': 0.8 * 0.85,
            'prediction': adj_100['adjusted'].get('composite', {})
        }

        # 90% (baseline - cleared but shoulder is a concern)
        scenarios['cleared_90pct'] = {
            'label': 'Maye at 90% (baseline)',
            'spread_delta': 0.0,
            'prediction': self.get_baseline()['composite']
        }

        # 80% - shoulder flares up
        adj_80 = self.run_scenario({'spread_adjustment': -1.5 * 0.85})
        scenarios['limited_80pct'] = {
            'label': 'Maye at 80% (shoulder issues)',
            'spread_delta': -1.5 * 0.85,
            'prediction': adj_80['adjusted'].get('composite', {})
        }

        return scenarios

    def brady_motivation_scenario(self) -> dict:
        """Model Brady controversy as motivator vs distraction."""
        scenarios = {}

        # Motivator: team channels anger into performance
        adj_motivator = self.run_scenario({'spread_adjustment': 2.0 * 0.30})
        scenarios['motivator'] = {
            'label': 'Brady comments as MOTIVATOR',
            'spread_delta': 2.0 * 0.30,
            'prediction': adj_motivator['adjusted'].get('composite', {})
        }

        # Neutral (baseline)
        scenarios['neutral'] = {
            'label': 'Brady comments NEUTRAL (baseline)',
            'spread_delta': 0.0,
            'prediction': self.get_baseline()['composite']
        }

        # Distraction
        adj_distraction = self.run_scenario({'spread_adjustment': -2.0 * 0.30})
        scenarios['distraction'] = {
            'label': 'Brady comments as DISTRACTION',
            'spread_delta': -2.0 * 0.30,
            'prediction': adj_distraction['adjusted'].get('composite', {})
        }

        return scenarios

    def weather_scenarios(self) -> dict:
        """Model different weather impacts."""
        scenarios = {}

        # Clear (baseline)
        scenarios['clear'] = {
            'label': 'Clear, 58F, light wind (baseline)',
            'spread_delta': 0.0,
            'prediction': self.get_baseline()['composite']
        }

        # Windy (15+ mph) - hurts passing, helps run-heavy SEA
        adj_wind = self.run_scenario({'spread_adjustment': -1.0 * 0.20})
        scenarios['windy'] = {
            'label': 'Windy (15+ mph)',
            'spread_delta': -1.0 * 0.20,
            'prediction': adj_wind['adjusted'].get('composite', {})
        }

        # Rain - hurts both passing games, helps run-heavy SEA more
        adj_rain = self.run_scenario({'spread_adjustment': -1.5 * 0.20})
        scenarios['rain'] = {
            'label': 'Rain',
            'spread_delta': -1.5 * 0.20,
            'prediction': adj_rain['adjusted'].get('composite', {})
        }

        return scenarios

    def sensitivity_analysis(self) -> dict:
        """
        Run all scenarios and produce tornado chart data.

        Returns dict of {variable: (low_spread, high_spread)} showing
        the range of predicted spread for each variable.
        """
        baseline = self.get_baseline()
        base_spread = baseline['composite']['predicted_spread']

        tornado_data = {}

        # Spillane
        spillane = self.spillane_scenarios()
        tornado_data['Spillane Health'] = (
            spillane['out']['prediction'].get('predicted_spread', base_spread),
            spillane['healthy_100pct']['prediction'].get('predicted_spread', base_spread)
        )

        # Landry
        landry = self.landry_scenarios()
        tornado_data['Landry Availability'] = (
            landry['inactive']['prediction'].get('predicted_spread', base_spread),
            landry['full']['prediction'].get('predicted_spread', base_spread)
        )

        # Maye shoulder
        maye = self.maye_shoulder_scenarios()
        tornado_data['Maye Shoulder'] = (
            maye['limited_80pct']['prediction'].get('predicted_spread', base_spread),
            maye['healthy_100pct']['prediction'].get('predicted_spread', base_spread)
        )

        # Brady
        brady = self.brady_motivation_scenario()
        tornado_data['Brady Controversy'] = (
            brady['distraction']['prediction'].get('predicted_spread', base_spread),
            brady['motivator']['prediction'].get('predicted_spread', base_spread)
        )

        # Weather
        weather = self.weather_scenarios()
        tornado_data['Weather'] = (
            weather['rain']['prediction'].get('predicted_spread', base_spread),
            weather['clear']['prediction'].get('predicted_spread', base_spread)
        )

        # Intangibles on/off
        adj_off = self.run_scenario({'spread_adjustment': -base_spread * 0.15})
        tornado_data['All Intangibles Off'] = (
            base_spread,
            adj_off['adjusted']['composite'].get('predicted_spread', base_spread)
        )

        return {
            'baseline_spread': base_spread,
            'tornado_data': tornado_data,
            'scenarios': {
                'spillane': spillane,
                'landry': landry,
                'maye': maye,
                'brady': brady,
                'weather': weather
            }
        }
