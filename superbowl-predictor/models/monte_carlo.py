"""
Monte Carlo Simulation Engine for Super Bowl LX Prediction.

Simulates games by modeling individual drives as probability distributions
based on team efficiency metrics. Accounts for touchdowns, field goals,
safeties, defensive/special teams scores, and turnovers.

Methodology:
- Each game consists of ~24 total drives (12 per team, based on NFL average)
- Drive outcomes are sampled from probability distributions calibrated to team stats
- Turnover probability is modeled per drive
- Time of possession affects number of drives per team
- Score-dependent game script adjustments in 2nd half

Assumptions:
- Drive outcomes are independent (simplified)
- No explicit play-by-play modeling
- Overtime modeled as sudden-death with modified rules (NFL OT rules)
"""

import numpy as np
from typing import Dict, List, Tuple, Optional


class MonteCarloModel:
    """Monte Carlo game simulation model."""

    def __init__(self, n_simulations: int = 100000, seed: int = 2026):
        self.n_simulations = n_simulations
        self.rng = np.random.default_rng(seed)
        self.results = None  # Store last simulation results

    def predict(self, patriots_stats: dict, seahawks_stats: dict) -> dict:
        """Run full Monte Carlo simulation and return prediction summary.

        Returns dict with:
        - patriots_win_prob, seahawks_win_prob
        - predicted_spread (negative = SEA favored)
        - predicted_total
        - most_likely_score (tuple)
        - margins (array of all simulated margins, positive = NE win)
        - scores_ne, scores_sea (arrays of all simulated scores)
        - cover_probability (prob NE covers +4.5)
        - over_probability (prob total > 45.5)
        """
        # Extract team parameters
        ne_params = self._extract_drive_params(patriots_stats, 'offense', seahawks_stats, 'defense')
        sea_params = self._extract_drive_params(seahawks_stats, 'offense', patriots_stats, 'defense')

        ne_scores = np.zeros(self.n_simulations)
        sea_scores = np.zeros(self.n_simulations)

        for i in range(self.n_simulations):
            ne_score, sea_score = self._simulate_game(ne_params, sea_params)
            ne_scores[i] = ne_score
            sea_scores[i] = sea_score

        margins = ne_scores - sea_scores
        ne_wins = np.sum(margins > 0)
        sea_wins = np.sum(margins < 0)
        ties = np.sum(margins == 0)  # Should be rare with OT

        self.results = {
            'patriots_win_prob': (ne_wins + ties * 0.5) / self.n_simulations,
            'seahawks_win_prob': (sea_wins + ties * 0.5) / self.n_simulations,
            'predicted_spread': np.mean(margins),
            'predicted_total': np.mean(ne_scores + sea_scores),
            'most_likely_score': self._find_most_likely_score(ne_scores, sea_scores),
            'margins': margins,
            'scores_ne': ne_scores,
            'scores_sea': sea_scores,
            'median_margin': np.median(margins),
            'std_margin': np.std(margins),
            'cover_probability': np.mean(margins > -4.5),  # NE covers +4.5
            'over_probability': np.mean((ne_scores + sea_scores) > 45.5),
            'percentiles': {
                '5th': np.percentile(margins, 5),
                '25th': np.percentile(margins, 25),
                '50th': np.percentile(margins, 50),
                '75th': np.percentile(margins, 75),
                '95th': np.percentile(margins, 95)
            }
        }
        return self.results

    def _extract_drive_params(self, off_stats: dict, off_key: str,
                               def_stats: dict, def_key: str) -> dict:
        """Extract drive-level parameters from team stats.

        Combines offensive team's stats with opposing defense to create
        drive outcome probabilities.
        """
        offense = off_stats.get('offense', off_stats)
        defense = def_stats.get('defense', def_stats)
        playoff = off_stats.get('playoff', {})

        # Points per game as baseline
        off_ppg = offense.get('points_per_game', {})
        if isinstance(off_ppg, dict):
            off_ppg = off_ppg.get('overall', 24.0)

        def_ppg = defense.get('points_allowed_per_game', {})
        if isinstance(def_ppg, dict):
            def_ppg = def_ppg.get('overall', 22.0)

        # Blend offensive and defensive context
        expected_ppg = (off_ppg + (32 - def_ppg)) / 2  # Simple blend

        # Drive parameters
        avg_drives_per_game = 12.0  # NFL average ~12 drives per team per game

        # Red zone and scoring efficiency
        rz_td_pct = offense.get('red_zone_td_percentage', 0.58)
        def_rz_pct = defense.get('red_zone_defense_td_percentage', 0.55)
        effective_rz_td = (rz_td_pct + (1 - def_rz_pct)) / 2

        # Turnover probability per drive
        to_diff = offense.get('turnover_differential', 0)
        # Average about 1.5 turnovers per game, so ~0.125 per drive
        turnover_rate = max(0.05, 0.125 - to_diff * 0.003)

        # EPA-based scoring probability
        epa = offense.get('epa_per_play', 0.0)
        def_epa = abs(defense.get('epa_per_play_allowed', 0.0))

        # Drive outcome probabilities (must sum to 1)
        # Outcomes: TD, FG, Turnover, Punt, End of half/game
        base_td_rate = 0.22  # ~22% of drives end in TD (NFL avg)
        base_fg_rate = 0.12  # ~12% of drives end in FG
        base_to_rate = turnover_rate
        base_punt_rate = 0.52  # ~52% end in punt
        base_other_rate = 0.02  # Safety, end of half, etc.

        # Adjust based on efficiency
        efficiency_factor = 1.0 + (epa - def_epa) * 2.0
        efficiency_factor = np.clip(efficiency_factor, 0.6, 1.5)

        td_rate = base_td_rate * efficiency_factor
        fg_rate = base_fg_rate * efficiency_factor * 0.9
        to_rate = base_to_rate
        punt_rate = 1.0 - td_rate - fg_rate - to_rate - base_other_rate
        punt_rate = max(0.2, punt_rate)

        # Normalize
        total = td_rate + fg_rate + to_rate + punt_rate + base_other_rate

        return {
            'td_rate': td_rate / total,
            'fg_rate': fg_rate / total,
            'turnover_rate': to_rate / total,
            'punt_rate': punt_rate / total,
            'other_rate': base_other_rate / total,
            'drives_per_game': avg_drives_per_game,
            'two_pt_rate': 0.05,  # Probability of going for 2
            'defensive_td_rate': 0.015,  # Prob of defensive/ST TD on turnover
            'safety_rate': 0.003,
            'expected_ppg': expected_ppg
        }

    def _simulate_game(self, team_a_params: dict, team_b_params: dict) -> Tuple[int, int]:
        """Simulate a single game. Returns (team_a_score, team_b_score)."""
        a_score = 0
        b_score = 0

        # Number of drives varies - sample around average
        a_drives = max(8, int(self.rng.normal(team_a_params['drives_per_game'], 1.5)))
        b_drives = max(8, int(self.rng.normal(team_b_params['drives_per_game'], 1.5)))

        # Simulate regulation drives (alternating possession)
        total_drives = a_drives + b_drives
        a_has_ball = self.rng.random() < 0.5  # Coin flip for who starts

        a_drives_taken = 0
        b_drives_taken = 0

        for _ in range(total_drives):
            if a_has_ball and a_drives_taken < a_drives:
                pts_a, pts_b = self._simulate_drive(team_a_params, team_b_params)
                a_score += pts_a
                b_score += pts_b
                a_drives_taken += 1
            elif not a_has_ball and b_drives_taken < b_drives:
                pts_b, pts_a = self._simulate_drive(team_b_params, team_a_params)
                a_score += pts_a
                b_score += pts_b
                b_drives_taken += 1
            a_has_ball = not a_has_ball

        # Overtime if tied
        if a_score == b_score:
            a_ot, b_ot = self._simulate_overtime(team_a_params, team_b_params)
            a_score += a_ot
            b_score += b_ot

        return a_score, b_score

    def _simulate_drive(self, off_params: dict, def_params: dict) -> Tuple[int, int]:
        """Simulate a single drive. Returns (off_team_points, def_team_points)."""
        roll = self.rng.random()

        cumulative = 0.0

        # Touchdown
        cumulative += off_params['td_rate']
        if roll < cumulative:
            # PAT or 2-point conversion
            if self.rng.random() < off_params['two_pt_rate']:
                extra = 2 if self.rng.random() < 0.48 else 0  # ~48% 2pt conversion rate
            else:
                extra = 1 if self.rng.random() < 0.94 else 0  # ~94% PAT success
            return 6 + extra, 0

        # Field goal
        cumulative += off_params['fg_rate']
        if roll < cumulative:
            return 3, 0

        # Turnover
        cumulative += off_params['turnover_rate']
        if roll < cumulative:
            # Check for defensive TD (pick-six or fumble return)
            if self.rng.random() < def_params.get('defensive_td_rate', 0.015):
                extra = 1 if self.rng.random() < 0.94 else 0
                return 0, 6 + extra
            return 0, 0

        # Safety
        cumulative += off_params.get('safety_rate', 0.003)
        if roll < cumulative:
            return 0, 2

        # Punt / end of half (no points)
        return 0, 0

    def _simulate_overtime(self, team_a_params: dict, team_b_params: dict) -> Tuple[int, int]:
        """Simulate overtime using current NFL OT rules (both teams get possession unless first team scores TD)."""
        # Team A gets ball first (coin flip)
        if self.rng.random() < 0.5:
            first_params, second_params = team_a_params, team_b_params
            a_first = True
        else:
            first_params, second_params = team_b_params, team_a_params
            a_first = False

        # First possession
        pts1_off, pts1_def = self._simulate_drive(first_params, second_params)

        if pts1_off >= 6:  # TD on first possession — game over
            if a_first:
                return pts1_off, pts1_def
            else:
                return pts1_def, pts1_off

        # Second team gets the ball
        pts2_off, pts2_def = self._simulate_drive(second_params, first_params)

        if a_first:
            a_total = pts1_off + pts2_def
            b_total = pts1_def + pts2_off
        else:
            a_total = pts1_def + pts2_off
            b_total = pts1_off + pts2_def

        # If still tied after both possessions, next score wins
        if a_total == b_total:
            for _ in range(8):  # Max 8 more drives
                if self.rng.random() < 0.5:
                    pts_a, pts_b = self._simulate_drive(team_a_params, team_b_params)
                    if pts_a > 0:
                        return a_total + pts_a, b_total
                    if pts_b > 0:
                        return a_total, b_total + pts_b
                else:
                    pts_b, pts_a = self._simulate_drive(team_b_params, team_a_params)
                    if pts_b > 0:
                        return a_total, b_total + pts_b
                    if pts_a > 0:
                        return a_total + pts_a, b_total

        return a_total, b_total

    def _find_most_likely_score(self, ne_scores: np.ndarray, sea_scores: np.ndarray) -> Tuple[int, int]:
        """Find the most common final score combination."""
        # Round to integers and find mode
        ne_int = ne_scores.astype(int)
        sea_int = sea_scores.astype(int)

        # Create score pairs and find most common
        score_pairs = {}
        for ne, sea in zip(ne_int, sea_int):
            key = (ne, sea)
            score_pairs[key] = score_pairs.get(key, 0) + 1

        most_common = max(score_pairs, key=score_pairs.get)
        return most_common

    def get_score_distribution(self) -> dict:
        """Get detailed score distribution from last simulation."""
        if self.results is None:
            return {}

        ne = self.results['scores_ne']
        sea = self.results['scores_sea']
        totals = ne + sea

        return {
            'ne_mean': np.mean(ne),
            'ne_std': np.std(ne),
            'ne_median': np.median(ne),
            'sea_mean': np.mean(sea),
            'sea_std': np.std(sea),
            'sea_median': np.median(sea),
            'total_mean': np.mean(totals),
            'total_std': np.std(totals),
            'total_median': np.median(totals),
            'ne_score_probs': self._score_probabilities(ne),
            'sea_score_probs': self._score_probabilities(sea)
        }

    def _score_probabilities(self, scores: np.ndarray) -> dict:
        """Calculate probability of each score range."""
        ranges = [(0, 6), (7, 13), (14, 20), (21, 27), (28, 34), (35, 41), (42, 100)]
        labels = ['0-6', '7-13', '14-20', '21-27', '28-34', '35-41', '42+']
        probs = {}
        for label, (lo, hi) in zip(labels, ranges):
            probs[label] = float(np.mean((scores >= lo) & (scores <= hi)))
        return probs

    def get_cover_probability(self, spread: float = -4.5) -> float:
        """Calculate probability of NE covering the given spread.

        spread is from NE's perspective (positive means NE is underdog).
        NE covers if margin > -spread (i.e., margin + spread > 0 means NE covers).
        """
        if self.results is None:
            return 0.5
        return float(np.mean(self.results['margins'] > -spread))
