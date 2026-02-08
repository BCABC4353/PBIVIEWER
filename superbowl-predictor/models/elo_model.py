"""
Elo Rating Model for Super Bowl LX Prediction
==============================================

Methodology:
    This model assigns Elo ratings to each team based on their regular season
    performance and adjusts for playoff results. The core formula is the
    standard Elo expected score calculation:

        E_a = 1 / (1 + 10^((R_b - R_a) / 400))

    Base Elo is constructed from:
        - Season win-loss record mapped to a baseline rating
        - Point differential bonus (each point of MOV ~ 25 Elo)
        - Strength of schedule adjustment
        - Playoff performance multiplier (wins weighted more heavily)

    A neutral-site adjustment removes home-field advantage from the
    prediction (Super Bowl is played at a neutral venue).

    The predicted spread is derived from the Elo difference using the
    standard conversion factor of ~25 Elo points per point of spread.

Assumptions:
    - Base Elo for an average team is 1500.
    - A team with a perfect 17-0 record would have a base of ~1700.
    - Point differential contributes ~25 Elo per average margin-of-victory point.
    - Each playoff win adds 30 Elo; each loss subtracts 15.
    - Strength of schedule scales from -50 to +50 Elo.
    - The Elo-to-spread conversion is 25 Elo points per 1 point of spread.
    - Predicted total is estimated from combined offensive efficiency proxied
      through the Elo ratings and historical Super Bowl scoring averages.
"""

import numpy as np


class EloModel:
    """Elo-based prediction model for NFL Super Bowl matchups."""

    # Configuration constants
    BASE_ELO = 1500
    ELO_PER_WIN = 12.5          # Elo points per regular season win
    ELO_PER_MOV_POINT = 1.5     # Elo per point of average margin of victory
    PLAYOFF_WIN_BONUS = 30       # Elo bonus per playoff win
    PLAYOFF_LOSS_PENALTY = 15    # Elo penalty per playoff loss
    SOS_SCALE = 50               # Max +/- Elo from strength of schedule
    ELO_TO_SPREAD = 25.0         # Elo points per 1 point of spread
    NEUTRAL_SITE_ADJ = 0         # No home-field at Super Bowl
    HISTORICAL_SB_TOTAL = 46.5   # Historical avg Super Bowl total

    def __init__(self):
        """Initialize the Elo model."""
        pass

    def _safe_get(self, stats, *keys, default=0.0):
        """Safely traverse nested dict keys, returning default if any key is missing."""
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

    def calculate_elo(self, team_stats):
        """
        Calculate an Elo rating for a team based on season and playoff stats.

        Parameters
        ----------
        team_stats : dict
            Team statistics dictionary with nested keys for season record,
            point differential, strength of schedule, and playoff performance.

        Returns
        -------
        float
            Calculated Elo rating for the team.
        """
        # --- Regular Season Record ---
        wins = self._safe_get(team_stats, "record", "wins", default=8)
        losses = self._safe_get(team_stats, "record", "losses", default=9)
        games = wins + losses if (wins + losses) > 0 else 17
        win_pct = wins / games

        # Start from base and add win-based component
        elo = self.BASE_ELO + (wins - losses) * self.ELO_PER_WIN

        # --- Point Differential / Margin of Victory ---
        points_for = self._safe_get(team_stats, "offense", "points_per_game", default=22.0)
        points_against = self._safe_get(team_stats, "defense", "points_per_game", default=22.0)
        avg_mov = points_for - points_against
        elo += avg_mov * self.ELO_PER_MOV_POINT

        # --- Strength of Schedule ---
        sos = self._safe_get(team_stats, "advanced", "sos", default=0.0)
        # SOS is expected as a value roughly in [-1, 1] or similar range
        # Normalize to [-SOS_SCALE, +SOS_SCALE]
        sos_clamped = np.clip(sos, -1.0, 1.0)
        elo += sos_clamped * self.SOS_SCALE

        # --- Playoff Performance ---
        playoff_wins = self._safe_get(team_stats, "playoff", "wins", default=0)
        playoff_losses = self._safe_get(team_stats, "playoff", "losses", default=0)
        elo += playoff_wins * self.PLAYOFF_WIN_BONUS
        elo -= playoff_losses * self.PLAYOFF_LOSS_PENALTY

        # --- Point differential in playoffs (bonus for dominant wins) ---
        playoff_ppg = self._safe_get(team_stats, "playoff", "points_per_game", default=0)
        playoff_opp_ppg = self._safe_get(team_stats, "playoff", "opp_points_per_game", default=0)
        if playoff_wins > 0:
            playoff_mov = playoff_ppg - playoff_opp_ppg
            elo += playoff_mov * 0.5

        return elo

    def _elo_expected(self, rating_a, rating_b):
        """
        Standard Elo expected score for player A.

        E_a = 1 / (1 + 10^((R_b - R_a) / 400))

        Parameters
        ----------
        rating_a : float
            Elo rating of team A.
        rating_b : float
            Elo rating of team B.

        Returns
        -------
        float
            Expected win probability for team A (0 to 1).
        """
        exponent = (rating_b - rating_a) / 400.0
        return 1.0 / (1.0 + 10.0 ** exponent)

    def _estimate_total(self, patriots_stats, seahawks_stats, elo_a, elo_b):
        """
        Estimate the predicted combined total score.

        Uses offensive points per game from both teams, regressed toward
        historical Super Bowl averages, and adjusted slightly by the
        combined Elo (higher-rated games tend to be higher scoring).

        Parameters
        ----------
        patriots_stats : dict
            Patriots team stats.
        seahawks_stats : dict
            Seahawks team stats.
        elo_a : float
            Patriots Elo.
        elo_b : float
            Seahawks Elo.

        Returns
        -------
        float
            Predicted total score.
        """
        off_a = self._safe_get(patriots_stats, "offense", "points_per_game", default=22.0)
        off_b = self._safe_get(seahawks_stats, "offense", "points_per_game", default=22.0)
        def_a = self._safe_get(patriots_stats, "defense", "points_per_game", default=22.0)
        def_b = self._safe_get(seahawks_stats, "defense", "points_per_game", default=22.0)

        # Cross-match: each team's offense vs opponent's defense
        # Predicted score for A = average of A's offense and B's defense allowed
        proj_a = (off_a + def_b) / 2.0
        proj_b = (off_b + def_a) / 2.0
        raw_total = proj_a + proj_b

        # Regress toward historical Super Bowl average (60% raw, 40% historical)
        total = 0.60 * raw_total + 0.40 * self.HISTORICAL_SB_TOTAL

        # Slight Elo-based adjustment: high combined Elo -> slightly higher total
        combined_elo = elo_a + elo_b
        elo_total_adj = (combined_elo - 3000) * 0.005  # ~0.5 points per 100 Elo above avg
        total += elo_total_adj

        return round(total, 1)

    def predict(self, patriots_stats, seahawks_stats):
        """
        Predict the Super Bowl outcome using Elo ratings.

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
                - patriots_elo: float
                - seahawks_elo: float
                - elo_difference: float
                - model_name: str
        """
        patriots_stats = patriots_stats or {}
        seahawks_stats = seahawks_stats or {}

        elo_a = self.calculate_elo(patriots_stats)
        elo_b = self.calculate_elo(seahawks_stats)

        # Apply neutral-site adjustment (both sides equal at Super Bowl)
        elo_a += self.NEUTRAL_SITE_ADJ
        elo_b += self.NEUTRAL_SITE_ADJ

        # Win probability via standard Elo formula
        win_prob_a = self._elo_expected(elo_a, elo_b)
        win_prob_b = 1.0 - win_prob_a

        # Convert Elo difference to spread
        elo_diff = elo_a - elo_b  # positive = NE stronger
        predicted_spread = elo_diff / self.ELO_TO_SPREAD  # positive = NE favored

        # Estimate total
        predicted_total = self._estimate_total(patriots_stats, seahawks_stats, elo_a, elo_b)

        return {
            "patriots_win_prob": round(win_prob_a, 4),
            "seahawks_win_prob": round(win_prob_b, 4),
            "predicted_spread": round(predicted_spread, 1),
            "predicted_total": predicted_total,
            "patriots_elo": round(elo_a, 1),
            "seahawks_elo": round(elo_b, 1),
            "elo_difference": round(elo_diff, 1),
            "model_name": "Elo Rating Model",
        }
