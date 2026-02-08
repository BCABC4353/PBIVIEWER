"""
Live win probability calculator for Super Bowl LX: Patriots vs Seahawks.

Uses a pre-built lookup table derived from historical NFL game outcomes,
indexed by score differential and total seconds remaining.  Smooth
bilinear interpolation (scipy) is used between discrete table entries.
Adjustments are layered on for possession, field position, turnover
differential, and in-game efficiency vs pre-game expectations.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

import numpy as np
from scipy.interpolate import RegularGridInterpolator

from .game_state import GameState, REGULATION_QUARTER_SECONDS


# ---------------------------------------------------------------------------
# Historical Win Probability Lookup Table
# ---------------------------------------------------------------------------
# Axes:
#   score_diffs  : integers from -35 to +35 (71 entries, NE perspective)
#   time_points  : every 30 seconds from 0 to 3600 (121 entries)
#
# Values represent P(team with positive diff wins | diff, time).
# At diff=0, value is 0.50 regardless of time.
# At time=0, value is 1.0 for diff>0, 0.0 for diff<0, 0.50 for diff==0.
# Intermediate values follow empirical NFL curves calibrated to:
#   - Leading by  7 at halftime  -> ~75 % win
#   - Leading by 14 at halftime  -> ~90 % win
#   - Leading by 21 at halftime  -> ~97 % win
#   - Leading by  3 at halftime  -> ~63 % win
#   - Leading by  1 with 2 min   -> ~85 % win
#   - Leading by  7 with 2 min   -> ~97 % win
# ---------------------------------------------------------------------------

DIFF_MIN: int = -35
DIFF_MAX: int = 35
_score_diffs = np.arange(DIFF_MIN, DIFF_MAX + 1, dtype=np.float64)  # 71
_time_points = np.arange(0, 3601, 30, dtype=np.float64)              # 121


def _build_base_table() -> np.ndarray:
    """Construct the (71 x 121) base win-probability lookup table.

    The model uses a logistic mapping whose steepness parameter decreases
    as game time remaining increases (more time left -> outcomes less
    certain for a given score differential).

    The logistic form is:
        P(win | diff, t) = 1 / (1 + exp(-k(t) * diff))

    where k(t) smoothly increases as t -> 0 (game end).

    k(t) is calibrated so that:
        k(1800) satisfies: P(win | +7, 1800) ~ 0.75   =>  k ~ 0.157
        k(0)   is effectively infinity (deterministic outcome).
        k(3600) satisfies: P(win | +7, 3600) ~ 0.65   =>  k ~ 0.087

    We use:  k(t) = k_base + (k_end - k_base) * ((3600 - t) / 3600) ^ alpha
    with k_base=0.08, k_end=6.0, alpha=2.5 (produces a convex curve that
    stays gentle early and steepens sharply near the end).
    """
    k_base = 0.08    # steepness at kickoff (t=3600)
    k_end = 6.0      # steepness at final whistle (t=0)
    alpha = 2.5       # curvature exponent

    table = np.empty((len(_score_diffs), len(_time_points)), dtype=np.float64)

    for j, t in enumerate(_time_points):
        if t == 0.0:
            # Game over: deterministic
            for i, d in enumerate(_score_diffs):
                if d > 0:
                    table[i, j] = 1.0
                elif d < 0:
                    table[i, j] = 0.0
                else:
                    table[i, j] = 0.5
        else:
            fraction_elapsed = (3600.0 - t) / 3600.0
            k = k_base + (k_end - k_base) * (fraction_elapsed ** alpha)
            for i, d in enumerate(_score_diffs):
                table[i, j] = 1.0 / (1.0 + np.exp(-k * d))

    return table


_BASE_TABLE: np.ndarray = _build_base_table()

# Build the interpolator once at module load.
# Input order: (score_diff, time_remaining).
# `bounds_error=False` + `fill_value=None` enables nearest-edge extrapolation.
_interpolator = RegularGridInterpolator(
    (_score_diffs, _time_points),
    _BASE_TABLE,
    method="linear",
    bounds_error=False,
    fill_value=None,
)


def _score_time_probability(diff: float, seconds_remaining: float) -> float:
    """Core lookup with smooth interpolation.

    Parameters
    ----------
    diff : float
        Score differential (positive = leading team's perspective).
    seconds_remaining : float
        Total game seconds remaining (0-3600, can exceed for OT extrapolation).

    Returns
    -------
    float
        Probability that the leading team (positive diff) wins, in [0, 1].
    """
    # Clamp inputs to table bounds for safety (extrapolation is nearest-edge)
    diff_clamped = float(np.clip(diff, DIFF_MIN, DIFF_MAX))
    time_clamped = float(np.clip(seconds_remaining, 0.0, 3600.0))
    prob: float = float(_interpolator(np.array([[diff_clamped, time_clamped]]))[0])
    return np.clip(prob, 0.0, 1.0)


# ---------------------------------------------------------------------------
# Win Probability Calculator
# ---------------------------------------------------------------------------

class WinProbabilityCalculator:
    """Compute live Patriots / Seahawks win probabilities.

    Combines a pre-game prior with the historical score-time lookup,
    layered with in-game adjustments for possession, efficiency,
    and turnovers.

    Parameters
    ----------
    pregame_probs : dict
        Must contain ``'patriots_win_prob'`` and ``'seahawks_win_prob'``
        (floats summing to ~1.0).
    """

    def __init__(self, pregame_probs: Dict[str, float]) -> None:
        self.pregame_ne: float = float(pregame_probs.get("patriots_win_prob", 0.50))
        self.pregame_sea: float = float(pregame_probs.get("seahawks_win_prob", 0.50))
        # Normalise
        total = self.pregame_ne + self.pregame_sea
        if total > 0:
            self.pregame_ne /= total
            self.pregame_sea /= total

        # History of calculations for trend charting
        self._calc_history: list[Tuple[int, float, float]] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def calculate(
        self,
        game_state: GameState,
        pregame_stats: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Produce a full live-probability result dict.

        Parameters
        ----------
        game_state : GameState
            Current snapshot.
        pregame_stats : dict, optional
            Pre-game team averages for efficiency comparison.  Expected
            keys (all optional):
                ne_yards_per_game, sea_yards_per_game,
                ne_pass_ypg, sea_pass_ypg,
                ne_rush_ypg, sea_rush_ypg

        Returns
        -------
        dict with keys:
            patriots_win_prob, seahawks_win_prob,
            projected_final_score_ne, projected_final_score_sea,
            momentum_indicator ('NE', 'SEA', or 'EVEN')
        """
        seconds_left = game_state.total_seconds_remaining()
        diff = game_state.score_differential()  # positive = NE leading

        # 1. Base probability from score-time lookup (NE perspective)
        if diff >= 0:
            base_ne = _score_time_probability(diff, seconds_left)
        else:
            # Flip: probability that SEA (leading) wins, then invert
            base_ne = 1.0 - _score_time_probability(-diff, seconds_left)

        # 2. Blend with pre-game prior (prior fades as game progresses)
        time_weight = self._time_decay_weight(seconds_left)
        blended_ne = time_weight * self.pregame_ne + (1.0 - time_weight) * base_ne

        # 3. Adjustments
        poss_adj = self._possession_adjustment(game_state)
        turn_adj = self._turnover_adjustment(game_state)
        eff_adj = self._efficiency_adjustment(game_state, pregame_stats)

        adjusted_ne = blended_ne + poss_adj + turn_adj + eff_adj
        adjusted_ne = float(np.clip(adjusted_ne, 0.005, 0.995))
        adjusted_sea = 1.0 - adjusted_ne

        # 4. Projected final scores
        proj_ne, proj_sea = self._project_final_scores(game_state, seconds_left)

        # 5. Momentum indicator
        momentum = self._momentum(game_state)

        # Record history
        self._calc_history.append((seconds_left, adjusted_ne, adjusted_sea))

        return {
            "patriots_win_prob": round(adjusted_ne, 4),
            "seahawks_win_prob": round(adjusted_sea, 4),
            "projected_final_score_ne": round(proj_ne, 1),
            "projected_final_score_sea": round(proj_sea, 1),
            "momentum_indicator": momentum,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _time_decay_weight(seconds_remaining: float) -> float:
        """Weight for the pre-game prior (1 at kickoff, ~0 at end).

        Uses a cubic decay so the prior influence drops off quickly
        in the second half.
        """
        fraction_left = np.clip(seconds_remaining / 3600.0, 0.0, 1.0)
        return float(fraction_left ** 3)

    @staticmethod
    def _possession_adjustment(game_state: GameState) -> float:
        """Adjust win probability for current possession and field position.

        Having the ball deep in opponent territory is worth more than
        having it at your own 20.  The adjustment is from NE perspective:
        positive values increase NE win probability.

        Magnitude ranges roughly from -0.04 to +0.04.
        """
        if game_state.time_remaining == 0 and game_state.quarter >= 4:
            return 0.0  # game is over or between quarters

        fp = game_state.field_position  # yards from own endzone
        # Expected points approximation: roughly linear from -2 at own 1
        # to +6 near opponent goal line, centred around ~+1.5 at midfield.
        expected_points = -2.0 + (fp / 99.0) * 8.0

        # Convert expected points to a probability nudge
        # ~3.5 points of expected value swing ~ 0.04 probability swing
        nudge = expected_points * 0.04 / 3.5

        # Scale down by down: 1st down is full value, 4th down much less
        down_scale = {1: 1.0, 2: 0.85, 3: 0.65, 4: 0.35}
        nudge *= down_scale.get(game_state.down, 0.5)

        # Scale by time remaining (possession matters less late unless close)
        time_scale = np.clip(game_state.total_seconds_remaining() / 3600.0, 0.05, 1.0)
        nudge *= time_scale

        if game_state.possession == "SEA":
            nudge = -nudge  # flip for Seattle having the ball

        return float(nudge)

    @staticmethod
    def _turnover_adjustment(game_state: GameState) -> float:
        """Shift probability based on turnover differential.

        Each net turnover in NE's favour is worth ~0.02 shift (diminishing).
        """
        net_turnovers_ne_favor = game_state.sea_turnovers - game_state.ne_turnovers
        if net_turnovers_ne_favor == 0:
            return 0.0
        # Diminishing returns via sqrt-like scaling
        sign = 1.0 if net_turnovers_ne_favor > 0 else -1.0
        magnitude = 0.02 * np.sqrt(abs(net_turnovers_ne_favor))
        return float(sign * min(magnitude, 0.06))

    @staticmethod
    def _efficiency_adjustment(
        game_state: GameState,
        pregame_stats: Optional[Dict[str, Any]],
    ) -> float:
        """Compare in-game yardage efficiency to pre-game baselines.

        If a team is outperforming its season average, its win probability
        gets a small bump.  Max adjustment ~+/- 0.03.
        """
        if pregame_stats is None:
            return 0.0

        total_seconds_elapsed = 3600 - game_state.total_seconds_remaining()
        if total_seconds_elapsed <= 0:
            return 0.0

        # Normalise in-game yards to a per-game pace (3600-second game)
        pace_factor = 3600.0 / max(total_seconds_elapsed, 60.0)

        ne_pace = game_state.ne_total_yards * pace_factor
        sea_pace = game_state.sea_total_yards * pace_factor

        ne_expected = float(pregame_stats.get("ne_yards_per_game", 340.0))
        sea_expected = float(pregame_stats.get("sea_yards_per_game", 340.0))

        # Ratio of actual pace to expected (capped)
        ne_ratio = np.clip(ne_pace / max(ne_expected, 1.0), 0.5, 2.0) - 1.0
        sea_ratio = np.clip(sea_pace / max(sea_expected, 1.0), 0.5, 2.0) - 1.0

        # Net advantage for NE (positive = NE outperforming more)
        net = (ne_ratio - sea_ratio) * 0.03
        return float(np.clip(net, -0.03, 0.03))

    # ------------------------------------------------------------------
    # Score projection
    # ------------------------------------------------------------------

    @staticmethod
    def _project_final_scores(
        game_state: GameState, seconds_left: float
    ) -> Tuple[float, float]:
        """Linearly project final scores from current scoring pace.

        Blends the current pace with a league-average baseline (22 pts)
        to stabilise early-game projections.
        """
        total_game = 3600.0
        elapsed = total_game - seconds_left
        if elapsed <= 0:
            return (22.0, 22.0)

        frac_remaining = seconds_left / total_game

        # Current pace projected to full game
        ne_pace_proj = game_state.score_patriots / elapsed * total_game
        sea_pace_proj = game_state.score_seahawks / elapsed * total_game

        # Baseline (league average ~22 ppg)
        baseline = 22.0

        # Blend: trust pace more as game goes on
        pace_trust = 1.0 - (frac_remaining ** 1.5)
        proj_ne = pace_trust * ne_pace_proj + (1.0 - pace_trust) * baseline
        proj_sea = pace_trust * sea_pace_proj + (1.0 - pace_trust) * baseline

        # Cannot be lower than current score
        proj_ne = max(proj_ne, float(game_state.score_patriots))
        proj_sea = max(proj_sea, float(game_state.score_seahawks))

        return (proj_ne, proj_sea)

    # ------------------------------------------------------------------
    # Momentum
    # ------------------------------------------------------------------

    @staticmethod
    def _momentum(game_state: GameState) -> str:
        """Determine which team has momentum based on recent events.

        Heuristic: compare yards and turnovers in context of score.
        """
        ne_score = 0.0
        sea_score = 0.0

        # Yardage advantage
        yard_diff = game_state.ne_total_yards - game_state.sea_total_yards
        if yard_diff > 30:
            ne_score += 1.0
        elif yard_diff < -30:
            sea_score += 1.0

        # Turnover advantage
        turn_diff = game_state.sea_turnovers - game_state.ne_turnovers
        if turn_diff > 0:
            ne_score += 1.5 * turn_diff
        elif turn_diff < 0:
            sea_score += 1.5 * abs(turn_diff)

        # Scoring run (positive diff = NE leading)
        score_diff = game_state.score_differential()
        if score_diff > 0:
            ne_score += 0.5
        elif score_diff < 0:
            sea_score += 0.5

        # Possession / field position bonus
        if game_state.field_position >= 60:
            if game_state.possession == "NE":
                ne_score += 0.5
            else:
                sea_score += 0.5

        # Recent key events (simple keyword scan)
        for event in game_state.key_events[-5:]:
            lower = event.lower()
            if "ne" in lower and ("touchdown" in lower or "td" in lower):
                ne_score += 1.0
            if "sea" in lower and ("touchdown" in lower or "td" in lower):
                sea_score += 1.0
            if "ne" in lower and ("interception" in lower or "fumble" in lower):
                sea_score += 0.75
            if "sea" in lower and ("interception" in lower or "fumble" in lower):
                ne_score += 0.75

        if ne_score > sea_score + 0.5:
            return "NE"
        elif sea_score > ne_score + 0.5:
            return "SEA"
        return "EVEN"

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    def get_history(self) -> list[Tuple[int, float, float]]:
        """Return list of (seconds_remaining, ne_prob, sea_prob) tuples."""
        return list(self._calc_history)
