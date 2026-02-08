"""
Prop Analyzer - Player prop bet analysis for Super Bowl LX
==========================================================

Analyzes player prop bets (rushing, receiving, passing, anytime TD)
by comparing Vegas lines to projected values derived from season averages,
playoff trends, opponent defensive stats, and game-script adjustments.

Game-script note: Seattle is a 4.5-point favorite, meaning New England
is more likely to be trailing and therefore passing at a higher rate
in the second half.
"""

import numpy as np
from typing import Dict, List, Optional, Any


class PropAnalyzer:
    """Analyze player prop bets using statistical projections."""

    # Game-script pass-rate adjustments when trailing / leading
    # Trailing team passes more, leading team runs more
    TRAILING_PASS_RATE_BOOST = 0.06    # +6% pass rate when trailing
    LEADING_RUN_RATE_BOOST = 0.05      # +5% run rate when leading

    # Playoff scaling factor: postseason usage tends to concentrate
    # on top options and efficiency can shift
    PLAYOFF_VARIANCE_MULTIPLIER = 1.10  # 10% wider variance in playoffs

    # Minimum games to trust a sample
    MIN_SAMPLE_SIZE = 6

    def __init__(self, player_stats: Dict[str, Dict[str, Any]],
                 team_stats: Dict[str, Dict[str, Any]]) -> None:
        """
        Initialize with player-level and team-level statistics.

        Parameters
        ----------
        player_stats : dict
            Keyed by player name (e.g., "Drake Maye"). Each value is a dict:
                team                  : str ("NE" or "SEA")
                position              : str ("QB", "RB", "WR", "TE")
                games_played          : int
                rushing_yards_per_game: float
                rushing_attempts_per_game: float
                rushing_tds_per_game  : float
                receiving_yards_per_game: float
                receptions_per_game   : float
                receiving_tds_per_game: float
                targets_per_game      : float
                passing_yards_per_game: float  (QBs only)
                passing_tds_per_game  : float  (QBs only)
                passing_attempts_per_game: float (QBs only)
                completions_per_game  : float  (QBs only)
                interceptions_per_game: float  (QBs only)
                red_zone_targets_per_game: float
                red_zone_carries_per_game: float
                snap_share            : float  (0-1)
                playoff_games         : int
                playoff_rushing_ypg   : float  (optional)
                playoff_receiving_ypg : float  (optional)
                playoff_passing_ypg   : float  (optional)

        team_stats : dict
            Keyed by team abbreviation ("NE", "SEA"). Each value is a dict:
                pass_yards_allowed_per_game    : float
                rush_yards_allowed_per_game    : float
                pass_tds_allowed_per_game      : float
                rush_tds_allowed_per_game      : float
                total_tds_allowed_per_game     : float
                pass_yards_per_game            : float
                rush_yards_per_game            : float
                offensive_plays_per_game       : float
                pass_rate                      : float  (0-1)
                red_zone_td_rate_allowed       : float  (0-1)
                sack_rate                      : float  (defense sacks / opponent dropbacks)
                yards_per_play_allowed         : float
                league_rank_pass_defense       : int    (1=best)
                league_rank_rush_defense       : int
        """
        self.player_stats = player_stats
        self.team_stats = team_stats

        # Pre-compute opponent mapping
        self._opponent = {"NE": "SEA", "SEA": "NE"}

        # Pre-compute league averages for normalization (approximate 2025-26)
        self.league_avg = {
            "pass_yards_per_game": 225.0,
            "rush_yards_per_game": 120.0,
            "pass_tds_per_game": 1.5,
            "rush_tds_per_game": 0.8,
            "total_tds_per_game": 2.3,
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyze_rushing_prop(self, player: str, line: float) -> Dict[str, Any]:
        """
        Analyze a rushing yards over/under prop.

        Parameters
        ----------
        player : str
            Player name matching a key in player_stats.
        line : float
            Vegas prop line (e.g., 37.5 for Maye rushing yards).

        Returns
        -------
        dict with projected_value, over_probability, under_probability,
             edge, recommendation, and supporting detail.
        """
        ps = self._get_player(player)
        team = ps["team"]
        opp = self._opponent[team]
        opp_stats = self.team_stats[opp]

        # Base projection: season average
        base_ypg = ps["rushing_yards_per_game"]

        # Defensive adjustment: compare opponent rush D to league average
        def_rush_allowed = opp_stats["rush_yards_allowed_per_game"]
        def_factor = def_rush_allowed / self.league_avg["rush_yards_per_game"]

        # Game-script adjustment: if team is favored, slightly more rushing;
        # if underdog, slightly less rushing (need to pass to come back)
        game_script_adj = self._rushing_game_script_adj(team)

        # Playoff trend adjustment
        playoff_adj = self._playoff_adjustment(ps, "rushing")

        # Projected rushing yards
        projected = base_ypg * def_factor * game_script_adj * playoff_adj

        # Estimate standard deviation from sample
        # Using a heuristic: rushing yards SD ~ 55-65% of mean for most players
        sample_sd = max(base_ypg * 0.60, 15.0)
        sample_sd *= self.PLAYOFF_VARIANCE_MULTIPLIER

        # Probability over/under using normal approximation
        over_prob, under_prob = self._normal_over_under(projected, sample_sd, line)

        edge = projected - line
        recommendation = self._prop_recommendation(edge, over_prob, under_prob, line)

        return {
            "player": player,
            "prop_type": "rushing_yards",
            "line": line,
            "projected_value": round(projected, 1),
            "season_avg": round(base_ypg, 1),
            "defensive_factor": round(def_factor, 3),
            "game_script_adj": round(game_script_adj, 3),
            "playoff_adj": round(playoff_adj, 3),
            "estimated_sd": round(sample_sd, 1),
            "over_probability": round(over_prob, 4),
            "under_probability": round(under_prob, 4),
            "edge": round(edge, 1),
            "recommendation": recommendation,
            "opponent_rush_defense_rank": opp_stats.get("league_rank_rush_defense", "N/A"),
        }

    def analyze_receiving_prop(self, player: str, line: float) -> Dict[str, Any]:
        """
        Analyze a receiving yards over/under prop.

        Parameters
        ----------
        player : str
            Player name matching a key in player_stats.
        line : float
            Vegas prop line (e.g., 72.5 for receiving yards).

        Returns
        -------
        dict with projected_value, over_probability, under_probability,
             edge, recommendation.
        """
        ps = self._get_player(player)
        team = ps["team"]
        opp = self._opponent[team]
        opp_stats = self.team_stats[opp]

        base_ypg = ps["receiving_yards_per_game"]

        # Defensive adjustment for pass defense
        def_pass_allowed = opp_stats["pass_yards_allowed_per_game"]
        def_factor = def_pass_allowed / self.league_avg["pass_yards_per_game"]

        # Game-script: underdog receivers get a boost (more passing volume)
        game_script_adj = self._receiving_game_script_adj(team)

        # Target share preservation: if this player has a high target share,
        # extra pass volume benefits them proportionally
        target_share_boost = self._target_share_boost(ps, team)

        playoff_adj = self._playoff_adjustment(ps, "receiving")

        projected = base_ypg * def_factor * game_script_adj * target_share_boost * playoff_adj

        # Receiving yards SD is typically higher than rushing
        sample_sd = max(base_ypg * 0.65, 20.0)
        sample_sd *= self.PLAYOFF_VARIANCE_MULTIPLIER

        over_prob, under_prob = self._normal_over_under(projected, sample_sd, line)
        edge = projected - line
        recommendation = self._prop_recommendation(edge, over_prob, under_prob, line)

        return {
            "player": player,
            "prop_type": "receiving_yards",
            "line": line,
            "projected_value": round(projected, 1),
            "season_avg": round(base_ypg, 1),
            "defensive_factor": round(def_factor, 3),
            "game_script_adj": round(game_script_adj, 3),
            "target_share_boost": round(target_share_boost, 3),
            "playoff_adj": round(playoff_adj, 3),
            "estimated_sd": round(sample_sd, 1),
            "over_probability": round(over_prob, 4),
            "under_probability": round(under_prob, 4),
            "edge": round(edge, 1),
            "recommendation": recommendation,
            "opponent_pass_defense_rank": opp_stats.get("league_rank_pass_defense", "N/A"),
        }

    def analyze_passing_prop(self, player: str, line: float,
                             prop_type: str = "passing_yards") -> Dict[str, Any]:
        """
        Analyze a passing yards or passing TDs over/under prop.

        Parameters
        ----------
        player : str
            Quarterback name.
        line : float
            Vegas prop line (e.g., 245.5 for passing yards, 1.5 for TDs).
        prop_type : str
            "passing_yards" or "passing_tds".

        Returns
        -------
        dict with projected_value, over_probability, under_probability,
             edge, recommendation.
        """
        ps = self._get_player(player)
        team = ps["team"]
        opp = self._opponent[team]
        opp_stats = self.team_stats[opp]

        if prop_type == "passing_yards":
            base = ps["passing_yards_per_game"]
            def_allowed = opp_stats["pass_yards_allowed_per_game"]
            league_avg = self.league_avg["pass_yards_per_game"]
            # Sack-rate adjustment: more sacks = fewer passing yards
            sack_adj = 1.0 - (opp_stats.get("sack_rate", 0.06) - 0.06) * 2.0
            sack_adj = np.clip(sack_adj, 0.85, 1.15)
            sd_pct = 0.30  # passing yards have tighter relative SD
            min_sd = 35.0
        elif prop_type == "passing_tds":
            base = ps["passing_tds_per_game"]
            def_allowed = opp_stats["pass_tds_allowed_per_game"]
            league_avg = self.league_avg["pass_tds_per_game"]
            sack_adj = 1.0
            sd_pct = 0.55
            min_sd = 0.7
        else:
            raise ValueError(f"Unknown prop_type: {prop_type}. Use 'passing_yards' or 'passing_tds'.")

        def_factor = def_allowed / league_avg

        # Game-script: underdog QBs throw more
        game_script_adj = self._passing_game_script_adj(team)

        playoff_adj = self._playoff_adjustment(ps, "passing")

        projected = base * def_factor * game_script_adj * sack_adj * playoff_adj

        sample_sd = max(base * sd_pct, min_sd)
        sample_sd *= self.PLAYOFF_VARIANCE_MULTIPLIER

        over_prob, under_prob = self._normal_over_under(projected, sample_sd, line)
        edge = projected - line
        recommendation = self._prop_recommendation(edge, over_prob, under_prob, line)

        result = {
            "player": player,
            "prop_type": prop_type,
            "line": line,
            "projected_value": round(projected, 2),
            "season_avg": round(base, 2),
            "defensive_factor": round(def_factor, 3),
            "game_script_adj": round(game_script_adj, 3),
            "playoff_adj": round(playoff_adj, 3),
            "estimated_sd": round(sample_sd, 2),
            "over_probability": round(over_prob, 4),
            "under_probability": round(under_prob, 4),
            "edge": round(edge, 2),
            "recommendation": recommendation,
            "opponent_pass_defense_rank": opp_stats.get("league_rank_pass_defense", "N/A"),
        }

        if prop_type == "passing_yards":
            result["sack_rate_adj"] = round(sack_adj, 3)

        return result

    def analyze_anytime_td(self, player: str, odds: int) -> Dict[str, Any]:
        """
        Analyze an anytime touchdown scorer prop.

        Parameters
        ----------
        player : str
            Player name.
        odds : int
            American odds for anytime TD (e.g., -120, +150).

        Returns
        -------
        dict with projected probability, implied probability from odds,
             edge, EV per dollar, and recommendation.
        """
        ps = self._get_player(player)
        team = ps["team"]
        opp = self._opponent[team]
        opp_stats = self.team_stats[opp]

        # Compute per-game TD probability from multiple sources
        rush_td_rate = ps.get("rushing_tds_per_game", 0.0)
        rec_td_rate = ps.get("receiving_tds_per_game", 0.0)
        pass_td_rate = ps.get("passing_tds_per_game", 0.0) if ps["position"] == "QB" else 0.0

        # For QBs, rushing TDs are the main anytime-TD path
        # (passing TDs don't count as "scorer" for the QB in most books)
        if ps["position"] == "QB":
            base_td_rate = rush_td_rate + rec_td_rate
        else:
            base_td_rate = rush_td_rate + rec_td_rate

        # Defensive adjustment: opponent TD rate allowed vs league average
        opp_total_td_allowed = opp_stats.get("total_tds_allowed_per_game",
                                              self.league_avg["total_tds_per_game"])
        def_td_factor = opp_total_td_allowed / self.league_avg["total_tds_per_game"]

        # Red zone opportunity adjustment
        rz_targets = ps.get("red_zone_targets_per_game", 0.0)
        rz_carries = ps.get("red_zone_carries_per_game", 0.0)
        rz_opps = rz_targets + rz_carries
        # Players with more red zone opportunities have higher TD upside
        rz_multiplier = 1.0 + min(rz_opps * 0.03, 0.20)  # cap at +20%

        # Game-script adjustment for TDs
        if team == "NE":
            # NE as underdog: slightly more passing TDs for pass-catchers,
            # but fewer rushing opportunities near goal line if trailing
            if ps["position"] in ("WR", "TE"):
                gs_adj = 1.05
            elif ps["position"] == "RB":
                gs_adj = 0.92
            else:  # QB
                gs_adj = 1.02  # rushing TD chance slightly up in desperation
        else:
            # SEA as favorite: may have more red zone opportunities from
            # controlling the game, especially on the ground
            if ps["position"] == "RB":
                gs_adj = 1.08
            else:
                gs_adj = 1.0

        # Opponent red zone TD rate allowed
        rz_td_rate_allowed = opp_stats.get("red_zone_td_rate_allowed", 0.55)
        rz_def_adj = rz_td_rate_allowed / 0.55  # normalize to league avg ~55%

        # Projected per-game TD probability
        projected_td_prob = base_td_rate * def_td_factor * rz_multiplier * gs_adj * rz_def_adj

        # Convert to anytime TD probability using Poisson-like approach
        # P(at least 1 TD) = 1 - P(0 TDs) ~ 1 - e^(-lambda)
        anytime_prob = 1.0 - np.exp(-projected_td_prob) if projected_td_prob > 0 else 0.0
        anytime_prob = float(np.clip(anytime_prob, 0.0, 0.99))

        # Implied probability from odds (with vig)
        implied_prob = self._american_to_implied(odds)

        # Edge and EV
        edge = anytime_prob - implied_prob
        decimal_odds = self._american_to_decimal(odds)
        ev_per_dollar = anytime_prob * (decimal_odds - 1) - (1 - anytime_prob)

        if edge > 0.03 and ev_per_dollar > 0:
            recommendation = (f"BET YES at {odds:+d}: model {anytime_prob:.1%} vs "
                              f"implied {implied_prob:.1%}, EV ${ev_per_dollar:.3f}")
        elif edge < -0.05:
            recommendation = (f"FADE at {odds:+d}: model {anytime_prob:.1%} vs "
                              f"implied {implied_prob:.1%}, negative EV")
        else:
            recommendation = (f"PASS: edge {edge:.1%} too thin "
                              f"(model {anytime_prob:.1%} vs implied {implied_prob:.1%})")

        return {
            "player": player,
            "prop_type": "anytime_td",
            "odds": odds,
            "projected_td_rate": round(projected_td_prob, 4),
            "anytime_td_probability": round(anytime_prob, 4),
            "implied_probability": round(implied_prob, 4),
            "edge": round(edge, 4),
            "ev_per_dollar": round(ev_per_dollar, 4),
            "over_probability": round(anytime_prob, 4),
            "under_probability": round(1.0 - anytime_prob, 4),
            "projected_value": round(anytime_prob, 4),
            "recommendation": recommendation,
            "breakdown": {
                "base_td_rate": round(base_td_rate, 4),
                "defensive_td_factor": round(def_td_factor, 3),
                "red_zone_multiplier": round(rz_multiplier, 3),
                "game_script_adj": round(gs_adj, 3),
                "rz_defense_adj": round(rz_def_adj, 3),
            },
        }

    def generate_prop_report(self) -> Dict[str, Any]:
        """
        Analyze all key player props for the Super Bowl LX matchup.

        Uses a standard set of props based on typical Super Bowl offerings.
        The lines here are defaults that should be overridden by loading
        from vegas_lines.json when available.

        Returns
        -------
        dict with:
            props_analyzed  : list of individual prop analysis dicts
            best_props      : list of top-3 value props sorted by edge
            summary         : str (human-readable)
            total_analyzed  : int
        """
        # Default prop lines (Super Bowl LX typical offerings)
        # These represent typical lines for a NE vs SEA Super Bowl
        default_props = self._build_default_prop_slate()

        all_results = []

        for prop in default_props:
            try:
                if prop["type"] == "rushing_yards":
                    result = self.analyze_rushing_prop(prop["player"], prop["line"])
                elif prop["type"] == "receiving_yards":
                    result = self.analyze_receiving_prop(prop["player"], prop["line"])
                elif prop["type"] == "passing_yards":
                    result = self.analyze_passing_prop(prop["player"], prop["line"],
                                                       prop_type="passing_yards")
                elif prop["type"] == "passing_tds":
                    result = self.analyze_passing_prop(prop["player"], prop["line"],
                                                       prop_type="passing_tds")
                elif prop["type"] == "anytime_td":
                    result = self.analyze_anytime_td(prop["player"], prop["odds"])
                else:
                    continue
                all_results.append(result)
            except KeyError:
                # Player not found in stats -- skip gracefully
                all_results.append({
                    "player": prop["player"],
                    "prop_type": prop["type"],
                    "error": f"Player '{prop['player']}' not found in player_stats",
                    "recommendation": "SKIP - missing data",
                })

        # Sort by absolute edge to find best value
        valid_results = [r for r in all_results if "edge" in r and "error" not in r]
        sorted_by_edge = sorted(valid_results,
                                key=lambda x: abs(x["edge"]),
                                reverse=True)
        best_props = sorted_by_edge[:3]

        # Build summary
        summary_lines = [
            "=" * 60,
            "  SUPER BOWL LX - PLAYER PROP ANALYSIS",
            "  Patriots vs Seahawks | SEA -4.5",
            "=" * 60,
            "",
            f"  Total props analyzed: {len(all_results)}",
            f"  Props with value:     {sum(1 for r in valid_results if abs(r.get('edge', 0)) > 0)}",
            "",
            "  TOP 3 VALUE PROPS:",
        ]

        for i, prop in enumerate(best_props, 1):
            summary_lines.append(
                f"    {i}. {prop['player']} {prop['prop_type']}: "
                f"projected {prop['projected_value']} vs line {prop.get('line', 'N/A')} "
                f"(edge {prop['edge']:+.1f})"
            )
            summary_lines.append(f"       {prop['recommendation']}")
            summary_lines.append("")

        summary_lines.append("=" * 60)
        summary = "\n".join(summary_lines)

        return {
            "props_analyzed": all_results,
            "best_props": best_props,
            "summary": summary,
            "total_analyzed": len(all_results),
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_player(self, player: str) -> Dict[str, Any]:
        """Retrieve player stats, raising KeyError with helpful message if missing."""
        if player not in self.player_stats:
            raise KeyError(
                f"Player '{player}' not found. Available: {list(self.player_stats.keys())}"
            )
        return self.player_stats[player]

    def _rushing_game_script_adj(self, team: str) -> float:
        """
        Adjust rushing projection based on expected game script.

        Favorites run more; underdogs run less (need to throw to catch up).
        """
        if team == "SEA":
            # SEA favored by 4.5 -> likely to have positive game script -> run more
            return 1.0 + self.LEADING_RUN_RATE_BOOST
        else:
            # NE underdog -> likely trailing -> run less
            return 1.0 - self.TRAILING_PASS_RATE_BOOST * 0.5  # half the pass boost = run reduction

    def _receiving_game_script_adj(self, team: str) -> float:
        """
        Adjust receiving projection based on expected game script.

        Underdog pass-catchers benefit from increased passing volume.
        """
        if team == "NE":
            # NE trailing -> more passes -> boost receiving
            return 1.0 + self.TRAILING_PASS_RATE_BOOST
        else:
            # SEA leading -> slightly fewer passes, but still efficient
            return 1.0 - self.LEADING_RUN_RATE_BOOST * 0.3

    def _passing_game_script_adj(self, team: str) -> float:
        """
        Adjust passing projection based on expected game script.

        Underdog QBs throw more attempts but potentially at lower efficiency.
        """
        if team == "NE":
            # NE underdog -> more pass volume but potential efficiency drop
            volume_boost = 1.0 + self.TRAILING_PASS_RATE_BOOST
            efficiency_drag = 0.98  # slight efficiency cost from forced throws
            return volume_boost * efficiency_drag
        else:
            # SEA -> can be balanced, slightly fewer pass attempts
            return 1.0 - self.LEADING_RUN_RATE_BOOST * 0.4

    def _target_share_boost(self, player_stats: Dict[str, Any], team: str) -> float:
        """
        Compute boost for high-target-share receivers in increased passing volume.

        If a player commands a large share of targets, they benefit
        disproportionately from additional pass attempts.
        """
        targets_pg = player_stats.get("targets_per_game", 0.0)
        team_pass_att = self.team_stats[team].get("offensive_plays_per_game", 65.0) * \
                        self.team_stats[team].get("pass_rate", 0.55)

        if team_pass_att <= 0:
            return 1.0

        target_share = targets_pg / team_pass_att

        # Players with > 25% target share get amplified benefit
        if target_share > 0.25:
            return 1.0 + (target_share - 0.25) * 0.4
        return 1.0

    def _playoff_adjustment(self, player_stats: Dict[str, Any], stat_type: str) -> float:
        """
        Adjust projection based on playoff performance trends.

        If a player has meaningful playoff sample, blend with season average.
        """
        playoff_games = player_stats.get("playoff_games", 0)

        if playoff_games < 2:
            # Not enough playoff data to adjust
            return 1.0

        key_map = {
            "rushing": ("playoff_rushing_ypg", "rushing_yards_per_game"),
            "receiving": ("playoff_receiving_ypg", "receiving_yards_per_game"),
            "passing": ("playoff_passing_ypg", "passing_yards_per_game"),
        }

        playoff_key, season_key = key_map.get(stat_type, (None, None))
        if playoff_key is None:
            return 1.0

        playoff_avg = player_stats.get(playoff_key)
        season_avg = player_stats.get(season_key, 0.0)

        if playoff_avg is None or season_avg <= 0:
            return 1.0

        # Weight playoff data by sample size (max 50% weight with 4+ games)
        playoff_weight = min(playoff_games / 8.0, 0.50)
        blended_factor = playoff_weight * (playoff_avg / season_avg) + (1 - playoff_weight)

        # Clamp to prevent extreme adjustments
        return float(np.clip(blended_factor, 0.75, 1.30))

    @staticmethod
    def _normal_over_under(mean: float, sd: float, line: float) -> tuple:
        """
        Calculate over/under probabilities using normal distribution CDF.

        Uses the error function for CDF computation to avoid scipy dependency.

        Parameters
        ----------
        mean : float
            Projected value.
        sd : float
            Standard deviation estimate.
        line : float
            The prop line.

        Returns
        -------
        tuple of (over_probability, under_probability)
        """
        if sd <= 0:
            if mean > line:
                return (1.0, 0.0)
            elif mean < line:
                return (0.0, 1.0)
            else:
                return (0.5, 0.5)

        z = (line - mean) / sd
        # CDF using error function: Phi(z) = 0.5 * (1 + erf(z / sqrt(2)))
        cdf_at_line = 0.5 * (1.0 + float(np.erf(z / np.sqrt(2.0))))
        over_prob = 1.0 - cdf_at_line
        under_prob = cdf_at_line

        return (round(over_prob, 6), round(under_prob, 6))

    @staticmethod
    def _prop_recommendation(edge: float, over_prob: float,
                             under_prob: float, line: float) -> str:
        """Generate a human-readable recommendation for a prop bet."""
        if abs(edge) < 2.0:
            return f"PASS - projected edge ({edge:+.1f}) too slim vs line {line}"

        if edge > 0:
            if over_prob >= 0.60:
                strength = "BET" if over_prob >= 0.65 else "LEAN"
                return (f"{strength} OVER {line}: projected {line + edge:.1f}, "
                        f"over prob {over_prob:.1%}")
            else:
                return f"LEAN OVER {line}: edge exists but probability only {over_prob:.1%}"
        else:
            if under_prob >= 0.60:
                strength = "BET" if under_prob >= 0.65 else "LEAN"
                return (f"{strength} UNDER {line}: projected {line + edge:.1f}, "
                        f"under prob {under_prob:.1%}")
            else:
                return f"LEAN UNDER {line}: edge exists but probability only {under_prob:.1%}"

    @staticmethod
    def _american_to_implied(odds: int) -> float:
        """Convert American odds to implied probability (with vig)."""
        if odds > 0:
            return 100.0 / (odds + 100.0)
        else:
            return abs(odds) / (abs(odds) + 100.0)

    @staticmethod
    def _american_to_decimal(odds: int) -> float:
        """Convert American odds to decimal odds."""
        if odds > 0:
            return (odds / 100.0) + 1.0
        else:
            return (100.0 / abs(odds)) + 1.0

    def _build_default_prop_slate(self) -> List[Dict[str, Any]]:
        """
        Build the default set of props to analyze for a Super Bowl matchup.

        These represent commonly offered player props. Lines are approximate
        defaults and should be overridden from vegas_lines.json.
        """
        props = []

        # Identify available players by team
        ne_players = {k: v for k, v in self.player_stats.items() if v.get("team") == "NE"}
        sea_players = {k: v for k, v in self.player_stats.items() if v.get("team") == "SEA"}

        # QBs - passing yards, passing TDs, rushing yards
        for name, stats in {**ne_players, **sea_players}.items():
            if stats.get("position") == "QB":
                pass_ypg = stats.get("passing_yards_per_game", 0)
                if pass_ypg > 0:
                    props.append({
                        "player": name,
                        "type": "passing_yards",
                        "line": round(pass_ypg * 0.98, 1),  # lines slightly below avg
                    })
                pass_td = stats.get("passing_tds_per_game", 0)
                if pass_td > 0:
                    props.append({
                        "player": name,
                        "type": "passing_tds",
                        "line": round(pass_td - 0.1, 1),
                    })
                rush_ypg = stats.get("rushing_yards_per_game", 0)
                if rush_ypg > 5:
                    props.append({
                        "player": name,
                        "type": "rushing_yards",
                        "line": round(rush_ypg * 0.95, 1),
                    })

        # RBs - rushing yards, anytime TD
        for name, stats in {**ne_players, **sea_players}.items():
            if stats.get("position") == "RB":
                rush_ypg = stats.get("rushing_yards_per_game", 0)
                if rush_ypg > 20:
                    props.append({
                        "player": name,
                        "type": "rushing_yards",
                        "line": round(rush_ypg * 0.97, 1),
                    })
                # Anytime TD for RBs with reasonable TD rate
                td_rate = stats.get("rushing_tds_per_game", 0) + stats.get("receiving_tds_per_game", 0)
                if td_rate > 0.2:
                    props.append({
                        "player": name,
                        "type": "anytime_td",
                        "odds": -110 if td_rate > 0.5 else +120,
                    })

        # WRs/TEs - receiving yards, anytime TD
        for name, stats in {**ne_players, **sea_players}.items():
            if stats.get("position") in ("WR", "TE"):
                rec_ypg = stats.get("receiving_yards_per_game", 0)
                if rec_ypg > 25:
                    props.append({
                        "player": name,
                        "type": "receiving_yards",
                        "line": round(rec_ypg * 0.97, 1),
                    })
                td_rate = stats.get("receiving_tds_per_game", 0)
                if td_rate > 0.15:
                    props.append({
                        "player": name,
                        "type": "anytime_td",
                        "odds": +100 if td_rate > 0.4 else +150,
                    })

        return props
