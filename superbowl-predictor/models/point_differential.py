"""
Pythagorean Wins / Point Differential Model for Super Bowl LX
==============================================================

Methodology:
    The Pythagorean expectation for football estimates expected wins from
    points scored (PF) and points allowed (PA) using the formula:

        Expected Wins = PF^exp / (PF^exp + PA^exp) * games

    The standard NFL exponent is 2.37 (derived from historical analysis;
    the classic baseball Pythagorean uses 2, but football uses a higher
    exponent because scoring is lumpier).

    Conversion to spread prediction:
        1. Compute each team's expected win percentage.
        2. Derive an implied power rating from the expected win pct.
        3. The spread is the difference in power ratings, scaled by a
           conversion factor (~2.7 points per 0.1 win pct difference).
        4. Opponent strength adjustments inflate/deflate based on SOS.

    The predicted total is estimated from the average of each team's
    points-per-game, cross-matched with the opponent's defensive
    points-per-game allowed, and regressed toward league average.

Assumptions:
    - Exponent of 2.37 for NFL Pythagorean formula.
    - 17-game regular season.
    - League-average PPG is ~22.0.
    - SOS adjustments scale linearly, capped at +/- 1.5 points on spread.
    - Playoff data is blended in with a lower weight (30% playoff, 70% regular).
"""

import numpy as np


class PythagoreanModel:
    """Pythagorean Wins prediction model for NFL Super Bowl matchups."""

    EXPONENT = 2.37
    REGULAR_SEASON_GAMES = 17
    LEAGUE_AVG_PPG = 22.0
    WIN_PCT_TO_SPREAD_FACTOR = 27.0  # Points of spread per 1.0 win pct difference
    SOS_SPREAD_CAP = 1.5  # Max SOS adjustment on spread
    PLAYOFF_WEIGHT = 0.30
    HISTORICAL_SB_TOTAL = 46.5

    def __init__(self):
        """Initialize the Pythagorean model."""
        pass

    def _safe_get(self, stats, *keys, default=0.0):
        """Safely traverse nested dict keys, returning default if missing."""
        current = stats
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return default
        try:
            return float(current)
        except (TypeError, ValueError):
            return default

    def _pythagorean_win_pct(self, points_for_pg, points_against_pg):
        """
        Calculate Pythagorean expected win percentage.

        Parameters
        ----------
        points_for_pg : float
            Points scored per game.
        points_against_pg : float
            Points allowed per game.

        Returns
        -------
        float
            Expected win percentage (0 to 1).
        """
        # Guard against zero or negative values
        pf = max(points_for_pg, 1.0)
        pa = max(points_against_pg, 1.0)

        pf_exp = pf ** self.EXPONENT
        pa_exp = pa ** self.EXPONENT

        return pf_exp / (pf_exp + pa_exp)

    def _compute_team_metrics(self, team_stats):
        """
        Compute Pythagorean metrics for a single team.

        Parameters
        ----------
        team_stats : dict
            Team statistics dict.

        Returns
        -------
        dict
            Computed metrics including pyth_win_pct, expected_wins, etc.
        """
        # Regular season scoring
        ppg = self._safe_get(team_stats, "offense", "points_per_game", default=self.LEAGUE_AVG_PPG)
        opp_ppg = self._safe_get(team_stats, "defense", "points_per_game", default=self.LEAGUE_AVG_PPG)

        # Pythagorean win pct from regular season
        reg_pyth = self._pythagorean_win_pct(ppg, opp_ppg)

        # Playoff scoring (if available)
        playoff_ppg = self._safe_get(team_stats, "playoff", "points_per_game", default=0)
        playoff_opp_ppg = self._safe_get(team_stats, "playoff", "opp_points_per_game", default=0)
        playoff_wins = self._safe_get(team_stats, "playoff", "wins", default=0)

        if playoff_wins > 0 and playoff_ppg > 0 and playoff_opp_ppg > 0:
            playoff_pyth = self._pythagorean_win_pct(playoff_ppg, playoff_opp_ppg)
            # Blend regular and playoff
            blended_pyth = (1 - self.PLAYOFF_WEIGHT) * reg_pyth + self.PLAYOFF_WEIGHT * playoff_pyth
        else:
            blended_pyth = reg_pyth

        expected_wins = blended_pyth * self.REGULAR_SEASON_GAMES

        # Actual record
        actual_wins = self._safe_get(team_stats, "record", "wins", default=8)

        # SOS
        sos = self._safe_get(team_stats, "advanced", "sos", default=0.0)

        # Point differential
        total_pf = ppg * self.REGULAR_SEASON_GAMES
        total_pa = opp_ppg * self.REGULAR_SEASON_GAMES
        point_diff = total_pf - total_pa

        return {
            "ppg": ppg,
            "opp_ppg": opp_ppg,
            "pyth_win_pct": blended_pyth,
            "expected_wins": expected_wins,
            "actual_wins": actual_wins,
            "sos": sos,
            "point_diff": point_diff,
            "avg_mov": ppg - opp_ppg,
        }

    def predict(self, patriots_stats, seahawks_stats):
        """
        Predict the Super Bowl outcome using Pythagorean wins.

        Parameters
        ----------
        patriots_stats : dict
            New England Patriots team statistics.
        seahawks_stats : dict
            Seattle Seahawks team statistics.

        Returns
        -------
        dict
            Prediction results:
                - patriots_win_prob: float
                - seahawks_win_prob: float
                - predicted_spread: float (negative = SEA favored)
                - predicted_total: float
                - patriots_metrics: dict (pyth details)
                - seahawks_metrics: dict (pyth details)
                - model_name: str
        """
        patriots_stats = patriots_stats or {}
        seahawks_stats = seahawks_stats or {}

        pat = self._compute_team_metrics(patriots_stats)
        sea = self._compute_team_metrics(seahawks_stats)

        # --- Win Probability ---
        # Use the Pythagorean win pct differential to derive matchup probability.
        # A team with pyth 0.70 vs 0.60 is modeled using log5 method:
        #   P(A wins) = (pA - pA*pB) / (pA + pB - 2*pA*pB)
        pa = pat["pyth_win_pct"]
        pb = sea["pyth_win_pct"]

        denominator = pa + pb - 2 * pa * pb
        if abs(denominator) < 1e-10:
            pat_win_prob = 0.5
        else:
            pat_win_prob = (pa - pa * pb) / denominator

        pat_win_prob = np.clip(pat_win_prob, 0.01, 0.99)
        sea_win_prob = 1.0 - pat_win_prob

        # --- Predicted Spread ---
        # Convert win pct difference to spread
        pyth_diff = pa - pb  # positive = NE better
        raw_spread = pyth_diff * self.WIN_PCT_TO_SPREAD_FACTOR

        # SOS adjustment: better SOS -> spread moves in that team's favor
        sos_diff = pat["sos"] - sea["sos"]
        sos_adj = np.clip(sos_diff * 2.0, -self.SOS_SPREAD_CAP, self.SOS_SPREAD_CAP)
        predicted_spread = raw_spread + sos_adj

        # --- Predicted Total ---
        # Cross-match offense vs defense
        proj_pat_score = (pat["ppg"] + sea["opp_ppg"]) / 2.0
        proj_sea_score = (sea["ppg"] + pat["opp_ppg"]) / 2.0
        raw_total = proj_pat_score + proj_sea_score

        # Regress toward historical average
        predicted_total = 0.55 * raw_total + 0.45 * self.HISTORICAL_SB_TOTAL

        return {
            "patriots_win_prob": round(float(pat_win_prob), 4),
            "seahawks_win_prob": round(float(sea_win_prob), 4),
            "predicted_spread": round(float(predicted_spread), 1),
            "predicted_total": round(float(predicted_total), 1),
            "patriots_metrics": {
                "pyth_win_pct": round(pa, 4),
                "expected_wins": round(pat["expected_wins"], 1),
                "actual_wins": pat["actual_wins"],
                "point_diff_per_game": round(pat["avg_mov"], 1),
            },
            "seahawks_metrics": {
                "pyth_win_pct": round(pb, 4),
                "expected_wins": round(sea["expected_wins"], 1),
                "actual_wins": sea["actual_wins"],
                "point_diff_per_game": round(sea["avg_mov"], 1),
            },
            "model_name": "Pythagorean Wins Model",
        }
