"""
Value Finder - Compare model outputs to Vegas lines for Super Bowl LX
=====================================================================

Identifies betting value by comparing ensemble model predictions against
the published Vegas lines for Patriots vs Seahawks (SEA -4.5).

Value thresholds:
    - Spread: model must differ from Vegas by > 1.5 points
    - Total:  model must differ from Vegas by > 2.0 points
"""

import numpy as np
from typing import Dict, List, Optional, Any


class ValueFinder:
    """Compare model outputs to Vegas lines and identify betting value."""

    # Thresholds for declaring value exists
    SPREAD_VALUE_THRESHOLD = 1.5  # points
    TOTAL_VALUE_THRESHOLD = 2.0   # points

    # Confidence tiers based on model consensus
    CONFIDENCE_TIERS = {
        "high": 0.75,    # >= 75% of models agree on direction
        "medium": 0.60,  # >= 60% of models agree
        "low": 0.0,      # < 60% agree
    }

    def __init__(self, vegas_lines: Dict[str, Any]) -> None:
        """
        Initialize with current Vegas lines.

        Parameters
        ----------
        vegas_lines : dict
            Accepts either flat format (spread, total, moneyline_patriots, moneyline_seahawks)
            or nested format from vegas_lines.json (game.spread.line, game.total.over_under, etc.)
        """
        # Support nested JSON structure from config file
        if "game" in vegas_lines:
            game = vegas_lines["game"]
            spread_data = game.get("spread", {})
            self.vegas_spread = spread_data.get("line", spread_data) if isinstance(spread_data, dict) else spread_data
            total_data = game.get("total", {})
            self.vegas_total = total_data.get("over_under", total_data) if isinstance(total_data, dict) else total_data
            ml_data = game.get("moneyline", {})
            self.ml_patriots = ml_data.get("patriots", 175)
            self.ml_seahawks = ml_data.get("seahawks", -210)
        else:
            self.vegas_spread = vegas_lines.get("spread", -4.5)
            self.vegas_total = vegas_lines.get("total", 45.5)
            self.ml_patriots = vegas_lines.get("moneyline_patriots", 175)
            self.ml_seahawks = vegas_lines.get("moneyline_seahawks", -210)

        # Pre-compute implied probabilities from moneylines (with vig)
        self.implied_prob_patriots = self._moneyline_to_implied_prob(self.ml_patriots)
        self.implied_prob_seahawks = self._moneyline_to_implied_prob(self.ml_seahawks)

        # Remove vig to get no-vig probabilities
        total_implied = self.implied_prob_patriots + self.implied_prob_seahawks
        self.nv_prob_patriots = self.implied_prob_patriots / total_implied
        self.nv_prob_seahawks = self.implied_prob_seahawks / total_implied

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def find_spread_value(self, model_predictions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Compare each model's predicted spread to the Vegas spread (-4.5 SEA).

        Parameters
        ----------
        model_predictions : list of dict
            Each dict has at minimum:
                model_name       : str
                predicted_spread : float  (negative = SEA favored)

        Returns
        -------
        dict with:
            vegas_spread      : float
            model_spreads     : dict mapping model_name -> predicted_spread
            consensus_spread  : float   (mean of all model spreads)
            median_spread     : float
            edge              : float   (consensus minus vegas; positive = value on NE side)
            abs_edge          : float
            direction         : str     ("patriots" or "seahawks" or "no_value")
            confidence        : str     ("high", "medium", "low")
            value_exists      : bool
            recommended_action: str
            model_agreement   : float   (fraction of models agreeing on direction)
        """
        spreads = np.array([p["predicted_spread"] for p in model_predictions])
        model_names = [p.get("model_name", f"model_{i}") for i, p in enumerate(model_predictions)]

        consensus_spread = float(np.mean(spreads))
        median_spread = float(np.median(spreads))
        edge = consensus_spread - self.vegas_spread  # positive means models say NE does better than Vegas thinks

        # Direction of value
        if edge > 0:
            # Models say spread should be less negative (or positive) => NE covers / NE side value
            direction_models = spreads > self.vegas_spread
            direction = "patriots"
            recommended_side = "NE +4.5"
        elif edge < 0:
            # Models say spread should be more negative => SEA covers
            direction_models = spreads < self.vegas_spread
            direction = "seahawks"
            recommended_side = "SEA -4.5"
        else:
            direction_models = np.ones(len(spreads), dtype=bool)
            direction = "no_value"
            recommended_side = "no bet"

        agreement = float(np.mean(direction_models))
        confidence = self._compute_confidence(agreement)
        value_exists = abs(edge) > self.SPREAD_VALUE_THRESHOLD

        if value_exists and confidence in ("high", "medium"):
            action = f"BET {recommended_side} (edge {abs(edge):.1f} pts, {confidence} confidence)"
        elif value_exists:
            action = f"LEAN {recommended_side} (edge {abs(edge):.1f} pts, low confidence - models disagree)"
        else:
            action = f"PASS - edge {abs(edge):.1f} pts below {self.SPREAD_VALUE_THRESHOLD} threshold"

        return {
            "vegas_spread": self.vegas_spread,
            "model_spreads": dict(zip(model_names, [float(s) for s in spreads])),
            "consensus_spread": round(consensus_spread, 2),
            "median_spread": round(median_spread, 2),
            "edge": round(edge, 2),
            "abs_edge": round(abs(edge), 2),
            "direction": direction,
            "confidence": confidence,
            "value_exists": value_exists,
            "recommended_action": action,
            "model_agreement": round(agreement, 3),
        }

    def find_total_value(self, model_predictions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Compare each model's predicted total to the Vegas over/under.

        Parameters
        ----------
        model_predictions : list of dict
            Each dict has at minimum:
                model_name      : str
                predicted_total : float

        Returns
        -------
        dict with:
            vegas_total       : float
            model_totals      : dict mapping model_name -> predicted_total
            consensus_total   : float
            median_total      : float
            edge              : float   (positive = models predict higher scoring)
            abs_edge          : float
            direction         : str     ("over" or "under" or "no_value")
            confidence        : str
            value_exists      : bool
            recommended_action: str
            model_agreement   : float
        """
        totals = np.array([p["predicted_total"] for p in model_predictions])
        model_names = [p.get("model_name", f"model_{i}") for i, p in enumerate(model_predictions)]

        consensus_total = float(np.mean(totals))
        median_total = float(np.median(totals))
        edge = consensus_total - self.vegas_total

        if edge > 0:
            direction_models = totals > self.vegas_total
            direction = "over"
            recommended_side = f"OVER {self.vegas_total}"
        elif edge < 0:
            direction_models = totals < self.vegas_total
            direction = "under"
            recommended_side = f"UNDER {self.vegas_total}"
        else:
            direction_models = np.ones(len(totals), dtype=bool)
            direction = "no_value"
            recommended_side = "no bet"

        agreement = float(np.mean(direction_models))
        confidence = self._compute_confidence(agreement)
        value_exists = abs(edge) > self.TOTAL_VALUE_THRESHOLD

        if value_exists and confidence in ("high", "medium"):
            action = f"BET {recommended_side} (edge {abs(edge):.1f} pts, {confidence} confidence)"
        elif value_exists:
            action = f"LEAN {recommended_side} (edge {abs(edge):.1f} pts, low confidence - models disagree)"
        else:
            action = f"PASS - edge {abs(edge):.1f} pts below {self.TOTAL_VALUE_THRESHOLD} threshold"

        return {
            "vegas_total": self.vegas_total,
            "model_totals": dict(zip(model_names, [float(t) for t in totals])),
            "consensus_total": round(consensus_total, 2),
            "median_total": round(median_total, 2),
            "edge": round(edge, 2),
            "abs_edge": round(abs(edge), 2),
            "direction": direction,
            "confidence": confidence,
            "value_exists": value_exists,
            "recommended_action": action,
            "model_agreement": round(agreement, 3),
        }

    def find_moneyline_value(self, model_predictions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Compare model-implied win probabilities to Vegas moneyline implied probs.

        Parameters
        ----------
        model_predictions : list of dict
            Each dict has at minimum:
                model_name        : str
                patriots_win_prob : float (0-1)
                seahawks_win_prob : float (0-1)

        Returns
        -------
        dict with:
            vegas_implied_patriots    : float  (no-vig probability)
            vegas_implied_seahawks    : float
            model_prob_patriots       : float  (consensus)
            model_prob_seahawks       : float
            patriots_edge             : float  (model prob - vegas prob)
            seahawks_edge             : float
            value_side                : str    ("patriots", "seahawks", or "no_value")
            confidence                : str
            patriots_ev_per_dollar    : float  (expected value of $1 bet)
            seahawks_ev_per_dollar    : float
            kelly_patriots            : float  (Kelly criterion fraction)
            kelly_seahawks            : float
            recommended_action        : str
        """
        ne_probs = np.array([p["patriots_win_prob"] for p in model_predictions])
        sea_probs = np.array([p["seahawks_win_prob"] for p in model_predictions])

        model_prob_ne = float(np.mean(ne_probs))
        model_prob_sea = float(np.mean(sea_probs))

        ne_edge = model_prob_ne - self.nv_prob_patriots
        sea_edge = model_prob_sea - self.nv_prob_seahawks

        # Decimal odds from moneyline
        ne_decimal_odds = self._moneyline_to_decimal(self.ml_patriots)
        sea_decimal_odds = self._moneyline_to_decimal(self.ml_seahawks)

        # Expected value per dollar wagered
        ne_ev = model_prob_ne * (ne_decimal_odds - 1) - (1 - model_prob_ne)
        sea_ev = model_prob_sea * (sea_decimal_odds - 1) - (1 - model_prob_sea)

        # Kelly criterion for each side
        kelly_ne = self.calculate_kelly_criterion(ne_edge, ne_decimal_odds)
        kelly_sea = self.calculate_kelly_criterion(sea_edge, sea_decimal_odds)

        # Determine which side has more value
        if ne_ev > sea_ev and ne_ev > 0:
            value_side = "patriots"
            action = (f"BET NE ML ({self.ml_patriots:+d}): "
                      f"model {model_prob_ne:.1%} vs vegas {self.nv_prob_patriots:.1%}, "
                      f"EV ${ne_ev:.3f} per $1, Kelly {kelly_ne:.1%}")
        elif sea_ev > 0:
            value_side = "seahawks"
            action = (f"BET SEA ML ({self.ml_seahawks:+d}): "
                      f"model {model_prob_sea:.1%} vs vegas {self.nv_prob_seahawks:.1%}, "
                      f"EV ${sea_ev:.3f} per $1, Kelly {kelly_sea:.1%}")
        else:
            value_side = "no_value"
            action = "PASS - no positive EV on either moneyline"

        # Confidence based on how many models agree on the value side
        if value_side == "patriots":
            agreement = float(np.mean(ne_probs > self.nv_prob_patriots))
        elif value_side == "seahawks":
            agreement = float(np.mean(sea_probs > self.nv_prob_seahawks))
        else:
            agreement = 0.0
        confidence = self._compute_confidence(agreement)

        return {
            "vegas_implied_patriots": round(self.nv_prob_patriots, 4),
            "vegas_implied_seahawks": round(self.nv_prob_seahawks, 4),
            "model_prob_patriots": round(model_prob_ne, 4),
            "model_prob_seahawks": round(model_prob_sea, 4),
            "patriots_edge": round(ne_edge, 4),
            "seahawks_edge": round(sea_edge, 4),
            "value_side": value_side,
            "confidence": confidence,
            "patriots_ev_per_dollar": round(ne_ev, 4),
            "seahawks_ev_per_dollar": round(sea_ev, 4),
            "kelly_patriots": round(kelly_ne, 4),
            "kelly_seahawks": round(kelly_sea, 4),
            "recommended_action": action,
        }

    def calculate_kelly_criterion(self, edge: float, decimal_odds: float) -> float:
        """
        Calculate optimal bet sizing using the Kelly Criterion.

        Kelly fraction = (bp - q) / b
        where:
            b = decimal odds - 1 (net fractional odds)
            p = true probability of winning (implied by model)
            q = 1 - p

        Parameters
        ----------
        edge : float
            Difference between model probability and implied probability.
            Model prob = implied_prob + edge.
        decimal_odds : float
            Decimal odds for the bet (e.g., 2.75 means you get $2.75 back
            on a $1 wager including the original stake).

        Returns
        -------
        float
            Recommended fraction of bankroll to wager.
            Returns 0 if edge is not positive.
            Capped at 0.25 (quarter-Kelly is a common risk-adjusted max).
        """
        if decimal_odds <= 1.0:
            return 0.0

        b = decimal_odds - 1.0  # net payout per dollar wagered
        implied_prob = 1.0 / decimal_odds
        p = implied_prob + edge  # model's true probability

        # Clamp probability to valid range
        p = np.clip(p, 0.0, 1.0)
        q = 1.0 - p

        if b <= 0:
            return 0.0

        kelly = (b * p - q) / b

        # Only recommend a bet when Kelly is positive
        if kelly <= 0:
            return 0.0

        # Cap at quarter-Kelly for risk management
        quarter_kelly = kelly * 0.25
        return float(min(quarter_kelly, 0.25))

    def generate_value_report(self, all_model_predictions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Generate a comprehensive value assessment across spread, total, and moneyline.

        Parameters
        ----------
        all_model_predictions : list of dict
            Each dict represents one model's full output:
                model_name        : str
                predicted_spread  : float
                predicted_total   : float
                patriots_win_prob : float
                seahawks_win_prob : float

        Returns
        -------
        dict with:
            spread_analysis    : dict (from find_spread_value)
            total_analysis     : dict (from find_total_value)
            moneyline_analysis : dict (from find_moneyline_value)
            best_bet           : dict (single highest-value opportunity)
            value_bets         : list of dict (all bets with positive value)
            summary            : str  (human-readable summary)
            model_count        : int
            timestamp_note     : str
        """
        spread_analysis = self.find_spread_value(all_model_predictions)
        total_analysis = self.find_total_value(all_model_predictions)
        ml_analysis = self.find_moneyline_value(all_model_predictions)

        # Collect all value bets
        value_bets = []

        if spread_analysis["value_exists"]:
            value_bets.append({
                "market": "spread",
                "direction": spread_analysis["direction"],
                "edge": spread_analysis["abs_edge"],
                "confidence": spread_analysis["confidence"],
                "recommended_action": spread_analysis["recommended_action"],
                "score": self._value_score(spread_analysis["abs_edge"],
                                           spread_analysis["confidence"],
                                           spread_analysis["model_agreement"]),
            })

        if total_analysis["value_exists"]:
            value_bets.append({
                "market": "total",
                "direction": total_analysis["direction"],
                "edge": total_analysis["abs_edge"],
                "confidence": total_analysis["confidence"],
                "recommended_action": total_analysis["recommended_action"],
                "score": self._value_score(total_analysis["abs_edge"],
                                           total_analysis["confidence"],
                                           total_analysis["model_agreement"]),
            })

        # Moneyline value exists if either side has positive EV
        if ml_analysis["value_side"] != "no_value":
            ml_edge = max(ml_analysis["patriots_edge"], ml_analysis["seahawks_edge"])
            value_bets.append({
                "market": "moneyline",
                "direction": ml_analysis["value_side"],
                "edge": round(ml_edge, 4),
                "confidence": ml_analysis["confidence"],
                "recommended_action": ml_analysis["recommended_action"],
                "score": self._value_score(ml_edge * 10,  # scale probability edge to ~point scale
                                           ml_analysis["confidence"],
                                           0.7),  # default agreement proxy
            })

        # Sort value bets by composite score
        value_bets.sort(key=lambda x: x["score"], reverse=True)

        best_bet = value_bets[0] if value_bets else {
            "market": "none",
            "direction": "no_value",
            "edge": 0.0,
            "confidence": "low",
            "recommended_action": "PASS - no value identified in any market",
            "score": 0.0,
        }

        # Build human-readable summary
        summary_lines = [
            "=" * 60,
            "  SUPER BOWL LX VALUE REPORT",
            "  Patriots vs Seahawks | SEA -4.5",
            "=" * 60,
            "",
            f"  Models consulted: {len(all_model_predictions)}",
            "",
            "  SPREAD ANALYSIS:",
            f"    Vegas:     SEA {self.vegas_spread}",
            f"    Consensus: SEA {spread_analysis['consensus_spread']}",
            f"    Edge:      {spread_analysis['edge']:+.1f} pts ({spread_analysis['direction']})",
            f"    Value:     {'YES' if spread_analysis['value_exists'] else 'NO'}"
            f" | Confidence: {spread_analysis['confidence']}",
            f"    Action:    {spread_analysis['recommended_action']}",
            "",
            "  TOTAL ANALYSIS:",
            f"    Vegas:     {self.vegas_total}",
            f"    Consensus: {total_analysis['consensus_total']}",
            f"    Edge:      {total_analysis['edge']:+.1f} pts ({total_analysis['direction']})",
            f"    Value:     {'YES' if total_analysis['value_exists'] else 'NO'}"
            f" | Confidence: {total_analysis['confidence']}",
            f"    Action:    {total_analysis['recommended_action']}",
            "",
            "  MONEYLINE ANALYSIS:",
            f"    NE model prob:  {ml_analysis['model_prob_patriots']:.1%}"
            f"  (vegas {ml_analysis['vegas_implied_patriots']:.1%})",
            f"    SEA model prob: {ml_analysis['model_prob_seahawks']:.1%}"
            f"  (vegas {ml_analysis['vegas_implied_seahawks']:.1%})",
            f"    Value side:     {ml_analysis['value_side']}",
            f"    Action:         {ml_analysis['recommended_action']}",
            "",
            "  BEST BET:",
            f"    {best_bet['recommended_action']}",
            "",
            "=" * 60,
        ]
        summary = "\n".join(summary_lines)

        return {
            "spread_analysis": spread_analysis,
            "total_analysis": total_analysis,
            "moneyline_analysis": ml_analysis,
            "best_bet": best_bet,
            "value_bets": value_bets,
            "summary": summary,
            "model_count": len(all_model_predictions),
            "timestamp_note": "Lines current as of analysis run time; re-check before placing any wager.",
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _moneyline_to_implied_prob(moneyline: int) -> float:
        """Convert an American moneyline to an implied probability (includes vig)."""
        if moneyline > 0:
            return 100.0 / (moneyline + 100.0)
        else:
            return abs(moneyline) / (abs(moneyline) + 100.0)

    @staticmethod
    def _moneyline_to_decimal(moneyline: int) -> float:
        """Convert an American moneyline to decimal (European) odds."""
        if moneyline > 0:
            return (moneyline / 100.0) + 1.0
        else:
            return (100.0 / abs(moneyline)) + 1.0

    def _compute_confidence(self, agreement: float) -> str:
        """Map model agreement fraction to a confidence tier."""
        if agreement >= self.CONFIDENCE_TIERS["high"]:
            return "high"
        elif agreement >= self.CONFIDENCE_TIERS["medium"]:
            return "medium"
        else:
            return "low"

    @staticmethod
    def _value_score(edge: float, confidence: str, agreement: float) -> float:
        """
        Composite score combining edge magnitude, confidence tier, and agreement.

        Used to rank value opportunities.
        """
        conf_multiplier = {"high": 1.0, "medium": 0.7, "low": 0.4}.get(confidence, 0.4)
        return round(edge * conf_multiplier * agreement, 4)
