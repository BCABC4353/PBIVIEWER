"""
Intangibles Adjustment Model for Super Bowl LX Prediction.

Quantifies qualitative factors as numerical adjustments to statistical model
outputs. This is the "secret sauce" layer that accounts for factors that
pure stats cannot capture.

Categories and confidence weights:
- Injuries: 0.85 (high confidence — well-studied impact)
- Off-field distractions: 0.35 (low-moderate — hard to quantify but real)
- Momentum: 0.40 (moderate — some predictive value)
- Coaching: 0.50 (moderate — schemes matter)
- Historical/situational: 0.15 (low — narrative, not causal)
- Drake Curse: 0.05 (meme-tier, included for entertainment)
- Weather: 0.20 (low-moderate — depends on conditions)

Output: Point spread adjustment that gets applied to each statistical model's raw output.
"""

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class IntangiblesModel:
    """Model for quantifying qualitative/intangible factors."""

    def __init__(self, intangibles_data: dict = None, config_path: str = None):
        """Initialize with intangibles data dict or path to JSON config."""
        if intangibles_data:
            self.data = intangibles_data
        elif config_path:
            with open(config_path) as f:
                self.data = json.load(f)
        else:
            config = Path(__file__).parent.parent / 'config' / 'intangibles.json'
            if config.exists():
                with open(config) as f:
                    self.data = json.load(f)
            else:
                self.data = {}

        self.confidence_weights = self.data.get('confidence_weights', {
            'injuries': 0.85,
            'off_field': 0.35,
            'momentum': 0.40,
            'coaching': 0.50,
            'historical': 0.15,
            'drake_curse': 0.05,
            'weather': 0.20
        })

        self.breakdown = {}

    def calculate_adjustment(self) -> dict:
        """Calculate total intangibles adjustment.

        Returns dict with:
        - total_adjustment: float (positive favors NE, negative favors SEA)
        - weighted_adjustment: float (adjusted by confidence weights)
        - breakdown: dict of each factor's contribution
        - confidence: overall confidence in the adjustment
        """
        self.breakdown = {}

        # Injury adjustments
        ne_injury = self._calculate_injury_impact('patriots')
        sea_injury = self._calculate_injury_impact('seahawks')
        injury_diff = ne_injury - sea_injury  # Negative means NE more hurt
        injury_weighted = injury_diff * self.confidence_weights.get('injuries', 0.85)
        self.breakdown['injuries'] = {
            'ne_raw': ne_injury, 'sea_raw': sea_injury,
            'raw_adjustment': injury_diff,
            'weighted_adjustment': injury_weighted,
            'confidence': self.confidence_weights.get('injuries', 0.85),
            'description': f'NE injuries (Spillane/Landry/Maye) vs SEA (healthy)'
        }

        # Off-field adjustments
        ne_offfield = self._calculate_off_field_impact('patriots')
        sea_offfield = self._calculate_off_field_impact('seahawks')
        offfield_diff = ne_offfield - sea_offfield
        offfield_weighted = offfield_diff * self.confidence_weights.get('off_field', 0.35)
        self.breakdown['off_field'] = {
            'ne_raw': ne_offfield, 'sea_raw': sea_offfield,
            'raw_adjustment': offfield_diff,
            'weighted_adjustment': offfield_weighted,
            'confidence': self.confidence_weights.get('off_field', 0.35),
            'description': 'Diggs/Barmore legal issues, Brady controversy, Drake Curse'
        }

        # Momentum
        momentum_adj = self._calculate_momentum()
        momentum_weighted = momentum_adj * self.confidence_weights.get('momentum', 0.40)
        self.breakdown['momentum'] = {
            'raw_adjustment': momentum_adj,
            'weighted_adjustment': momentum_weighted,
            'confidence': self.confidence_weights.get('momentum', 0.40),
            'description': 'NE declining margins vs SEA offensive explosion'
        }

        # Coaching
        coaching_adj = self._calculate_coaching()
        coaching_weighted = coaching_adj * self.confidence_weights.get('coaching', 0.50)
        self.breakdown['coaching'] = {
            'raw_adjustment': coaching_adj,
            'weighted_adjustment': coaching_weighted,
            'confidence': self.confidence_weights.get('coaching', 0.50),
            'description': 'Vrabel (COY, SB experience) vs Macdonald (innovative defense)'
        }

        # Historical
        historical_adj = self._calculate_historical()
        historical_weighted = historical_adj * self.confidence_weights.get('historical', 0.15)
        self.breakdown['historical'] = {
            'raw_adjustment': historical_adj,
            'weighted_adjustment': historical_weighted,
            'confidence': self.confidence_weights.get('historical', 0.15),
            'description': 'SB XLIX rematch, NE franchise pedigree, neutral site'
        }

        # Weather
        weather_adj = self._calculate_weather()
        weather_weighted = weather_adj * self.confidence_weights.get('weather', 0.20)
        self.breakdown['weather'] = {
            'raw_adjustment': weather_adj,
            'weighted_adjustment': weather_weighted,
            'confidence': self.confidence_weights.get('weather', 0.20),
            'description': 'Clear, 58°F, 8 mph wind — minimal impact'
        }

        # Calculate totals
        total_raw = sum(v['raw_adjustment'] for v in self.breakdown.values())
        total_weighted = sum(v['weighted_adjustment'] for v in self.breakdown.values())

        # Overall confidence is weighted average of component confidences
        weights = [abs(v['weighted_adjustment']) for v in self.breakdown.values()]
        confidences = [v['confidence'] for v in self.breakdown.values()]
        if sum(weights) > 0:
            overall_confidence = sum(w * c for w, c in zip(weights, confidences)) / sum(weights)
        else:
            overall_confidence = 0.5

        return {
            'total_adjustment': total_raw,
            'weighted_adjustment': total_weighted,
            'breakdown': self.breakdown,
            'confidence': overall_confidence,
            'interpretation': self._interpret_adjustment(total_weighted)
        }

    def _calculate_injury_impact(self, team: str) -> float:
        """Sum injury impact scores for a team."""
        team_data = self.data.get(team, {})
        injuries = team_data.get('injuries', [])
        return sum(inj.get('impact_score', 0) for inj in injuries)

    def _calculate_off_field_impact(self, team: str) -> float:
        """Sum off-field distraction scores for a team."""
        team_data = self.data.get(team, {})
        off_field = team_data.get('off_field', [])
        return sum(item.get('impact_score', 0) for item in off_field)

    def _calculate_momentum(self) -> float:
        """Calculate momentum differential (positive = NE advantage)."""
        momentum = self.data.get('momentum', {})
        ne_momentum = momentum.get('patriots', {}).get('score', 0)
        sea_momentum = momentum.get('seahawks', {}).get('score', 0)
        return ne_momentum - sea_momentum

    def _calculate_coaching(self) -> float:
        """Calculate coaching edge (positive = NE advantage)."""
        coaching = self.data.get('coaching', {})
        ne_coaching = coaching.get('patriots', {}).get('score', 0)
        sea_coaching = coaching.get('seahawks', {}).get('score', 0)
        return ne_coaching - sea_coaching

    def _calculate_historical(self) -> float:
        """Calculate historical/situational factor adjustment."""
        historical = self.data.get('historical', {})
        total = 0
        for factor_data in historical.values():
            if isinstance(factor_data, dict):
                total += factor_data.get('impact_score', 0)
        return total

    def _calculate_weather(self) -> float:
        """Calculate weather impact."""
        weather = self.data.get('weather', {})
        return weather.get('impact_score', 0)

    def _interpret_adjustment(self, adjustment: float) -> str:
        """Generate human-readable interpretation of the adjustment."""
        if abs(adjustment) < 0.5:
            return "Intangibles are roughly neutral — no significant edge for either team."
        elif adjustment > 0:
            return f"Intangibles favor Patriots by {adjustment:.1f} points. However, confidence is moderate."
        else:
            return f"Intangibles favor Seahawks by {abs(adjustment):.1f} points, primarily driven by NE injury/distraction concerns."

    def get_scenario_adjustments(self) -> dict:
        """Return adjustment under different scenarios for sensitivity analysis."""
        base = self.calculate_adjustment()

        scenarios = {
            'base_case': base['weighted_adjustment'],
            'spillane_100pct': base['weighted_adjustment'] + 2.5 * 0.85,  # Remove injury penalty
            'spillane_out': base['weighted_adjustment'] - 2.0 * 0.85,  # Worse than questionable
            'landry_active': base['weighted_adjustment'] + 2.0 * 0.85,  # Partial return
            'brady_motivator': base['weighted_adjustment'] + 2.0 * 0.30,
            'brady_distraction': base['weighted_adjustment'] - 2.0 * 0.30,
            'no_drake_curse': base['weighted_adjustment'] + 1.0 * 0.05,
            'all_intangibles_off': 0.0
        }

        return scenarios
