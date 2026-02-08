"""
Data loading module for the Super Bowl XLIX Prediction Engine.

Loads and validates JSON configuration files containing team stats,
player stats, intangible factors, and Vegas lines used by the
prediction models.
"""

import json
import warnings
from pathlib import Path
from typing import Any, Dict, Optional


# Default values used when required fields are missing from team stats
TEAM_STATS_DEFAULTS = {
    "wins": 0,
    "losses": 0,
    "points_scored": 0,
    "points_allowed": 0,
    "total_yards": 0,
    "yards_allowed": 0,
    "turnovers_forced": 0,
    "turnovers_lost": 0,
    "third_down_pct": 0.0,
    "red_zone_pct": 0.0,
    "sacks": 0,
    "sacks_allowed": 0,
    "rushing_yards": 0,
    "passing_yards": 0,
    "rushing_yards_allowed": 0,
    "passing_yards_allowed": 0,
    "penalty_yards": 0,
    "time_of_possession": "30:00",
}

REQUIRED_TEAM_KEYS = ["wins", "losses", "points_scored", "points_allowed"]


class DataLoader:
    """Loads and validates all JSON configuration data for the prediction engine.

    The loader expects config files to live in a ``config/`` directory at the
    project root (one level above the ``data/`` package).

    Attributes:
        config_dir: Resolved path to the configuration directory.
    """

    def __init__(self, config_dir: Optional[Path] = None) -> None:
        """Initialise the data loader.

        Args:
            config_dir: Override path for the config directory.  When *None*
                the loader derives the path relative to this source file:
                ``<project_root>/config``.
        """
        if config_dir is not None:
            self.config_dir = Path(config_dir)
        else:
            self.config_dir = Path(__file__).parent.parent / "config"

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _load_json(self, filename: str) -> Optional[Dict[str, Any]]:
        """Read and parse a single JSON file from the config directory.

        Args:
            filename: Name of the JSON file (e.g. ``"team_stats.json"``).

        Returns:
            Parsed dictionary on success, or *None* if the file cannot be
            found or contains invalid JSON.
        """
        filepath = self.config_dir / filename

        try:
            with open(filepath, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except FileNotFoundError:
            warnings.warn(
                f"Configuration file not found: {filepath}. "
                f"Returning None for this data source.",
                UserWarning,
                stacklevel=3,
            )
            return None
        except json.JSONDecodeError as exc:
            warnings.warn(
                f"Invalid JSON in {filepath}: {exc}. "
                f"Returning None for this data source.",
                UserWarning,
                stacklevel=3,
            )
            return None

        return data

    # ------------------------------------------------------------------
    # Public loaders
    # ------------------------------------------------------------------

    def load_team_stats(self) -> Optional[Dict[str, Any]]:
        """Load team statistics from ``config/team_stats.json``.

        The returned dictionary is expected to have top-level keys
        ``'patriots'`` and ``'seahawks'``, each mapping to a dict of
        season statistics.  Missing fields in either team's data are
        back-filled with sensible defaults via :meth:`validate_team_stats`.

        Returns:
            Dictionary with ``'patriots'`` and ``'seahawks'`` keys, or
            *None* when the file is missing / unparseable.
        """
        data = self._load_json("team_stats.json")

        if data is not None:
            data = self.validate_team_stats(data)

        return data

    def load_player_stats(self) -> Optional[Dict[str, Any]]:
        """Load player statistics from ``config/player_stats.json``.

        Returns:
            Parsed player stats dictionary, or *None* when the file is
            missing / unparseable.
        """
        return self._load_json("player_stats.json")

    def load_intangibles(self) -> Optional[Dict[str, Any]]:
        """Load intangible / situational factors from ``config/intangibles.json``.

        Returns:
            Parsed intangibles dictionary, or *None* when the file is
            missing / unparseable.
        """
        return self._load_json("intangibles.json")

    def load_vegas_lines(self) -> Optional[Dict[str, Any]]:
        """Load Vegas betting lines from ``config/vegas_lines.json``.

        Returns:
            Parsed Vegas lines dictionary, or *None* when the file is
            missing / unparseable.
        """
        return self._load_json("vegas_lines.json")

    def load_all(self) -> Dict[str, Optional[Dict[str, Any]]]:
        """Load every available configuration file at once.

        Returns:
            Dictionary with the following keys, each mapping to its
            respective parsed data (or *None* on failure):

            - ``"team_stats"``
            - ``"player_stats"``
            - ``"intangibles"``
            - ``"vegas_lines"``
        """
        return {
            "team_stats": self.load_team_stats(),
            "player_stats": self.load_player_stats(),
            "intangibles": self.load_intangibles(),
            "vegas_lines": self.load_vegas_lines(),
        }

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def validate_team_stats(self, stats: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and back-fill team statistics.

        Ensures the top-level dictionary contains both ``'patriots'`` and
        ``'seahawks'`` keys.  For each team, any field listed in
        :data:`TEAM_STATS_DEFAULTS` that is absent from the data is
        filled in with its default value.  A warning is emitted for every
        field that required a default.

        Args:
            stats: Raw parsed team stats dictionary.

        Returns:
            The same dictionary, mutated in place with defaults applied.
        """
        for team in ("patriots", "seahawks"):
            if team not in stats:
                warnings.warn(
                    f"Team '{team}' missing from team_stats. "
                    f"Creating entry with all default values.",
                    UserWarning,
                    stacklevel=2,
                )
                stats[team] = dict(TEAM_STATS_DEFAULTS)
                continue

            team_data = stats[team]
            missing_fields = []

            for field, default in TEAM_STATS_DEFAULTS.items():
                if field not in team_data:
                    team_data[field] = default
                    missing_fields.append(field)

            if missing_fields:
                warnings.warn(
                    f"Team '{team}' was missing fields that were filled "
                    f"with defaults: {', '.join(missing_fields)}",
                    UserWarning,
                    stacklevel=2,
                )

        # Validate that critical numeric fields are non-negative
        for team in ("patriots", "seahawks"):
            team_data = stats[team]
            for field in REQUIRED_TEAM_KEYS:
                value = team_data.get(field)
                if not isinstance(value, (int, float)):
                    warnings.warn(
                        f"Team '{team}' field '{field}' has non-numeric "
                        f"value {value!r}; resetting to 0.",
                        UserWarning,
                        stacklevel=2,
                    )
                    team_data[field] = 0
                elif value < 0:
                    warnings.warn(
                        f"Team '{team}' field '{field}' is negative "
                        f"({value}); resetting to 0.",
                        UserWarning,
                        stacklevel=2,
                    )
                    team_data[field] = 0

        # Normalize keys for model compatibility
        for team in ("patriots", "seahawks"):
            self._normalize_team_data(stats[team])

        return stats

    def _normalize_team_data(self, team_data: Dict[str, Any]) -> None:
        """Normalize team stats keys so all models can find them.

        Handles mismatches between the JSON structure and what prediction
        models expect.  Mutates *team_data* in place.
        """
        # --- Flatten points_per_game dicts to floats ---
        offense = team_data.get("offense", {})
        defense = team_data.get("defense", {})
        advanced = team_data.get("advanced", {})
        playoff = team_data.get("playoff", {})

        # offense.points_per_game: dict → float
        ppg = offense.get("points_per_game")
        if isinstance(ppg, dict):
            offense["points_per_game"] = ppg.get("overall", 22.0)

        # defense.points_allowed_per_game → also set as defense.points_per_game
        dppg = defense.get("points_allowed_per_game")
        if isinstance(dppg, dict):
            defense["points_allowed_per_game"] = dppg.get("overall", 22.0)
            dppg = defense["points_allowed_per_game"]
        if "points_per_game" not in defense and dppg is not None:
            defense["points_per_game"] = dppg

        # --- Advanced stat aliases for Efficiency model ---
        # off_epa_per_play / def_epa_per_play
        if "off_epa_per_play" not in advanced:
            advanced["off_epa_per_play"] = offense.get("epa_per_play", 0.0)
        if "def_epa_per_play" not in advanced:
            advanced["def_epa_per_play"] = defense.get("epa_per_play_allowed", 0.0)

        # Success rate aliases
        if "off_success_rate" not in advanced:
            advanced["off_success_rate"] = offense.get("success_rate", 0.45)
        if "def_success_rate" not in advanced:
            advanced["def_success_rate"] = defense.get("success_rate_allowed", 0.45)

        # Explosive play rate aliases
        if "off_explosive_rate" not in advanced:
            advanced["off_explosive_rate"] = offense.get("explosive_play_rate", 0.06)
        if "def_explosive_rate" not in advanced:
            advanced["def_explosive_rate"] = 0.06  # Default if not available

        # SOS alias
        if "sos" not in advanced:
            advanced["sos"] = advanced.get("strength_of_schedule", 0.500)

        # DVOA: convert percentage values to approximate rankings
        dvoa = advanced.get("dvoa", {})
        if isinstance(dvoa, dict):
            # Higher DVOA % = better team = lower rank
            # Rough mapping: top 5 DVOA% > 20, rank ~1-5; 10-20 rank ~5-12; etc.
            def dvoa_pct_to_rank(pct, is_defense=False):
                """Convert DVOA percentage to approximate rank (1-32)."""
                if is_defense:
                    # For defense, more negative DVOA = better
                    # -15% ≈ rank 1, 0% ≈ rank 16, +15% ≈ rank 32
                    return max(1, min(32, int(16 - pct)))
                else:
                    # For offense/total, higher DVOA = better
                    # +30% ≈ rank 1, 0% ≈ rank 16, -30% ≈ rank 32
                    return max(1, min(32, int(16 - pct * 0.5)))

            if "dvoa_rank" not in advanced:
                total_dvoa = dvoa.get("total", 0)
                advanced["dvoa_rank"] = dvoa_pct_to_rank(total_dvoa)
            if "off_dvoa_rank" not in advanced:
                off_dvoa = dvoa.get("offense", 0)
                advanced["off_dvoa_rank"] = dvoa_pct_to_rank(off_dvoa)
            if "def_dvoa_rank" not in advanced:
                def_dvoa = dvoa.get("defense", 0)
                advanced["def_dvoa_rank"] = dvoa_pct_to_rank(def_dvoa, is_defense=True)

        # --- Playoff stat aliases ---
        # playoff.wins / playoff.losses (may be nested under record)
        playoff_record = playoff.get("record", {})
        if isinstance(playoff_record, dict):
            if "wins" not in playoff:
                playoff["wins"] = playoff_record.get("wins", 0)
            if "losses" not in playoff:
                playoff["losses"] = playoff_record.get("losses", 0)

        # playoff.opp_points_per_game alias
        if "opp_points_per_game" not in playoff:
            playoff["opp_points_per_game"] = playoff.get("points_allowed_per_game", 0)
