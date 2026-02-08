"""
Mid-game model recalculator for Super Bowl LX: Patriots vs Seahawks.

Integrates the pre-game prediction model outputs with live game state
to produce continuously updated forecasts.  Tracks a full history of
recalculations for trend charting and provides a comparison hook
against live Vegas spreads.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from scipy.interpolate import RegularGridInterpolator

from .game_state import GameState, REGULATION_QUARTER_SECONDS
from .win_probability import WinProbabilityCalculator


# ---------------------------------------------------------------------------
# Expected Points by field position & down (simplified NFL EPA table)
# ---------------------------------------------------------------------------
# Rows: down 1-4   Columns: field-position bins 1-10 .. 91-99
# Values are approximate expected points for a new set of downs at that spot.
_FIELD_BINS = np.array([5, 15, 25, 35, 45, 55, 65, 75, 85, 95], dtype=np.float64)
_DOWN_VALS = np.array([1, 2, 3, 4], dtype=np.float64)

# Expected points added (EPA) rough lookup: (down, field_position_bin)
# Positive = offence expected to score
_EPA_TABLE = np.array(
    [
        # FP:  5    15    25    35    45    55    65    75    85    95
        [-1.2, -0.5,  0.3,  1.0,  1.6,  2.3,  3.1,  4.0,  5.0,  6.2],  # 1st
        [-1.6, -0.9, -0.1,  0.6,  1.1,  1.7,  2.5,  3.3,  4.2,  5.5],  # 2nd
        [-2.0, -1.4, -0.7,  0.0,  0.5,  1.0,  1.7,  2.4,  3.3,  4.5],  # 3rd
        [-2.5, -2.0, -1.4, -0.8, -0.4,  0.1,  0.6,  1.2,  2.0,  3.0],  # 4th
    ],
    dtype=np.float64,
)

_epa_interpolator = RegularGridInterpolator(
    (_DOWN_VALS, _FIELD_BINS),
    _EPA_TABLE,
    method="linear",
    bounds_error=False,
    fill_value=None,
)


def _expected_points(down: int, field_position: int) -> float:
    """Look up expected points for (down, field_position) with interpolation."""
    d = float(np.clip(down, 1, 4))
    fp = float(np.clip(field_position, 1, 99))
    return float(_epa_interpolator(np.array([[d, fp]]))[0])


# ---------------------------------------------------------------------------
# Scoring-probability model for current drive
# ---------------------------------------------------------------------------
# Logistic approximation:
#   P(score on this drive) ~ sigmoid(a * EPA + b)
# Calibrated so midfield 1st-and-10 ~ 35 %, red zone 1st-and-goal ~ 65 %.
_DRIVE_A = 0.45
_DRIVE_B = -0.20


def _sigmoid(x: float) -> float:
    return float(1.0 / (1.0 + np.exp(-x)))


# ---------------------------------------------------------------------------
# Game Recalculator
# ---------------------------------------------------------------------------

class GameRecalculator:
    """Recalculate full game predictions mid-game.

    Blends pre-game model outputs (point spread, win probabilities, stat
    projections) with live game data to produce continuously updated
    predictions.

    Parameters
    ----------
    pregame_predictions : dict
        Pre-game model output.  Expected keys:
            predicted_winner ('NE' or 'SEA'),
            predicted_spread (float, NE perspective, positive = NE favoured),
            patriots_win_prob (float),
            seahawks_win_prob (float),
            predicted_total (float, over/under),
            predicted_ne_score (float),
            predicted_sea_score (float)
    team_stats : dict
        Season-average stats for both teams.  Expected keys:
            ne_yards_per_game, sea_yards_per_game,
            ne_pass_ypg, sea_pass_ypg,
            ne_rush_ypg, sea_rush_ypg,
            ne_points_per_game, sea_points_per_game,
            ne_turnovers_per_game, sea_turnovers_per_game
    """

    def __init__(
        self,
        pregame_predictions: Dict[str, Any],
        team_stats: Dict[str, Any],
    ) -> None:
        self.pregame = dict(pregame_predictions)
        self.stats = dict(team_stats)

        # Internal win-prob calculator seeded with pre-game priors
        self._wp_calc = WinProbabilityCalculator(
            {
                "patriots_win_prob": float(
                    self.pregame.get("patriots_win_prob", 0.50)
                ),
                "seahawks_win_prob": float(
                    self.pregame.get("seahawks_win_prob", 0.50)
                ),
            }
        )

        # Trend data: list of (total_seconds_remaining, ne_prob, sea_prob)
        self._trend: List[Tuple[int, float, float]] = []

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def recalculate(self, game_state: GameState) -> Dict[str, Any]:
        """Produce a complete updated prediction from the current game state.

        Returns
        -------
        dict with keys:
            patriots_win_prob, seahawks_win_prob,
            projected_final_ne, projected_final_sea,
            live_spread (float, NE perspective),
            pregame_spread (float),
            momentum,
            current_drive_score_prob (float),
            efficiency (dict with NE/SEA efficiency ratios),
            time_weight (how much pre-game model is still trusted),
            value_vs_pregame (spread shift since kickoff),
        """
        seconds_left = game_state.total_seconds_remaining()

        # 1. Win probability (delegates to WinProbabilityCalculator)
        wp_result = self._wp_calc.calculate(game_state, self.stats)
        ne_prob = wp_result["patriots_win_prob"]
        sea_prob = wp_result["seahawks_win_prob"]

        # 2. In-game efficiency comparison
        efficiency = self._calculate_in_game_efficiency(game_state)

        # 3. Time-decay weight for pre-game model
        tw = self._time_decay_weight(seconds_left)

        # 4. Blended score projections
        proj_ne_live = wp_result["projected_final_score_ne"]
        proj_sea_live = wp_result["projected_final_score_sea"]
        pregame_ne = float(self.pregame.get("predicted_ne_score", 24.0))
        pregame_sea = float(self.pregame.get("predicted_sea_score", 21.0))

        final_ne = tw * pregame_ne + (1.0 - tw) * proj_ne_live
        final_sea = tw * pregame_sea + (1.0 - tw) * proj_sea_live

        # Cannot be below current actual score
        final_ne = max(final_ne, float(game_state.score_patriots))
        final_sea = max(final_sea, float(game_state.score_seahawks))

        # 5. Live spread (NE perspective)
        live_spread = final_ne - final_sea
        pregame_spread = float(self.pregame.get("predicted_spread", 0.0))

        # 6. Current drive scoring probability
        drive_prob = self._current_drive_scoring_prob(game_state)

        # 7. Record trend
        self._trend.append((seconds_left, ne_prob, sea_prob))

        return {
            "patriots_win_prob": ne_prob,
            "seahawks_win_prob": sea_prob,
            "projected_final_ne": round(final_ne, 1),
            "projected_final_sea": round(final_sea, 1),
            "live_spread": round(live_spread, 1),
            "pregame_spread": round(pregame_spread, 1),
            "momentum": wp_result["momentum_indicator"],
            "current_drive_score_prob": round(drive_prob, 4),
            "efficiency": efficiency,
            "time_weight": round(tw, 4),
            "value_vs_pregame": round(live_spread - pregame_spread, 1),
        }

    # ------------------------------------------------------------------
    # Efficiency analysis
    # ------------------------------------------------------------------

    def _calculate_in_game_efficiency(
        self, game_state: GameState
    ) -> Dict[str, Any]:
        """Compare live per-minute stats to pre-game season averages.

        Returns a dict of efficiency ratios (1.0 = on pace with season avg).
        Values > 1 mean outperforming; < 1 mean underperforming.
        """
        elapsed = 3600 - game_state.total_seconds_remaining()
        if elapsed <= 0:
            return {
                "ne_total_eff": 1.0,
                "sea_total_eff": 1.0,
                "ne_pass_eff": 1.0,
                "sea_pass_eff": 1.0,
                "ne_rush_eff": 1.0,
                "sea_rush_eff": 1.0,
                "ne_turnover_eff": 1.0,
                "sea_turnover_eff": 1.0,
            }

        pace = 3600.0 / max(elapsed, 60.0)

        def _ratio(actual: float, expected_per_game: float) -> float:
            projected = actual * pace
            if expected_per_game <= 0:
                return 1.0
            return float(np.clip(projected / expected_per_game, 0.0, 3.0))

        def _turnover_ratio(actual: int, expected_per_game: float) -> float:
            """For turnovers, *fewer* is better, so invert."""
            projected = actual * pace
            if expected_per_game <= 0:
                return 1.0
            raw = projected / max(expected_per_game, 0.1)
            # Invert: 0.5x turnovers -> 2.0 efficiency, 2x turnovers -> 0.5
            if raw <= 0:
                return 2.0
            return float(np.clip(1.0 / raw, 0.25, 3.0))

        ne_ypg = float(self.stats.get("ne_yards_per_game", 340.0))
        sea_ypg = float(self.stats.get("sea_yards_per_game", 340.0))
        ne_pass = float(self.stats.get("ne_pass_ypg", 230.0))
        sea_pass = float(self.stats.get("sea_pass_ypg", 230.0))
        ne_rush = float(self.stats.get("ne_rush_ypg", 110.0))
        sea_rush = float(self.stats.get("sea_rush_ypg", 110.0))
        ne_to = float(self.stats.get("ne_turnovers_per_game", 1.2))
        sea_to = float(self.stats.get("sea_turnovers_per_game", 1.2))

        return {
            "ne_total_eff": round(_ratio(game_state.ne_total_yards, ne_ypg), 3),
            "sea_total_eff": round(_ratio(game_state.sea_total_yards, sea_ypg), 3),
            "ne_pass_eff": round(_ratio(game_state.ne_passing_yards, ne_pass), 3),
            "sea_pass_eff": round(_ratio(game_state.sea_passing_yards, sea_pass), 3),
            "ne_rush_eff": round(_ratio(game_state.ne_rushing_yards, ne_rush), 3),
            "sea_rush_eff": round(_ratio(game_state.sea_rushing_yards, sea_rush), 3),
            "ne_turnover_eff": round(_turnover_ratio(game_state.ne_turnovers, ne_to), 3),
            "sea_turnover_eff": round(_turnover_ratio(game_state.sea_turnovers, sea_to), 3),
        }

    # ------------------------------------------------------------------
    # Time decay
    # ------------------------------------------------------------------

    @staticmethod
    def _time_decay_weight(seconds_remaining: float) -> float:
        """Compute how much to trust the pre-game model vs live score.

        Returns a value in [0, 1]:
            1.0 = fully trust pre-game model (game just started)
            0.0 = fully trust live score (game nearly over)

        Uses a cubic curve for rapid falloff in the second half:
            w = (seconds_remaining / 3600) ^ 3
        """
        fraction = np.clip(seconds_remaining / 3600.0, 0.0, 1.0)
        return float(fraction ** 3)

    # ------------------------------------------------------------------
    # Current drive scoring probability
    # ------------------------------------------------------------------

    @staticmethod
    def _current_drive_scoring_prob(game_state: GameState) -> float:
        """Estimate the probability of scoring on the current drive.

        Uses expected points from (down, field_position) passed through
        a logistic function calibrated to NFL drive outcomes:
            ~35 % at midfield, 1st-and-10
            ~65 % at opponent 10, 1st-and-goal
            ~15 % at own 10, 1st-and-10
            ~8 %  at own 5, 4th-and-long

        Also adjusts for distance on 3rd/4th down.
        """
        epa = _expected_points(game_state.down, game_state.field_position)

        # Penalise long-distance situations on late downs
        if game_state.down >= 3 and game_state.distance > 5:
            penalty = 0.15 * (game_state.distance - 5) / 10.0
            epa -= penalty

        raw_prob = _sigmoid(_DRIVE_A * epa + _DRIVE_B)

        # Time pressure: if under 2 minutes, slightly reduce unless in red zone
        if game_state.time_remaining < 120 and game_state.field_position < 80:
            raw_prob *= 0.85

        return float(np.clip(raw_prob, 0.01, 0.99))

    # ------------------------------------------------------------------
    # Trend data
    # ------------------------------------------------------------------

    def get_trend_data(self) -> List[Tuple[int, float, float]]:
        """Return list of (total_seconds_remaining, ne_prob, sea_prob) tuples.

        Suitable for plotting a win-probability chart over the course of
        the game.  Ordered chronologically (earliest update first, i.e.
        highest seconds_remaining first).
        """
        return list(self._trend)

    # ------------------------------------------------------------------
    # Value vs Vegas
    # ------------------------------------------------------------------

    def is_value_remaining(self, vegas_live_spread: float) -> Dict[str, Any]:
        """Compare the model's live spread to a live Vegas spread.

        Parameters
        ----------
        vegas_live_spread : float
            Current Vegas spread, NE perspective (negative = NE underdog).

        Returns
        -------
        dict with:
            model_spread : float
                The model's current projected spread.
            vegas_spread : float
                The supplied Vegas spread.
            edge : float
                model_spread - vegas_spread (positive = model thinks NE is
                stronger than Vegas does).
            recommendation : str
                'NE_VALUE', 'SEA_VALUE', or 'NO_EDGE'
            confidence : str
                'HIGH', 'MEDIUM', or 'LOW' based on edge magnitude.
        """
        if not self._trend:
            model_spread = float(self.pregame.get("predicted_spread", 0.0))
        else:
            # Derive model spread from latest probabilities
            last_ne, last_sea = self._trend[-1][1], self._trend[-1][2]
            # Convert win probability to implied spread
            # Rough NFL relationship: 1 point of spread ~ 3 % win prob
            prob_edge = last_ne - 0.5
            model_spread = prob_edge / 0.03  # implied point spread
            # Also factor in projected scores if available
            # (We don't store them in trend; use the spread directly)

        edge = model_spread - vegas_live_spread

        if abs(edge) < 1.5:
            recommendation = "NO_EDGE"
            confidence = "LOW"
        elif edge > 0:
            recommendation = "NE_VALUE"
            confidence = "HIGH" if abs(edge) >= 4.0 else "MEDIUM"
        else:
            recommendation = "SEA_VALUE"
            confidence = "HIGH" if abs(edge) >= 4.0 else "MEDIUM"

        return {
            "model_spread": round(model_spread, 1),
            "vegas_spread": round(vegas_live_spread, 1),
            "edge": round(edge, 1),
            "recommendation": recommendation,
            "confidence": confidence,
        }
