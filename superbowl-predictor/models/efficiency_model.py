"""
EPA/DVOA Composite Efficiency Model for Super Bowl LX
======================================================

Methodology:
    This model builds a composite efficiency score for each team by
    weighting multiple advanced metrics:

    1. EPA per play (offense + defense) - PRIMARY metric
       Offensive EPA/play measures how many expected points a team adds
       per snap. Defensive EPA/play measures how many points they allow.
       The net EPA differential is the single best predictor of NFL
       game outcomes in modern analytics.

    2. DVOA (Defense-adjusted Value Over Average)
       DVOA rankings provide a context-aware measure of team quality
       that accounts for opponent and situation. We convert rankings
       to a normalized score.

    3. Success rate differential
       Success rate measures the percentage of plays that produce
       positive EPA. A high success rate indicates consistency.

    4. Explosive play rate differential
       Explosive plays (20+ yard passes, 10+ yard runs) create
       scoring opportunities. The differential measures which team
       generates more big plays while limiting them defensively.

    Composite Score Construction:
        composite = (w1 * net_epa_norm +
                     w2 * dvoa_norm +
                     w3 * success_rate_diff_norm +
                     w4 * explosive_diff_norm)

    The composite score difference is converted to a predicted margin
    using a calibrated scaling factor.

Assumptions:
    - EPA/play is weighted at 45% of the composite.
    - DVOA ranking is weighted at 25%.
    - Success rate differential is weighted at 18%.
    - Explosive play rate differential is weighted at 12%.
    - Composite scores are normalized to roughly [-1, 1] range.
    - 1.0 composite point difference ~ 7 points of margin.
    - Predicted total uses combined offensive efficiency.
"""

import numpy as np


class EfficiencyModel:
    """EPA/DVOA composite efficiency model for NFL predictions."""

    # Component weights (must sum to 1.0)
    W_EPA = 0.45
    W_DVOA = 0.25
    W_SUCCESS_RATE = 0.18
    W_EXPLOSIVE = 0.12

    # Conversion factors
    COMPOSITE_TO_SPREAD = 7.0  # 1 composite point ~ 7 points of margin
    HISTORICAL_SB_TOTAL = 46.5

    # Normalization constants (based on typical NFL ranges)
    EPA_PLAY_SCALE = 0.15       # Max realistic net EPA/play
    DVOA_RANK_TEAMS = 32        # Number of NFL teams
    SUCCESS_RATE_SCALE = 0.10   # Max typical success rate diff
    EXPLOSIVE_RATE_SCALE = 0.08 # Max typical explosive rate diff

    def __init__(self):
        """Initialize the efficiency model."""
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

    def _compute_epa_component(self, team_stats):
        """
        Compute the EPA/play component for a team.

        Returns the net EPA per play (offense minus defense, where lower
        defensive EPA is better).

        Parameters
        ----------
        team_stats : dict
            Team statistics.

        Returns
        -------
        float
            Net EPA per play.
        """
        off_epa = self._safe_get(team_stats, "advanced", "off_epa_per_play", default=0.0)
        def_epa = self._safe_get(team_stats, "advanced", "def_epa_per_play", default=0.0)

        # Net EPA: offense contributes positively, defense negatively
        # (a negative def_epa means the defense is GOOD -- opponents lose EPA)
        net_epa = off_epa - def_epa
        return net_epa

    def _compute_dvoa_component(self, team_stats):
        """
        Compute normalized DVOA component from team rankings.

        A team ranked #1 overall gets a score near +1.0; ranked #32 near -1.0.

        Parameters
        ----------
        team_stats : dict
            Team statistics.

        Returns
        -------
        float
            Normalized DVOA score in [-1, 1].
        """
        # DVOA total ranking (1 = best, 32 = worst)
        dvoa_rank = self._safe_get(team_stats, "advanced", "dvoa_rank", default=16)
        off_dvoa_rank = self._safe_get(team_stats, "advanced", "off_dvoa_rank", default=16)
        def_dvoa_rank = self._safe_get(team_stats, "advanced", "def_dvoa_rank", default=16)

        # If total DVOA rank is not available, compute from offense and defense
        if dvoa_rank == 16 and off_dvoa_rank != 16 and def_dvoa_rank != 16:
            dvoa_rank = (off_dvoa_rank + def_dvoa_rank) / 2.0

        # Normalize: rank 1 -> +1.0, rank 32 -> -1.0
        # Formula: score = 1 - 2*(rank-1)/(N-1)
        normalized = 1.0 - 2.0 * (dvoa_rank - 1) / (self.DVOA_RANK_TEAMS - 1)
        return np.clip(normalized, -1.0, 1.0)

    def _compute_success_rate_component(self, team_stats):
        """
        Compute success rate differential component.

        Success rate = percentage of plays producing positive EPA.
        We use the differential between offensive and defensive success rates.

        Parameters
        ----------
        team_stats : dict
            Team statistics.

        Returns
        -------
        float
            Success rate differential.
        """
        off_sr = self._safe_get(team_stats, "advanced", "off_success_rate", default=0.45)
        def_sr = self._safe_get(team_stats, "advanced", "def_success_rate", default=0.45)

        # Differential: high offense success rate + low defense success rate = good
        return off_sr - def_sr

    def _compute_explosive_component(self, team_stats):
        """
        Compute explosive play rate differential component.

        Explosive plays: passes of 20+ yards, runs of 10+ yards.

        Parameters
        ----------
        team_stats : dict
            Team statistics.

        Returns
        -------
        float
            Explosive play rate differential.
        """
        off_explosive = self._safe_get(team_stats, "advanced", "off_explosive_rate", default=0.08)
        def_explosive = self._safe_get(team_stats, "advanced", "def_explosive_rate", default=0.08)

        # Positive = team generates more explosive plays than it allows
        return off_explosive - def_explosive

    def _compute_composite(self, team_stats):
        """
        Compute the full composite efficiency score for a team.

        Parameters
        ----------
        team_stats : dict
            Team statistics.

        Returns
        -------
        dict
            Component scores and final composite.
        """
        # Raw components
        epa_raw = self._compute_epa_component(team_stats)
        dvoa_raw = self._compute_dvoa_component(team_stats)
        sr_raw = self._compute_success_rate_component(team_stats)
        explosive_raw = self._compute_explosive_component(team_stats)

        # Normalize each component to roughly [-1, 1]
        epa_norm = np.clip(epa_raw / self.EPA_PLAY_SCALE, -1.0, 1.0)
        dvoa_norm = dvoa_raw  # Already normalized
        sr_norm = np.clip(sr_raw / self.SUCCESS_RATE_SCALE, -1.0, 1.0)
        explosive_norm = np.clip(explosive_raw / self.EXPLOSIVE_RATE_SCALE, -1.0, 1.0)

        # Weighted composite
        composite = (
            self.W_EPA * epa_norm +
            self.W_DVOA * dvoa_norm +
            self.W_SUCCESS_RATE * sr_norm +
            self.W_EXPLOSIVE * explosive_norm
        )

        return {
            "epa_raw": epa_raw,
            "epa_normalized": round(epa_norm, 4),
            "dvoa_normalized": round(dvoa_norm, 4),
            "success_rate_diff": round(sr_raw, 4),
            "success_rate_normalized": round(sr_norm, 4),
            "explosive_diff": round(explosive_raw, 4),
            "explosive_normalized": round(explosive_norm, 4),
            "composite_score": round(composite, 4),
        }

    def _estimate_total(self, pat_stats, sea_stats, pat_composite, sea_composite):
        """
        Estimate the predicted total score.

        Uses offensive EPA/play, points per game, and composites to
        estimate combined scoring.

        Parameters
        ----------
        pat_stats : dict
            Patriots stats.
        sea_stats : dict
            Seahawks stats.
        pat_composite : dict
            Patriots composite breakdown.
        sea_composite : dict
            Seahawks composite breakdown.

        Returns
        -------
        float
            Predicted total.
        """
        off_ppg_a = self._safe_get(pat_stats, "offense", "points_per_game", default=22.0)
        off_ppg_b = self._safe_get(sea_stats, "offense", "points_per_game", default=22.0)
        def_ppg_a = self._safe_get(pat_stats, "defense", "points_per_game", default=22.0)
        def_ppg_b = self._safe_get(sea_stats, "defense", "points_per_game", default=22.0)

        # Cross-match projections
        proj_a = (off_ppg_a + def_ppg_b) / 2.0
        proj_b = (off_ppg_b + def_ppg_a) / 2.0
        raw_total = proj_a + proj_b

        # Adjust based on combined offensive efficiency (EPA)
        combined_off_epa = (
            self._safe_get(pat_stats, "advanced", "off_epa_per_play", default=0.0) +
            self._safe_get(sea_stats, "advanced", "off_epa_per_play", default=0.0)
        )
        epa_adj = combined_off_epa * 20.0  # Scale EPA to point adjustment

        raw_total += epa_adj

        # Regress toward historical average
        total = 0.55 * raw_total + 0.45 * self.HISTORICAL_SB_TOTAL
        return round(total, 1)

    def predict(self, patriots_stats, seahawks_stats):
        """
        Predict the Super Bowl outcome using the efficiency composite.

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
                - patriots_composite: dict (component breakdown)
                - seahawks_composite: dict (component breakdown)
                - composite_differential: float
                - model_name: str
        """
        patriots_stats = patriots_stats or {}
        seahawks_stats = seahawks_stats or {}

        pat_composite = self._compute_composite(patriots_stats)
        sea_composite = self._compute_composite(seahawks_stats)

        # Composite differential (positive = NE stronger)
        comp_diff = pat_composite["composite_score"] - sea_composite["composite_score"]

        # Convert to spread
        predicted_spread = comp_diff * self.COMPOSITE_TO_SPREAD

        # Convert composite diff to win probability using logistic function
        # Calibrated so that a 7-point spread ~ 70% win probability
        k = 0.18  # Steepness parameter
        pat_win_prob = 1.0 / (1.0 + np.exp(-k * predicted_spread / 0.5))
        pat_win_prob = np.clip(pat_win_prob, 0.01, 0.99)
        sea_win_prob = 1.0 - pat_win_prob

        # Predicted total
        predicted_total = self._estimate_total(
            patriots_stats, seahawks_stats, pat_composite, sea_composite
        )

        return {
            "patriots_win_prob": round(float(pat_win_prob), 4),
            "seahawks_win_prob": round(float(sea_win_prob), 4),
            "predicted_spread": round(float(predicted_spread), 1),
            "predicted_total": predicted_total,
            "patriots_composite": pat_composite,
            "seahawks_composite": sea_composite,
            "composite_differential": round(comp_diff, 4),
            "component_weights": {
                "epa": self.W_EPA,
                "dvoa": self.W_DVOA,
                "success_rate": self.W_SUCCESS_RATE,
                "explosive": self.W_EXPLOSIVE,
            },
            "model_name": "EPA/DVOA Composite Efficiency Model",
        }
