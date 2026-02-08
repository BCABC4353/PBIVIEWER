"""
Bayesian Inference Model for Super Bowl LX Prediction
======================================================

Methodology:
    This model uses Bayesian inference (via scipy.stats, not PyMC) to
    estimate the probability distribution of game outcomes.

    The process:
    1. PRIOR: Establish a prior distribution for each team's "true" scoring
       rate (points per game) based on regular season performance.
       - Each team's scoring is modeled as Normal(mu, sigma) where mu is
         the observed PPG and sigma reflects uncertainty.
       - Defensive performance provides a prior for points allowed.

    2. LIKELIHOOD / UPDATE: Update the prior with playoff observations.
       - Playoff games serve as new data points that shift the posterior.
       - Bayesian updating via conjugate normal model:
         posterior_mu = (prior_mu/prior_var + sum(data)/likelihood_var) /
                        (1/prior_var + n/likelihood_var)

    3. POSTERIOR PREDICTION: The predicted game outcome is the difference
       of two normal distributions (NE score - SEA score), which is itself
       normal:
       - margin ~ Normal(mu_A_off - mu_B_off_adj, sqrt(var_A + var_B))
       - P(NE wins) = P(margin > 0)

    4. FULL DISTRIBUTION: The model outputs a full probability distribution
       over margins, allowing computation of cover probabilities for any
       spread, as well as credible intervals.

Assumptions:
    - Team scoring is approximately normally distributed game-to-game.
    - Prior standard deviation for offensive PPG is 7.0 points.
    - Prior standard deviation for defensive PPG allowed is 6.0 points.
    - Playoff games contribute with a per-game variance of 10.0^2.
    - The margin distribution is the convolution of offense/defense normals.
    - Independence between the two teams' performances.
"""

import numpy as np
from scipy import stats


class BayesianModel:
    """Bayesian inference model for NFL Super Bowl prediction."""

    # Prior uncertainty parameters
    PRIOR_OFF_SIGMA = 7.0   # Std dev for offensive PPG prior
    PRIOR_DEF_SIGMA = 6.0   # Std dev for defensive PPG allowed prior
    PLAYOFF_GAME_SIGMA = 10.0  # Per-game std dev for playoff observations
    LEAGUE_AVG_PPG = 22.0
    HISTORICAL_SB_TOTAL = 46.5

    def __init__(self):
        """Initialize the Bayesian model."""
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

    def _bayesian_update_normal(self, prior_mu, prior_sigma, observations, obs_sigma):
        """
        Bayesian update for a normal distribution with known variance.

        Given a normal prior N(prior_mu, prior_sigma^2) and n observations
        with known per-observation variance obs_sigma^2, compute the
        posterior N(post_mu, post_sigma^2).

        Parameters
        ----------
        prior_mu : float
            Prior mean.
        prior_sigma : float
            Prior standard deviation.
        observations : list of float
            Observed data points.
        obs_sigma : float
            Standard deviation of each observation.

        Returns
        -------
        tuple of (float, float)
            Posterior mean and posterior standard deviation.
        """
        if not observations:
            return prior_mu, prior_sigma

        prior_var = prior_sigma ** 2
        obs_var = obs_sigma ** 2
        n = len(observations)
        data_sum = sum(observations)

        # Conjugate normal update
        post_var = 1.0 / (1.0 / prior_var + n / obs_var)
        post_mu = post_var * (prior_mu / prior_var + data_sum / obs_var)
        post_sigma = np.sqrt(post_var)

        return post_mu, post_sigma

    def _build_team_posterior(self, team_stats):
        """
        Build posterior distributions for a team's offensive and defensive
        scoring rates.

        Parameters
        ----------
        team_stats : dict
            Team statistics.

        Returns
        -------
        dict
            Posterior parameters for offense and defense:
                - off_mu, off_sigma: Offensive PPG posterior
                - def_mu, def_sigma: Defensive PPG allowed posterior
        """
        # --- Prior from regular season ---
        off_ppg = self._safe_get(team_stats, "offense", "points_per_game",
                                 default=self.LEAGUE_AVG_PPG)
        def_ppg = self._safe_get(team_stats, "defense", "points_per_game",
                                 default=self.LEAGUE_AVG_PPG)

        off_prior_mu = off_ppg
        off_prior_sigma = self.PRIOR_OFF_SIGMA
        def_prior_mu = def_ppg
        def_prior_sigma = self.PRIOR_DEF_SIGMA

        # --- Playoff data as observations ---
        # Extract individual playoff game scores if available, otherwise
        # use aggregate playoff PPG
        playoff_wins = int(self._safe_get(team_stats, "playoff", "wins", default=0))
        playoff_losses = int(self._safe_get(team_stats, "playoff", "losses", default=0))
        playoff_games = playoff_wins + playoff_losses

        playoff_scores = []
        playoff_opp_scores = []

        # Try to get individual game scores
        playoff_game_data = team_stats.get("playoff", {}).get("games", [])
        if isinstance(playoff_game_data, list) and len(playoff_game_data) > 0:
            for game in playoff_game_data:
                if isinstance(game, dict):
                    score = game.get("points_for", None)
                    opp_score = game.get("points_against", None)
                    if score is not None:
                        playoff_scores.append(float(score))
                    if opp_score is not None:
                        playoff_opp_scores.append(float(opp_score))

        # Fall back to aggregate PPG if individual games not available
        if not playoff_scores and playoff_games > 0:
            p_ppg = self._safe_get(team_stats, "playoff", "points_per_game", default=0)
            if p_ppg > 0:
                playoff_scores = [p_ppg] * playoff_games

        if not playoff_opp_scores and playoff_games > 0:
            p_opp_ppg = self._safe_get(team_stats, "playoff", "opp_points_per_game", default=0)
            if p_opp_ppg > 0:
                playoff_opp_scores = [p_opp_ppg] * playoff_games

        # --- Bayesian update ---
        off_post_mu, off_post_sigma = self._bayesian_update_normal(
            off_prior_mu, off_prior_sigma,
            playoff_scores, self.PLAYOFF_GAME_SIGMA
        )

        def_post_mu, def_post_sigma = self._bayesian_update_normal(
            def_prior_mu, def_prior_sigma,
            playoff_opp_scores, self.PLAYOFF_GAME_SIGMA
        )

        return {
            "off_mu": off_post_mu,
            "off_sigma": off_post_sigma,
            "def_mu": def_post_mu,
            "def_sigma": def_post_sigma,
            "prior_off_mu": off_ppg,
            "prior_def_mu": def_ppg,
            "n_playoff_obs": len(playoff_scores),
        }

    def get_distribution(self, patriots_stats=None, seahawks_stats=None):
        """
        Get the full probability distribution of the game margin.

        Parameters
        ----------
        patriots_stats : dict, optional
            Patriots team stats. Uses cached if not provided.
        seahawks_stats : dict, optional
            Seahawks team stats. Uses cached if not provided.

        Returns
        -------
        dict
            Distribution parameters and derived quantities:
                - margin_mu: Mean of margin distribution (NE - SEA)
                - margin_sigma: Std dev of margin distribution
                - distribution: scipy.stats.norm frozen distribution
                - credible_50: tuple (lower, upper) for 50% CI
                - credible_90: tuple (lower, upper) for 90% CI
                - credible_95: tuple (lower, upper) for 95% CI
                - prob_ne_wins: P(NE wins)
                - prob_sea_wins: P(SEA wins)
                - prob_ne_covers_4_5: P(NE covers +4.5)
                - prob_sea_covers_4_5: P(SEA covers -4.5)
                - margin_pdf_x: np.ndarray x values for plotting
                - margin_pdf_y: np.ndarray PDF values for plotting
        """
        patriots_stats = patriots_stats or {}
        seahawks_stats = seahawks_stats or {}

        pat_post = self._build_team_posterior(patriots_stats)
        sea_post = self._build_team_posterior(seahawks_stats)

        # NE projected score ~ N(off_mu_NE, off_sigma_NE^2) cross-matched
        # with SEA defense ~ N(def_mu_SEA, def_sigma_SEA^2)
        # Projected NE score = average of NE offense and SEA defense allowed
        ne_score_mu = (pat_post["off_mu"] + sea_post["def_mu"]) / 2.0
        ne_score_var = (pat_post["off_sigma"] ** 2 + sea_post["def_sigma"] ** 2) / 4.0

        sea_score_mu = (sea_post["off_mu"] + pat_post["def_mu"]) / 2.0
        sea_score_var = (sea_post["off_sigma"] ** 2 + pat_post["def_sigma"] ** 2) / 4.0

        # Margin = NE score - SEA score
        margin_mu = ne_score_mu - sea_score_mu
        margin_var = ne_score_var + sea_score_var  # Independent
        margin_sigma = np.sqrt(margin_var)

        # Create frozen distribution
        margin_dist = stats.norm(loc=margin_mu, scale=margin_sigma)

        # Probabilities
        prob_ne_wins = float(1.0 - margin_dist.cdf(0))
        prob_sea_wins = float(margin_dist.cdf(0))

        # Cover probabilities (NE is +4.5 underdog)
        # NE covers +4.5 if margin > -4.5
        prob_ne_covers = float(1.0 - margin_dist.cdf(-4.5))
        # SEA covers -4.5 if margin < -4.5
        prob_sea_covers = float(margin_dist.cdf(-4.5))

        # Credible intervals
        ci_50 = margin_dist.interval(0.50)
        ci_90 = margin_dist.interval(0.90)
        ci_95 = margin_dist.interval(0.95)

        # PDF for plotting
        x_range = np.linspace(margin_mu - 4 * margin_sigma,
                              margin_mu + 4 * margin_sigma, 500)
        pdf_y = margin_dist.pdf(x_range)

        return {
            "margin_mu": round(margin_mu, 2),
            "margin_sigma": round(margin_sigma, 2),
            "distribution": margin_dist,
            "credible_50": (round(ci_50[0], 1), round(ci_50[1], 1)),
            "credible_90": (round(ci_90[0], 1), round(ci_90[1], 1)),
            "credible_95": (round(ci_95[0], 1), round(ci_95[1], 1)),
            "prob_ne_wins": round(prob_ne_wins, 4),
            "prob_sea_wins": round(prob_sea_wins, 4),
            "prob_ne_covers_4_5": round(prob_ne_covers, 4),
            "prob_sea_covers_4_5": round(prob_sea_covers, 4),
            "margin_pdf_x": x_range,
            "margin_pdf_y": pdf_y,
            "patriots_posterior": pat_post,
            "seahawks_posterior": sea_post,
            "ne_score_mu": round(ne_score_mu, 2),
            "sea_score_mu": round(sea_score_mu, 2),
        }

    def predict(self, patriots_stats, seahawks_stats):
        """
        Predict the Super Bowl outcome using Bayesian inference.

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
                - margin_sigma: float (uncertainty)
                - credible_intervals: dict
                - cover_probabilities: dict
                - posterior_summary: dict
                - model_name: str
        """
        patriots_stats = patriots_stats or {}
        seahawks_stats = seahawks_stats or {}

        dist_result = self.get_distribution(patriots_stats, seahawks_stats)

        # Predicted spread is the mean of the margin distribution
        predicted_spread = dist_result["margin_mu"]

        # Predicted total from projected scores
        predicted_total = dist_result["ne_score_mu"] + dist_result["sea_score_mu"]
        # Regress slightly toward historical
        predicted_total = 0.65 * predicted_total + 0.35 * self.HISTORICAL_SB_TOTAL

        return {
            "patriots_win_prob": dist_result["prob_ne_wins"],
            "seahawks_win_prob": dist_result["prob_sea_wins"],
            "predicted_spread": round(predicted_spread, 1),
            "predicted_total": round(predicted_total, 1),
            "margin_sigma": dist_result["margin_sigma"],
            "credible_intervals": {
                "50_pct": dist_result["credible_50"],
                "90_pct": dist_result["credible_90"],
                "95_pct": dist_result["credible_95"],
            },
            "cover_probabilities": {
                "ne_covers_plus_4_5": dist_result["prob_ne_covers_4_5"],
                "sea_covers_minus_4_5": dist_result["prob_sea_covers_4_5"],
            },
            "posterior_summary": {
                "ne_off_mu": round(dist_result["patriots_posterior"]["off_mu"], 1),
                "ne_def_mu": round(dist_result["patriots_posterior"]["def_mu"], 1),
                "sea_off_mu": round(dist_result["seahawks_posterior"]["off_mu"], 1),
                "sea_def_mu": round(dist_result["seahawks_posterior"]["def_mu"], 1),
            },
            "model_name": "Bayesian Inference Model",
        }
