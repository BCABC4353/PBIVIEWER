"""
Logistic/Linear Regression Model for Super Bowl LX Prediction
==============================================================

Methodology:
    This model uses two sklearn regression models trained on synthetic
    historical Super Bowl and playoff data:

    1. LogisticRegression  -> Win probability (binary: did team A win?)
    2. LinearRegression    -> Predicted point spread (team A margin)

    Feature vector (computed as Team A minus Team B differentials):
        - off_epa_diff:       Offensive EPA/play differential
        - def_epa_diff:       Defensive EPA/play differential (lower = better D)
        - turnover_diff:      Turnover margin differential
        - third_down_diff:    3rd-down conversion rate differential
        - red_zone_off_diff:  Red zone TD rate differential
        - sos_diff:           Strength of schedule differential

    Synthetic training data is generated from realistic NFL distributions
    calibrated to historical playoff and Super Bowl outcomes. The distributions
    are seeded for reproducibility.

    The predicted total is estimated from a separate linear model using
    the sum (rather than difference) of offensive/defensive metrics.

Assumptions:
    - Feature distributions are approximately normal with parameters
      calibrated to recent NFL seasons.
    - 2,000 synthetic matchups are generated for training.
    - The logistic model produces calibrated probabilities.
    - Missing stats default to league-average values (0 for differentials).
"""

import numpy as np
from sklearn.linear_model import LogisticRegression, LinearRegression


class RegressionModel:
    """Logistic and linear regression prediction model for NFL games."""

    # Feature names in the order they appear in the feature vector
    FEATURE_NAMES = [
        "off_epa_diff",
        "def_epa_diff",
        "turnover_diff",
        "third_down_diff",
        "red_zone_off_diff",
        "sos_diff",
    ]

    # Number of synthetic training samples
    N_TRAIN = 2000
    RANDOM_SEED = 2026

    def __init__(self):
        """Initialize and train the regression models on synthetic data."""
        self._logistic = LogisticRegression(max_iter=1000, random_state=self.RANDOM_SEED)
        self._linear_spread = LinearRegression()
        self._linear_total = LinearRegression()
        self._is_trained = False
        self._train()

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

    def _generate_training_data(self):
        """
        Generate synthetic training data based on realistic NFL distributions.

        Each sample represents a hypothetical matchup with feature differentials
        and a known outcome (win/loss and point margin).

        Returns
        -------
        X : np.ndarray, shape (N_TRAIN, 6)
            Feature matrix of differentials.
        y_win : np.ndarray, shape (N_TRAIN,)
            Binary outcome: 1 = team A wins, 0 = team A loses.
        y_spread : np.ndarray, shape (N_TRAIN,)
            Point margin for team A (positive = A wins by that many).
        X_total_features : np.ndarray, shape (N_TRAIN, 4)
            Sum-based features for total prediction.
        y_total : np.ndarray, shape (N_TRAIN,)
            Combined total points.
        """
        rng = np.random.RandomState(self.RANDOM_SEED)

        # --- Generate individual team stats for A and B ---
        # EPA/play: mean ~0.0, std ~0.08 (NFL range roughly -0.15 to +0.20)
        off_epa_a = rng.normal(0.02, 0.08, self.N_TRAIN)
        off_epa_b = rng.normal(0.02, 0.08, self.N_TRAIN)
        def_epa_a = rng.normal(0.00, 0.07, self.N_TRAIN)  # lower = better
        def_epa_b = rng.normal(0.00, 0.07, self.N_TRAIN)

        # Turnover margin per game: mean ~0, std ~0.8
        to_a = rng.normal(0.0, 0.8, self.N_TRAIN)
        to_b = rng.normal(0.0, 0.8, self.N_TRAIN)

        # 3rd-down rate: mean ~40%, std ~5%
        third_a = rng.normal(0.40, 0.05, self.N_TRAIN)
        third_b = rng.normal(0.40, 0.05, self.N_TRAIN)

        # Red zone TD rate: mean ~57%, std ~8%
        rz_a = rng.normal(0.57, 0.08, self.N_TRAIN)
        rz_b = rng.normal(0.57, 0.08, self.N_TRAIN)

        # SOS: mean 0, std 0.3
        sos_a = rng.normal(0.0, 0.3, self.N_TRAIN)
        sos_b = rng.normal(0.0, 0.3, self.N_TRAIN)

        # --- Build feature differentials (A - B) ---
        off_epa_diff = off_epa_a - off_epa_b
        def_epa_diff = def_epa_a - def_epa_b  # negative = A has better D
        turnover_diff = to_a - to_b
        third_down_diff = third_a - third_b
        red_zone_diff = rz_a - rz_b
        sos_diff = sos_a - sos_b

        X = np.column_stack([
            off_epa_diff,
            def_epa_diff,
            turnover_diff,
            third_down_diff,
            red_zone_diff,
            sos_diff,
        ])

        # --- Generate realistic outcomes ---
        # True spread is a weighted combination of features + noise
        # Weights calibrated so that an EPA diff of 0.10 ~ 5-6 points
        weights = np.array([55.0, -45.0, 2.5, 25.0, 15.0, 3.0])
        true_spread = X @ weights + rng.normal(0, 7.0, self.N_TRAIN)  # ~7pt game noise
        y_spread = true_spread
        y_win = (true_spread > 0).astype(int)

        # --- Total points features (sums, not diffs) ---
        off_epa_sum = off_epa_a + off_epa_b
        def_epa_sum = def_epa_a + def_epa_b
        rz_sum = rz_a + rz_b
        third_sum = third_a + third_b

        X_total = np.column_stack([off_epa_sum, def_epa_sum, rz_sum, third_sum])

        # Total points: baseline ~46, influenced by combined offensive quality
        total_weights = np.array([40.0, -30.0, 10.0, 8.0])
        y_total = 46.0 + X_total @ total_weights + rng.normal(0, 6.0, self.N_TRAIN)

        return X, y_win, y_spread, X_total, y_total

    def _train(self):
        """Train the logistic, spread, and total models on synthetic data."""
        X, y_win, y_spread, X_total, y_total = self._generate_training_data()

        self._logistic.fit(X, y_win)
        self._linear_spread.fit(X, y_spread)
        self._linear_total.fit(X_total, y_total)
        self._is_trained = True

    def _extract_features(self, patriots_stats, seahawks_stats):
        """
        Extract the feature differential vector from two team stat dicts.

        Parameters
        ----------
        patriots_stats : dict
            Patriots statistics.
        seahawks_stats : dict
            Seahawks statistics.

        Returns
        -------
        X_diff : np.ndarray, shape (1, 6)
            Differential features for the matchup.
        X_total : np.ndarray, shape (1, 4)
            Sum features for total estimation.
        """
        # Offensive EPA/play
        off_epa_a = self._safe_get(patriots_stats, "advanced", "off_epa_per_play", default=0.02)
        off_epa_b = self._safe_get(seahawks_stats, "advanced", "off_epa_per_play", default=0.02)

        # Defensive EPA/play (lower = better)
        def_epa_a = self._safe_get(patriots_stats, "advanced", "def_epa_per_play", default=0.00)
        def_epa_b = self._safe_get(seahawks_stats, "advanced", "def_epa_per_play", default=0.00)

        # Turnover differential
        to_a = self._safe_get(patriots_stats, "offense", "turnover_diff", default=0.0)
        to_b = self._safe_get(seahawks_stats, "offense", "turnover_diff", default=0.0)

        # 3rd-down conversion rate
        third_a = self._safe_get(patriots_stats, "offense", "third_down_pct", default=0.40)
        third_b = self._safe_get(seahawks_stats, "offense", "third_down_pct", default=0.40)

        # Red zone TD rate
        rz_a = self._safe_get(patriots_stats, "offense", "red_zone_td_pct", default=0.57)
        rz_b = self._safe_get(seahawks_stats, "offense", "red_zone_td_pct", default=0.57)

        # Strength of schedule
        sos_a = self._safe_get(patriots_stats, "advanced", "sos", default=0.0)
        sos_b = self._safe_get(seahawks_stats, "advanced", "sos", default=0.0)

        X_diff = np.array([[
            off_epa_a - off_epa_b,
            def_epa_a - def_epa_b,
            to_a - to_b,
            third_a - third_b,
            rz_a - rz_b,
            sos_a - sos_b,
        ]])

        X_total = np.array([[
            off_epa_a + off_epa_b,
            def_epa_a + def_epa_b,
            rz_a + rz_b,
            third_a + third_b,
        ]])

        return X_diff, X_total

    def predict(self, patriots_stats, seahawks_stats):
        """
        Predict the Super Bowl outcome using regression models.

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
                - feature_importances: dict mapping feature name to coefficient
                - model_name: str
        """
        patriots_stats = patriots_stats or {}
        seahawks_stats = seahawks_stats or {}

        if not self._is_trained:
            self._train()

        X_diff, X_total = self._extract_features(patriots_stats, seahawks_stats)

        # Win probability from logistic regression
        win_prob_a = self._logistic.predict_proba(X_diff)[0]
        # predict_proba returns [P(class=0), P(class=1)]
        # class 1 = team A (Patriots) wins
        pat_win_prob = float(win_prob_a[1])
        sea_win_prob = 1.0 - pat_win_prob

        # Spread from linear regression (positive = NE favored)
        predicted_spread = float(self._linear_spread.predict(X_diff)[0])

        # Total from linear regression
        predicted_total = float(self._linear_total.predict(X_total)[0])
        predicted_total = max(predicted_total, 28.0)  # Floor at 28 for realism

        # Feature importances from logistic model
        importances = {}
        for i, name in enumerate(self.FEATURE_NAMES):
            importances[name] = round(float(self._logistic.coef_[0][i]), 4)

        return {
            "patriots_win_prob": round(pat_win_prob, 4),
            "seahawks_win_prob": round(sea_win_prob, 4),
            "predicted_spread": round(predicted_spread, 1),
            "predicted_total": round(predicted_total, 1),
            "feature_importances": importances,
            "model_name": "Logistic/Linear Regression Model",
        }
