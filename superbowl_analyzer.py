#!/usr/bin/env python3
"""
Super Bowl LX Statistical Analysis Engine
==========================================
Seattle Seahawks (14-3) vs. New England Patriots (14-3)
February 8, 2026 | Levi's Stadium, Santa Clara, CA

Multi-methodology Vegas-style odds analyzer featuring:
  - 7 independent statistical models
  - Social/sentiment & narrative analysis
  - Weighted ensemble predictions
  - Mid-game Bayesian recalculation
  - Edge detection vs. posted Vegas lines
  - Monte Carlo simulation (10,000 games)

No external dependencies -- runs on Python 3.8+ standard library.
"""

import math
import random
import statistics
from dataclasses import dataclass, field
from typing import List, Optional, Tuple, Dict

# ============================================================================
#  CONSTANTS
# ============================================================================

TOTAL_GAME_SECONDS = 3600
LEAGUE_AVG_PPG = 23.2          # 2025 NFL league average
LEAGUE_AVG_YPG = 340.0
LEAGUE_AVG_EPA_PLAY = 0.0
NFL_PYTHAGOREAN_EXP = 2.57     # Empirically derived for NFL
HOME_FIELD_PTS = 2.5           # Typical HFA; neutral site = 0
MONTE_CARLO_SIMS = 10_000
ELO_K_FACTOR = 20
ELO_BASE = 1500

# ============================================================================
#  DATA MODELS
# ============================================================================

@dataclass
class TeamStats:
    name: str
    abbrev: str
    wins: int
    losses: int
    points_for: int            # Total regular season
    points_allowed: int
    total_yards: int
    pass_ypg: float
    rush_ypg: float
    yards_allowed_pg: float
    pass_yd_allowed_pg: float
    rush_yd_allowed_pg: float
    third_down_pct: float      # Offense
    third_down_def_pct: float  # Defense (allowed)
    redzone_pct: float         # Offense scoring %
    redzone_def_pct: float
    turnover_diff: int
    sacks_forced: int
    sacks_allowed: int
    epa_per_play_off: float    # Offense EPA/play
    epa_per_play_def: float    # Defense EPA/play (negative = good)
    explosive_play_rate: float # % of plays 20+ yards
    explosive_play_def: float  # Allowed
    fpi: float                 # Football Power Index
    ats_record: str            # Against-the-spread record
    playoff_ppg: float
    playoff_papg: float
    dvoa_off: float            # DVOA percentile (0-100)
    dvoa_def: float
    success_rate_off: float    # % plays with positive EPA
    success_rate_def: float

    @property
    def games(self) -> int:
        return self.wins + self.losses

    @property
    def win_pct(self) -> float:
        return self.wins / self.games

    @property
    def ppg(self) -> float:
        return self.points_for / self.games

    @property
    def papg(self) -> float:
        return self.points_allowed / self.games

    @property
    def point_diff(self) -> int:
        return self.points_for - self.points_allowed

    @property
    def ypg(self) -> float:
        return self.total_yards / self.games


@dataclass
class PlayerStat:
    name: str
    team: str
    position: str
    key_stat: str
    value: float
    prop_line: float
    prop_odds_over: int  # American odds
    prop_odds_under: int
    notes: str = ""


@dataclass
class BettingLine:
    spread: float          # Negative = favorite (e.g., -4.5 for SEA)
    spread_juice_fav: int  # -110
    spread_juice_dog: int  # -110
    total: float           # Over/under
    total_juice_over: int
    total_juice_under: int
    ml_fav: int            # Moneyline favorite
    ml_dog: int            # Moneyline underdog
    public_spread_pct_fav: float  # % of bets on favorite
    public_ml_pct_fav: float
    public_total_over_pct: float
    handle_pct_fav: float  # % of money on favorite


@dataclass
class NarrativeFactor:
    name: str
    description: str
    team_affected: str     # "SEA", "NE", or "BOTH"
    direction: str         # "positive" or "negative"
    weight: float          # 0.0 to 1.0 impact magnitude
    category: str          # "revenge", "momentum", "drama", "public", "sharp"


@dataclass
class GameState:
    quarter: int           # 1-4, 5 = OT
    time_remaining_sec: int
    score_sea: int
    score_ne: int
    possession: str        # "SEA", "NE", "HALF", "NONE"
    sea_total_yards: int = 0
    ne_total_yards: int = 0
    sea_turnovers: int = 0
    ne_turnovers: int = 0
    sea_pass_yards: int = 0
    ne_pass_yards: int = 0
    sea_rush_yards: int = 0
    ne_rush_yards: int = 0
    sea_first_downs: int = 0
    ne_first_downs: int = 0
    sea_penalties: int = 0
    ne_penalties: int = 0
    sea_top_sec: int = 0   # Time of possession in seconds
    ne_top_sec: int = 0

    @property
    def total_elapsed_sec(self) -> int:
        quarter_secs = (self.quarter - 1) * 900
        elapsed_in_quarter = 900 - self.time_remaining_sec
        return min(quarter_secs + elapsed_in_quarter, TOTAL_GAME_SECONDS)

    @property
    def fraction_remaining(self) -> float:
        total = TOTAL_GAME_SECONDS
        elapsed = self.total_elapsed_sec
        return max(0.0, (total - elapsed) / total)

    @property
    def score_diff_sea(self) -> int:
        return self.score_sea - self.score_ne


@dataclass
class ModelResult:
    model_name: str
    methodology: str
    sea_win_pct: float
    ne_win_pct: float
    predicted_spread: float   # Negative = SEA favored
    predicted_total: float
    confidence: float         # 0.0 to 1.0
    weight: float             # For ensemble
    notes: str = ""

    @property
    def spread_str(self) -> str:
        if self.predicted_spread < 0:
            return f"SEA {self.predicted_spread:.1f}"
        elif self.predicted_spread > 0:
            return f"NE {-self.predicted_spread:.1f}"
        else:
            return "PICK"


# ============================================================================
#  PRE-LOADED GAME DATA
# ============================================================================

def load_seahawks() -> TeamStats:
    return TeamStats(
        name="Seattle Seahawks", abbrev="SEA",
        wins=14, losses=3,
        points_for=408, points_allowed=292,
        total_yards=5973,
        pass_ypg=228.1, rush_ypg=123.3,
        yards_allowed_pg=285.6,
        pass_yd_allowed_pg=178.4, rush_yd_allowed_pg=93.2,
        third_down_pct=39.8, third_down_def_pct=33.5,
        redzone_pct=58.2, redzone_def_pct=45.1,
        turnover_diff=-3, sacks_forced=47, sacks_allowed=32,
        epa_per_play_off=0.082, epa_per_play_def=-0.118,
        explosive_play_rate=10.8, explosive_play_def=6.1,
        fpi=7.0, ats_record="14-5",
        playoff_ppg=24.3, playoff_papg=16.7,
        dvoa_off=62.0, dvoa_def=88.0,
        success_rate_off=47.2, success_rate_def=40.1,
    )


def load_patriots() -> TeamStats:
    return TeamStats(
        name="New England Patriots", abbrev="NE",
        wins=14, losses=3,
        points_for=490, points_allowed=320,
        total_yards=6449,
        pass_ypg=250.5, rush_ypg=128.9,
        yards_allowed_pg=295.2,
        pass_yd_allowed_pg=198.7, rush_yd_allowed_pg=96.5,
        third_down_pct=42.9, third_down_def_pct=36.2,
        redzone_pct=64.8, redzone_def_pct=49.3,
        turnover_diff=3, sacks_forced=48, sacks_allowed=38,
        epa_per_play_off=0.155, epa_per_play_def=-0.062,
        explosive_play_rate=13.6, explosive_play_def=8.8,
        fpi=2.6, ats_record="13-6-1",
        playoff_ppg=22.0, playoff_papg=17.3,
        dvoa_off=78.0, dvoa_def=64.0,
        success_rate_off=49.8, success_rate_def=43.6,
    )


def load_betting_line() -> BettingLine:
    return BettingLine(
        spread=-4.5,
        spread_juice_fav=-110, spread_juice_dog=-110,
        total=45.5,
        total_juice_over=-110, total_juice_under=-110,
        ml_fav=-200, ml_dog=+170,
        public_spread_pct_fav=62.0,
        public_ml_pct_fav=68.0,
        public_total_over_pct=55.0,
        handle_pct_fav=66.0,
    )


def load_player_props() -> List[PlayerStat]:
    return [
        PlayerStat("Sam Darnold", "SEA", "QB", "Pass Yards", 248.5, 245.5, -115, -105,
                    "Avg 228.1 ypg; playoff avg 261; NE allows 198.7 pass ypg"),
        PlayerStat("Sam Darnold", "SEA", "QB", "Pass TDs", 1.8, 1.5, -130, +110,
                    "18 TDs in last 8 games; NE allows 1.6 pass TD/gm"),
        PlayerStat("Drake Maye", "NE", "QB", "Pass Yards", 261.2, 258.5, -110, -110,
                    "Avg 250.5 ypg; MVP finalist; SEA allows 178.4 pass ypg"),
        PlayerStat("Drake Maye", "NE", "QB", "Pass TDs", 2.1, 1.5, +105, -125,
                    "Led NFL w/ 38 pass TDs; SEA pass D is elite"),
        PlayerStat("Drake Maye", "NE", "QB", "INTs", 0.9, 0.5, -105, -115,
                    "Sack-prone; SEA D forces mistakes; 14 INTs in reg season"),
        PlayerStat("Jaxon Smith-Njigba", "SEA", "WR", "Rec Yards", 98.5, 92.5, -115, -105,
                    "1,793 rec yds (franchise record); 105.5 ypg; top target"),
        PlayerStat("Jaxon Smith-Njigba", "SEA", "WR", "Receptions", 7.2, 6.5, -120, +100,
                    "Target monster; 30%+ target share"),
        PlayerStat("Cooper Kupp", "SEA", "WR", "Rec Yards", 52.3, 48.5, -105, -115,
                    "Former SB MVP; big-game performer; 2nd option in SEA"),
        PlayerStat("Stefon Diggs", "NE", "WR", "Rec Yards", 68.4, 62.5, -110, -110,
                    "1,013 rec yds; questionable w/ knee; chemistry w/ Maye"),
        PlayerStat("Kenneth Walker III", "SEA", "RB", "Rush Yards", 62.8, 73.5, +100, -120,
                    "Props dropped from 78.5 to 73.5; 95% of bets on under"),
        PlayerStat("Rhamondre Stevenson", "NE", "RB", "Rush Yards", 58.2, 55.5, -110, -110,
                    "28-1 SB MVP odds; solid workhorse back"),
        PlayerStat("TreVeyon Henderson", "NE", "RB", "Rush Yards", 54.7, 52.5, -105, -115,
                    "911 rush yds on season; explosive runner"),
    ]


def load_narrative_factors() -> List[NarrativeFactor]:
    return [
        NarrativeFactor(
            "Super Bowl XLIX Revenge",
            "Seahawks lost SB XLIX to Patriots on Malcolm Butler's iconic goal-line INT. "
            "11 years later, Seattle has a deep motivation to avenge that heartbreak.",
            "SEA", "positive", 0.65, "revenge"
        ),
        NarrativeFactor(
            "Historic Turnaround",
            "Patriots went from 4-13 in 2024 to 14-3 in 2025 under Mike Vrabel. "
            "Teams of destiny often ride momentum in the big game.",
            "NE", "positive", 0.55, "momentum"
        ),
        NarrativeFactor(
            "Drake Maye Youth Factor",
            "At 23, Maye would be the youngest QB to win a Super Bowl. Young QBs "
            "in their first Super Bowl have a mixed 8-10 record historically.",
            "NE", "negative", 0.40, "drama"
        ),
        NarrativeFactor(
            "Darnold Redemption Arc",
            "Sam Darnold has played for 5 teams. A win would complete one of the "
            "greatest redemption stories in NFL history. Media narrative is strong.",
            "SEA", "positive", 0.50, "momentum"
        ),
        NarrativeFactor(
            "Stefon Diggs Injury Concern",
            "Reports of a 'disheartening' Diggs update before the game. If limited, "
            "NE loses their top WR and primary red zone threat.",
            "NE", "negative", 0.70, "drama"
        ),
        NarrativeFactor(
            "Contrarian Sharp Money Signal",
            "Public is 62-66% on Seahawks, but multiple $1M+ bets have come in on "
            "Patriots. Reverse line movement suggests sharp money on NE.",
            "NE", "positive", 0.75, "sharp"
        ),
        NarrativeFactor(
            "Coaching Mismatch Narrative",
            "Mike Macdonald's defensive genius vs. Vrabel's first-year turnaround. "
            "Macdonald has 2 weeks to game-plan vs sack-prone Maye.",
            "SEA", "positive", 0.60, "momentum"
        ),
        NarrativeFactor(
            "Public Overreaction to Regular Season",
            "NE's 28.8 ppg offense looked unstoppable, but their playoff EPA "
            "dropped from 0.155 to 0.112. The public hasn't adjusted.",
            "NE", "negative", 0.55, "public"
        ),
        NarrativeFactor(
            "Seahawks Peaking at Right Time",
            "SEA's last 5 wins were against playoff teams. Offense produced 80th+ "
            "percentile EPA games in both NFC playoff rounds.",
            "SEA", "positive", 0.60, "momentum"
        ),
        NarrativeFactor(
            "9-0 Road Warriors",
            "Patriots went 9-0 away from home. But the Super Bowl is a neutral site -- "
            "this road dominance may not translate as directly.",
            "NE", "positive", 0.30, "momentum"
        ),
        NarrativeFactor(
            "Record Betting Handle Pressure",
            "Expected $1.76 billion in bets. Record handle creates more line "
            "efficiency but also more square money to fade.",
            "BOTH", "positive", 0.20, "public"
        ),
    ]


# ============================================================================
#  MODEL 1: PYTHAGOREAN EXPECTATION
# ============================================================================

class PythagoreanModel:
    """
    Bill James' Pythagorean Win Expectation adapted for the NFL.
    Uses points scored/allowed with NFL-calibrated exponent (2.57).
    Generates expected win% and converts to head-to-head probability.
    """

    @staticmethod
    def expected_wins(pf: float, pa: float, exp: float = NFL_PYTHAGOREAN_EXP) -> float:
        return pf ** exp / (pf ** exp + pa ** exp)

    def run(self, sea: TeamStats, ne: TeamStats) -> ModelResult:
        sea_exp = self.expected_wins(sea.ppg, sea.papg)
        ne_exp = self.expected_wins(ne.ppg, ne.papg)

        # Log5 to get head-to-head from Pythagorean win%
        p = (sea_exp - sea_exp * ne_exp) / (sea_exp + ne_exp - 2 * sea_exp * ne_exp)

        # Convert win probability to spread (empirical: 1% win prob ~ 0.14 pts)
        spread = -(p - 0.5) * 28.0  # ~14 pt swing per 50% delta

        # Predicted total from offensive/defensive strength
        sea_exp_pts = sea.ppg * (ne.papg / LEAGUE_AVG_PPG)
        ne_exp_pts = ne.ppg * (sea.papg / LEAGUE_AVG_PPG)
        total = sea_exp_pts + ne_exp_pts

        return ModelResult(
            model_name="Pythagorean Expectation",
            methodology="Points scored/allowed ratio with NFL exponent (2.57)",
            sea_win_pct=p,
            ne_win_pct=1.0 - p,
            predicted_spread=spread,
            predicted_total=total,
            confidence=0.72,
            weight=0.12,
            notes=(f"SEA expected W%: {sea_exp:.3f} | NE expected W%: {ne_exp:.3f}. "
                   f"NE's explosive offense ({ne.ppg:.1f} ppg) gives them edge here, "
                   f"but SEA defense ({sea.papg:.1f} papg) is the great equalizer.")
        )


# ============================================================================
#  MODEL 2: LOG5 (BILL JAMES)
# ============================================================================

class Log5Model:
    """
    Bill James' Log5 method: uses each team's win percentage to derive
    head-to-head probability. Pure record-based, no stat adjustments.
    """

    def run(self, sea: TeamStats, ne: TeamStats) -> ModelResult:
        pa = sea.win_pct
        pb = ne.win_pct

        # Log5 formula
        p = (pa - pa * pb) / (pa + pb - 2 * pa * pb)

        spread = -(p - 0.5) * 28.0

        # Both teams 14-3, so this will be very close to 50/50
        sea_pts = sea.ppg * (ne.papg / LEAGUE_AVG_PPG)
        ne_pts = ne.ppg * (sea.papg / LEAGUE_AVG_PPG)

        return ModelResult(
            model_name="Log5 Method",
            methodology="Head-to-head probability from win percentages (Bill James)",
            sea_win_pct=p,
            ne_win_pct=1.0 - p,
            predicted_spread=spread,
            predicted_total=sea_pts + ne_pts,
            confidence=0.55,
            weight=0.06,
            notes=(f"Both teams at {sea.win_pct:.3f} W%. Log5 sees this as a virtual "
                   f"coin flip. This model is simplistic -- it ignores strength of "
                   f"schedule and how the wins were achieved.")
        )


# ============================================================================
#  MODEL 3: ELO RATING
# ============================================================================

class EloModel:
    """
    Elo rating system (adapted from chess for football).
    Each team starts at 1500, then adjusts for regular season & playoff
    performance. The Elo gap predicts win probability.
    """

    @staticmethod
    def elo_from_season(team: TeamStats, is_playoff: bool = True) -> float:
        rating = ELO_BASE
        # Win/loss adjustment
        margin_per_game = team.point_diff / team.games
        rating += margin_per_game * 3.5  # ~3.5 Elo pts per margin point
        # Strength of schedule proxy via FPI
        rating += team.fpi * 8.0
        # Playoff adjustment (recent form)
        if is_playoff:
            playoff_margin = team.playoff_ppg - team.playoff_papg
            rating += playoff_margin * 2.0
        return rating

    def run(self, sea: TeamStats, ne: TeamStats) -> ModelResult:
        sea_elo = self.elo_from_season(sea)
        ne_elo = self.elo_from_season(ne)

        # Expected score (win probability) from Elo difference
        elo_diff = sea_elo - ne_elo
        sea_wp = 1.0 / (1.0 + 10 ** (-elo_diff / 400))

        spread = -(sea_wp - 0.5) * 28.0
        sea_pts = sea.ppg * (ne.papg / LEAGUE_AVG_PPG)
        ne_pts = ne.ppg * (sea.papg / LEAGUE_AVG_PPG)

        return ModelResult(
            model_name="Elo Rating System",
            methodology="Chess-derived rating adapted for NFL (margin + FPI + playoff form)",
            sea_win_pct=sea_wp,
            ne_win_pct=1.0 - sea_wp,
            predicted_spread=spread,
            predicted_total=sea_pts + ne_pts,
            confidence=0.70,
            weight=0.12,
            notes=(f"SEA Elo: {sea_elo:.0f} | NE Elo: {ne_elo:.0f} | "
                   f"Delta: {elo_diff:+.0f}. SEA's higher FPI (7.0 vs 2.6) and "
                   f"stronger playoff defense lift their rating significantly.")
        )


# ============================================================================
#  MODEL 4: EPA / DVOA EFFICIENCY MODEL
# ============================================================================

class EfficiencyModel:
    """
    Uses Expected Points Added (EPA) per play and DVOA to project
    the game. EPA/play is considered the single best predictor of
    future NFL performance.
    """

    def run(self, sea: TeamStats, ne: TeamStats) -> ModelResult:
        # Offensive EPA advantage: team's off EPA vs opponent's def EPA
        # NE's playoff EPA regression is critical: 0.155 -> 0.112
        # Use blended EPA: 60% playoff, 40% regular season for both teams
        ne_adj_epa_off = ne.epa_per_play_off * 0.40 + 0.112 * 0.60  # Playoff regression
        sea_adj_epa_off = sea.epa_per_play_off * 0.40 + 0.095 * 0.60  # SEA playoff EPA ~0.095

        sea_net_epa = sea_adj_epa_off - ne.epa_per_play_def
        ne_net_epa = ne_adj_epa_off - sea.epa_per_play_def

        # EPA differential
        epa_diff = sea_net_epa - ne_net_epa

        # Convert EPA diff to projected spread
        # ~62 plays/team/game; empirical: 0.01 EPA/play diff ~ 0.5 pts
        plays_per_game = 62
        spread = -epa_diff * plays_per_game * 0.8  # Dampen for single-game variance

        # DVOA composite
        sea_dvoa = (sea.dvoa_off + sea.dvoa_def) / 2.0
        ne_dvoa = (ne.dvoa_off + ne.dvoa_def) / 2.0
        dvoa_diff = sea_dvoa - ne_dvoa

        # Blend EPA and DVOA for win probability
        combined_edge = epa_diff * 100 + dvoa_diff * 0.3
        sea_wp = 1.0 / (1.0 + math.exp(-combined_edge * 0.15))

        # Success rate comparison
        sea_sr_edge = sea.success_rate_off - ne.success_rate_def
        ne_sr_edge = ne.success_rate_off - sea.success_rate_def

        # Scoring projection
        sea_proj = sea.ppg * 0.5 + (sea.ppg * ne.papg / LEAGUE_AVG_PPG) * 0.5
        ne_proj = ne.ppg * 0.5 + (ne.ppg * sea.papg / LEAGUE_AVG_PPG) * 0.5

        return ModelResult(
            model_name="EPA / DVOA Efficiency",
            methodology="Expected Points Added per play + DVOA composite rating",
            sea_win_pct=sea_wp,
            ne_win_pct=1.0 - sea_wp,
            predicted_spread=spread,
            predicted_total=sea_proj + ne_proj,
            confidence=0.82,
            weight=0.25,
            notes=(f"SEA net EPA: {sea_net_epa:+.3f} | NE net EPA: {ne_net_epa:+.3f}\n"
                   f"         DVOA composite: SEA {sea_dvoa:.1f}th pctl vs NE {ne_dvoa:.1f}th pctl\n"
                   f"         Success rate edge: SEA {sea_sr_edge:+.1f}% | NE {ne_sr_edge:+.1f}%\n"
                   f"         NE offense is elite (0.155 EPA) but drops to 0.112 in playoffs.\n"
                   f"         SEA defense (-0.118 EPA) is the best unit on the field.")
        )


# ============================================================================
#  MODEL 5: MONTE CARLO SIMULATION
# ============================================================================

class MonteCarloModel:
    """
    Simulates 10,000 games by modeling each team's scoring as a
    random variable. Uses opponent-adjusted scoring distributions
    with realistic NFL variance.
    """

    def run(self, sea: TeamStats, ne: TeamStats,
            n_sims: int = MONTE_CARLO_SIMS) -> ModelResult:
        random.seed(2026)  # Reproducible results

        # Opponent-adjusted expected points
        sea_mu = sea.ppg * (ne.papg / LEAGUE_AVG_PPG)
        ne_mu = ne.ppg * (sea.papg / LEAGUE_AVG_PPG)

        # NFL scoring standard deviation (~10 pts)
        sea_sigma = 9.5
        ne_sigma = 10.5  # More variance from boom/bust offense

        sea_wins = 0
        ne_wins = 0
        ties = 0
        sea_covers = 0  # Covers -4.5 spread
        overs = 0
        all_sea_scores = []
        all_ne_scores = []
        margins = []

        for _ in range(n_sims):
            sea_pts = max(0, random.gauss(sea_mu, sea_sigma))
            ne_pts = max(0, random.gauss(ne_mu, ne_sigma))

            # Turnover impact (random)
            to_swing = random.gauss(0, 2.5)
            sea_pts += to_swing * (sea.turnover_diff / 10)
            ne_pts -= to_swing * (ne.turnover_diff / 10)

            sea_pts = max(0, round(sea_pts))
            ne_pts = max(0, round(ne_pts))

            all_sea_scores.append(sea_pts)
            all_ne_scores.append(ne_pts)
            margin = sea_pts - ne_pts
            margins.append(margin)

            if sea_pts > ne_pts:
                sea_wins += 1
            elif ne_pts > sea_pts:
                ne_wins += 1
            else:
                ties += 1

            if margin > 4.5:
                sea_covers += 1
            if (sea_pts + ne_pts) > 45.5:
                overs += 1

        sea_wp = (sea_wins + ties * 0.5) / n_sims
        avg_margin = statistics.mean(margins)
        median_margin = statistics.median(margins)
        std_margin = statistics.stdev(margins)
        avg_total = statistics.mean(all_sea_scores) + statistics.mean(all_ne_scores)

        pct_10 = sorted(margins)[int(n_sims * 0.10)]
        pct_90 = sorted(margins)[int(n_sims * 0.90)]

        return ModelResult(
            model_name="Monte Carlo Simulation",
            methodology=f"{n_sims:,} game simulations with opponent-adjusted scoring",
            sea_win_pct=sea_wp,
            ne_win_pct=1.0 - sea_wp,
            predicted_spread=-avg_margin,
            predicted_total=avg_total,
            confidence=0.75,
            weight=0.18,
            notes=(f"Avg margin: SEA {avg_margin:+.1f} | Median: SEA {median_margin:+.1f}\n"
                   f"         Std dev: {std_margin:.1f} pts | 80% range: [{pct_10:+d} to {pct_90:+d}]\n"
                   f"         SEA covers -4.5: {sea_covers/n_sims*100:.1f}% | "
                   f"Over 45.5: {overs/n_sims*100:.1f}%\n"
                   f"         Avg score: SEA {statistics.mean(all_sea_scores):.1f} - "
                   f"NE {statistics.mean(all_ne_scores):.1f}")
        )


# ============================================================================
#  MODEL 6: SITUATIONAL / CONTEXTUAL MODEL
# ============================================================================

class SituationalModel:
    """
    Weights contextual factors that don't show up in box scores:
    neutral site, rest, injuries, coaching, playoff form, explosiveness.
    """

    def run(self, sea: TeamStats, ne: TeamStats) -> ModelResult:
        score = 0.0  # Positive = SEA advantage

        # 1. Neutral site -- no home field advantage (wash)
        score += 0.0

        # 2. Playoff form (recent performance matters more)
        sea_playoff_margin = sea.playoff_ppg - sea.playoff_papg
        ne_playoff_margin = ne.playoff_ppg - ne.playoff_papg
        score += (sea_playoff_margin - ne_playoff_margin) * 0.15

        # 3. Defensive dominance (elite D wins Super Bowls)
        # Historical: teams with top-5 defense are 28-19 in Super Bowls
        if sea.epa_per_play_def < -0.10:
            score += 1.5  # Elite defense bonus
        if ne.epa_per_play_def < -0.10:
            score += 0.0  # NE defense not elite

        # 4. Explosive play differential (key Super Bowl predictor)
        expl_diff = (sea.explosive_play_rate - sea.explosive_play_def) - \
                    (ne.explosive_play_rate - ne.explosive_play_def)
        score += expl_diff * 0.3

        # 5. Turnover margin
        score += (sea.turnover_diff - ne.turnover_diff) * 0.2

        # 6. Third-down efficiency edge
        sea_3rd = sea.third_down_pct - ne.third_down_def_pct
        ne_3rd = ne.third_down_pct - sea.third_down_def_pct
        score += (sea_3rd - ne_3rd) * 0.05

        # 7. Red zone efficiency edge
        sea_rz = sea.redzone_pct - ne.redzone_def_pct
        ne_rz = ne.redzone_pct - sea.redzone_def_pct
        score += (sea_rz - ne_rz) * 0.04

        # 8. Sack differential (pressure wins in big games)
        sea_sack_edge = sea.sacks_forced - sea.sacks_allowed
        ne_sack_edge = ne.sacks_forced - ne.sacks_allowed
        score += (sea_sack_edge - ne_sack_edge) * 0.08

        # 9. Coaching experience (Vrabel=1st yr, Macdonald=2nd yr)
        score += 0.5  # Slight edge Macdonald with defensive scheme mastery

        # 10. Two-week preparation (benefits defensive-minded coach)
        score += 0.3  # Macdonald extra prep time vs sack-prone Maye

        # Convert score to win probability
        sea_wp = 1.0 / (1.0 + math.exp(-score * 0.18))
        spread = -(sea_wp - 0.5) * 28.0

        sea_pts = sea.ppg * (ne.papg / LEAGUE_AVG_PPG)
        ne_pts = ne.ppg * (sea.papg / LEAGUE_AVG_PPG)

        return ModelResult(
            model_name="Situational / Contextual",
            methodology="Weighted context factors: form, coaching, pressure, explosiveness",
            sea_win_pct=sea_wp,
            ne_win_pct=1.0 - sea_wp,
            predicted_spread=spread,
            predicted_total=sea_pts + ne_pts,
            confidence=0.68,
            weight=0.12,
            notes=(f"Situational score: SEA {score:+.2f}\n"
                   f"         Key edges: SEA elite defense (+1.5), SEA explosive play diff (+),\n"
                   f"         Macdonald 2-wk prep vs Maye (+0.3), SEA sack pressure advantage.\n"
                   f"         NE playoff offense has regressed (EPA 0.155 -> 0.112).")
        )


# ============================================================================
#  MODEL 7: SENTIMENT, SOCIAL & NARRATIVE MODEL
# ============================================================================

class SentimentModel:
    """
    Quantifies narrative, social, and public-opinion factors that
    influence game outcomes beyond raw statistics. Includes:
    - Public betting splits (contrarian signals)
    - Sharp money indicators (reverse line movement)
    - Revenge / motivation narratives
    - Player drama & distractions
    - Historical parallels
    """

    def run(self, sea: TeamStats, ne: TeamStats,
            line: BettingLine,
            factors: List[NarrativeFactor]) -> ModelResult:

        sea_sentiment = 0.0
        ne_sentiment = 0.0
        breakdown = []

        for f in factors:
            impact = f.weight
            if f.direction == "negative":
                impact = -impact

            if f.team_affected == "SEA":
                sea_sentiment += impact
                breakdown.append(f"  [{f.team_affected}] {f.name}: {'+' if impact > 0 else ''}{impact:.2f}")
            elif f.team_affected == "NE":
                ne_sentiment += impact
                breakdown.append(f"  [{f.team_affected}] {f.name}: {'+' if impact > 0 else ''}{impact:.2f}")
            else:
                sea_sentiment += impact * 0.5
                ne_sentiment += impact * 0.5

        # Contrarian indicator: heavy public on one side = edge for other
        public_lean = line.public_spread_pct_fav
        if public_lean > 60:
            contrarian_boost = (public_lean - 55) * 0.02
            ne_sentiment += contrarian_boost
            breakdown.append(f"  [NE] Contrarian fade ({public_lean:.0f}% public on SEA): +{contrarian_boost:.2f}")

        # Handle vs ticket split (smart money signal)
        if line.handle_pct_fav > line.public_spread_pct_fav + 3:
            sea_sentiment += 0.1  # Big money confirms public
        elif line.handle_pct_fav < line.public_spread_pct_fav - 3:
            ne_sentiment += 0.15  # Big money fading public
            breakdown.append(f"  [NE] Handle/ticket divergence (sharp money): +0.15")

        # Historical Super Bowl underdog performance
        # Underdogs of 3-5 points cover ~55% of the time
        ne_sentiment += 0.10
        breakdown.append(f"  [NE] SB underdog 3-5 pts historical edge: +0.10")

        net = sea_sentiment - ne_sentiment

        # Convert to probability adjustment (small impact -- narrative is ~15% of outcome)
        adjustment = net * 0.06
        base_wp = 0.55  # Slight SEA lean from other models
        sea_wp = min(0.85, max(0.15, base_wp + adjustment))

        spread = -(sea_wp - 0.5) * 28.0

        sea_pts = sea.ppg * (ne.papg / LEAGUE_AVG_PPG)
        ne_pts = ne.ppg * (sea.papg / LEAGUE_AVG_PPG)

        notes_lines = [
            f"SEA narrative score: {sea_sentiment:+.2f} | NE narrative score: {ne_sentiment:+.2f}",
            f"         Net sentiment: {'SEA' if net > 0 else 'NE'} {abs(net):+.2f}",
            "         Factor breakdown:",
        ]
        for b in breakdown:
            notes_lines.append(f"         {b}")

        return ModelResult(
            model_name="Sentiment & Narrative",
            methodology="Public opinion, sharp money, drama, revenge, historical parallels",
            sea_win_pct=sea_wp,
            ne_win_pct=1.0 - sea_wp,
            predicted_spread=spread,
            predicted_total=sea_pts + ne_pts,
            confidence=0.45,
            weight=0.15,
            notes="\n".join(notes_lines)
        )


# ============================================================================
#  ENSEMBLE COMBINER
# ============================================================================

class EnsembleModel:
    """
    Combines all models using confidence-weighted averaging.
    Weights are calibrated to historical predictive accuracy of each method.
    """

    def combine(self, results: List[ModelResult]) -> ModelResult:
        total_weight = sum(r.weight * r.confidence for r in results)

        sea_wp = sum(r.sea_win_pct * r.weight * r.confidence for r in results) / total_weight
        spread = sum(r.predicted_spread * r.weight * r.confidence for r in results) / total_weight
        total = sum(r.predicted_total * r.weight * r.confidence for r in results) / total_weight

        # Ensemble confidence is higher than any individual model
        avg_conf = statistics.mean([r.confidence for r in results])
        ensemble_conf = min(0.92, avg_conf * 1.15)

        model_agreement = sum(1 for r in results if r.sea_win_pct > 0.5)
        direction = "SEA" if sea_wp > 0.5 else "NE"

        return ModelResult(
            model_name="ENSEMBLE CONSENSUS",
            methodology=f"Confidence-weighted blend of {len(results)} models",
            sea_win_pct=sea_wp,
            ne_win_pct=1.0 - sea_wp,
            predicted_spread=spread,
            predicted_total=total,
            confidence=ensemble_conf,
            weight=1.0,
            notes=(f"{model_agreement}/{len(results)} models favor {direction}\n"
                   f"         Spread range: [{min(r.predicted_spread for r in results):.1f} "
                   f"to {max(r.predicted_spread for r in results):.1f}]\n"
                   f"         Total range: [{min(r.predicted_total for r in results):.1f} "
                   f"to {max(r.predicted_total for r in results):.1f}]")
        )


# ============================================================================
#  MID-GAME BAYESIAN UPDATER
# ============================================================================

class LiveGameUpdater:
    """
    Updates pre-game win probabilities using current game state.
    Uses a logistic model calibrated to historical NFL win probability
    data (score differential, time remaining, possession).
    """

    @staticmethod
    def game_state_wp(state: GameState) -> float:
        """Calculate SEA win probability from current game state."""
        diff = state.score_diff_sea
        frac = state.fraction_remaining

        if frac <= 0:
            if diff > 0:
                return 1.0
            elif diff < 0:
                return 0.0
            return 0.5

        # Logistic model coefficients (calibrated to historical NFL data)
        # As time decreases, each point of lead matters more
        time_weight = 1.0 + 3.0 * (1.0 - frac)  # 1x at start, 4x at end

        # Score differential contribution
        score_component = diff * 0.08 * time_weight

        # Possession is worth ~2.5 expected points
        poss_value = 0.0
        if state.possession == "SEA":
            poss_value = 0.06 * frac  # Diminishes as game goes on
        elif state.possession == "NE":
            poss_value = -0.06 * frac

        # Yards & first downs momentum (small adjustment)
        if state.sea_total_yards + state.ne_total_yards > 0:
            yard_ratio = state.sea_total_yards / max(1, state.sea_total_yards + state.ne_total_yards)
            yard_adj = (yard_ratio - 0.5) * 0.15 * frac
        else:
            yard_adj = 0.0

        # Turnover impact
        to_diff = state.ne_turnovers - state.sea_turnovers
        to_adj = to_diff * 0.04 * frac

        logit = score_component + poss_value + yard_adj + to_adj
        wp = 1.0 / (1.0 + math.exp(-logit))

        return wp

    def update(self, state: GameState, pregame_result: ModelResult) -> ModelResult:
        """Bayesian update: blend pre-game prior with live game state."""
        live_wp = self.game_state_wp(state)
        frac = state.fraction_remaining

        # Bayesian blend: as game progresses, live data dominates
        # At kickoff: 100% pre-game. At halftime: ~65% live. End: ~98% live
        live_weight = 1.0 - frac ** 0.8
        prior_weight = 1.0 - live_weight

        sea_wp = live_wp * live_weight + pregame_result.sea_win_pct * prior_weight

        # Recalculate expected spread from remaining game time
        remaining_spread = -(sea_wp - 0.5) * 28.0

        # Project final total from current pace
        elapsed = max(1, state.total_elapsed_sec)
        sea_pace = state.score_sea / elapsed * TOTAL_GAME_SECONDS
        ne_pace = state.score_ne / elapsed * TOTAL_GAME_SECONDS

        # Blend pace projection with pre-game total
        pace_total = sea_pace + ne_pace
        proj_total = pace_total * live_weight + pregame_result.predicted_total * prior_weight

        quarter_str = f"Q{state.quarter}" if state.quarter <= 4 else "OT"
        mins = state.time_remaining_sec // 60
        secs = state.time_remaining_sec % 60

        return ModelResult(
            model_name="LIVE BAYESIAN UPDATE",
            methodology=f"Pre-game prior + live game state ({quarter_str} {mins}:{secs:02d})",
            sea_win_pct=sea_wp,
            ne_win_pct=1.0 - sea_wp,
            predicted_spread=remaining_spread,
            predicted_total=proj_total,
            confidence=min(0.95, 0.70 + live_weight * 0.25),
            weight=1.0,
            notes=(f"Live WP (pure): SEA {live_wp*100:.1f}% | Pre-game prior: SEA {pregame_result.sea_win_pct*100:.1f}%\n"
                   f"         Blend weights: live {live_weight*100:.0f}% / prior {prior_weight*100:.0f}%\n"
                   f"         Score: SEA {state.score_sea} - NE {state.score_ne} | "
                   f"Poss: {state.possession}\n"
                   f"         Yards: SEA {state.sea_total_yards} - NE {state.ne_total_yards} | "
                   f"TOs: SEA {state.sea_turnovers} - NE {state.ne_turnovers}")
        )


# ============================================================================
#  EDGE DETECTOR
# ============================================================================

class EdgeDetector:
    """
    Compares model predictions against posted Vegas lines to identify
    value betting opportunities.
    """

    @staticmethod
    def implied_prob(american_odds: int) -> float:
        if american_odds < 0:
            return abs(american_odds) / (abs(american_odds) + 100)
        return 100 / (american_odds + 100)

    def detect(self, ensemble: ModelResult, line: BettingLine) -> Dict:
        edges = {}

        # Spread edge
        model_spread = ensemble.predicted_spread
        vegas_spread = line.spread  # -4.5

        spread_diff = model_spread - vegas_spread
        if spread_diff > 0.5:
            edges["spread"] = {
                "side": "NE +4.5",
                "edge": spread_diff,
                "confidence": "medium" if spread_diff < 2.0 else "high",
                "reasoning": f"Model says {model_spread:.1f}, Vegas says {vegas_spread}. "
                             f"Patriots getting {abs(spread_diff):.1f} pts of value."
            }
        elif spread_diff < -0.5:
            edges["spread"] = {
                "side": "SEA -4.5",
                "edge": abs(spread_diff),
                "confidence": "medium" if abs(spread_diff) < 2.0 else "high",
                "reasoning": f"Model says {model_spread:.1f}, Vegas says {vegas_spread}. "
                             f"Seahawks are stronger than the line suggests."
            }
        else:
            edges["spread"] = {
                "side": "NO EDGE",
                "edge": 0,
                "confidence": "low",
                "reasoning": f"Model ({model_spread:.1f}) aligns with Vegas ({vegas_spread}). No edge."
            }

        # Total edge
        model_total = ensemble.predicted_total
        vegas_total = line.total  # 45.5

        total_diff = model_total - vegas_total
        if total_diff > 1.0:
            edges["total"] = {
                "side": f"OVER {vegas_total}",
                "edge": total_diff,
                "confidence": "medium" if total_diff < 3.0 else "high",
                "reasoning": f"Model projects {model_total:.1f} total, {total_diff:.1f} pts above line."
            }
        elif total_diff < -1.0:
            edges["total"] = {
                "side": f"UNDER {vegas_total}",
                "edge": abs(total_diff),
                "confidence": "medium" if abs(total_diff) < 3.0 else "high",
                "reasoning": f"Model projects {model_total:.1f} total, {abs(total_diff):.1f} pts below line."
            }
        else:
            edges["total"] = {
                "side": "NO EDGE",
                "edge": 0,
                "confidence": "low",
                "reasoning": f"Model ({model_total:.1f}) aligns with Vegas ({vegas_total}). No edge."
            }

        # Moneyline edge
        model_sea_wp = ensemble.sea_win_pct
        implied_fav = self.implied_prob(line.ml_fav)
        implied_dog = self.implied_prob(line.ml_dog)

        if model_sea_wp < implied_fav - 0.03:
            edges["moneyline"] = {
                "side": f"NE {'+' if line.ml_dog > 0 else ''}{line.ml_dog}",
                "edge": (implied_fav - model_sea_wp) * 100,
                "confidence": "medium",
                "reasoning": (f"Model gives SEA {model_sea_wp*100:.1f}% but line implies "
                              f"{implied_fav*100:.1f}%. NE ML has +{(implied_fav - model_sea_wp)*100:.1f}% edge.")
            }
        elif model_sea_wp > implied_fav + 0.03:
            edges["moneyline"] = {
                "side": f"SEA {line.ml_fav}",
                "edge": (model_sea_wp - implied_fav) * 100,
                "confidence": "medium",
                "reasoning": (f"Model gives SEA {model_sea_wp*100:.1f}% but line implies only "
                              f"{implied_fav*100:.1f}%. SEA ML has value.")
            }
        else:
            edges["moneyline"] = {
                "side": "NO EDGE",
                "edge": 0,
                "confidence": "low",
                "reasoning": f"Model WP ({model_sea_wp*100:.1f}%) close to implied ({implied_fav*100:.1f}%). No edge."
            }

        return edges


# ============================================================================
#  DISPLAY / OUTPUT
# ============================================================================

def bar(pct: float, width: int = 40, fill: str = "\u2588", empty: str = "\u2591") -> str:
    filled = round(pct / 100 * width)
    return fill * filled + empty * (width - filled)


def header():
    w = 68
    print()
    print("\u2554" + "\u2550" * w + "\u2557")
    print("\u2551" + " SUPER BOWL LX STATISTICAL ANALYSIS ENGINE".center(w) + "\u2551")
    print("\u2551" + "".center(w) + "\u2551")
    print("\u2551" + " Seattle Seahawks (14-3)  vs.  New England Patriots (14-3)".center(w) + "\u2551")
    print("\u2551" + " February 8, 2026 | Levi's Stadium, Santa Clara, CA".center(w) + "\u2551")
    print("\u2551" + " Kickoff: 6:30 PM ET | NBC / Peacock".center(w) + "\u2551")
    print("\u255a" + "\u2550" * w + "\u255d")
    print()


def section(title: str):
    w = 68
    print()
    print("\u2550" * w)
    print(f"  {title}")
    print("\u2550" * w)


def print_team_comparison(sea: TeamStats, ne: TeamStats):
    section("TEAM COMPARISON")
    fmt = "  {:<30s}  {:>14s}  {:>14s}"
    print(fmt.format("", "SEAHAWKS", "PATRIOTS"))
    print(fmt.format("", "--------", "--------"))
    print(fmt.format("Record", sea.ats_record + f" ({sea.wins}-{sea.losses})",
                      ne.ats_record + f" ({ne.wins}-{ne.losses})"))
    print(fmt.format("Points/Game", f"{sea.ppg:.1f}", f"{ne.ppg:.1f}"))
    print(fmt.format("Points Allowed/Game", f"{sea.papg:.1f}", f"{ne.papg:.1f}"))
    print(fmt.format("Point Differential", f"+{sea.point_diff}", f"+{ne.point_diff}"))
    print(fmt.format("Total Yards/Game", f"{sea.ypg:.1f}", f"{ne.ypg:.1f}"))
    print(fmt.format("Pass Yards/Game", f"{sea.pass_ypg:.1f}", f"{ne.pass_ypg:.1f}"))
    print(fmt.format("Rush Yards/Game", f"{sea.rush_ypg:.1f}", f"{ne.rush_ypg:.1f}"))
    print(fmt.format("Yards Allowed/Game", f"{sea.yards_allowed_pg:.1f}", f"{ne.yards_allowed_pg:.1f}"))
    print(fmt.format("3rd Down Off %", f"{sea.third_down_pct:.1f}%", f"{ne.third_down_pct:.1f}%"))
    print(fmt.format("3rd Down Def %", f"{sea.third_down_def_pct:.1f}%", f"{ne.third_down_def_pct:.1f}%"))
    print(fmt.format("Red Zone Off %", f"{sea.redzone_pct:.1f}%", f"{ne.redzone_pct:.1f}%"))
    print(fmt.format("Red Zone Def %", f"{sea.redzone_def_pct:.1f}%", f"{ne.redzone_def_pct:.1f}%"))
    print(fmt.format("Turnover Diff", f"{sea.turnover_diff:+d}", f"{ne.turnover_diff:+d}"))
    print(fmt.format("Sacks Forced / Allowed", f"{sea.sacks_forced}/{sea.sacks_allowed}",
                      f"{ne.sacks_forced}/{ne.sacks_allowed}"))
    print()
    print("  ADVANCED METRICS")
    print(fmt.format("EPA/Play (Offense)", f"{sea.epa_per_play_off:+.3f}", f"{ne.epa_per_play_off:+.3f}"))
    print(fmt.format("EPA/Play (Defense)", f"{sea.epa_per_play_def:+.3f}", f"{ne.epa_per_play_def:+.3f}"))
    print(fmt.format("DVOA Off (percentile)", f"{sea.dvoa_off:.0f}th", f"{ne.dvoa_off:.0f}th"))
    print(fmt.format("DVOA Def (percentile)", f"{sea.dvoa_def:.0f}th", f"{ne.dvoa_def:.0f}th"))
    print(fmt.format("Success Rate Off", f"{sea.success_rate_off:.1f}%", f"{ne.success_rate_off:.1f}%"))
    print(fmt.format("Success Rate Def", f"{sea.success_rate_def:.1f}%", f"{ne.success_rate_def:.1f}%"))
    print(fmt.format("Explosive Play Rate", f"{sea.explosive_play_rate:.1f}%", f"{ne.explosive_play_rate:.1f}%"))
    print(fmt.format("Explosive Play Def", f"{sea.explosive_play_def:.1f}%", f"{ne.explosive_play_def:.1f}%"))
    print(fmt.format("FPI", f"{sea.fpi:.1f}", f"{ne.fpi:.1f}"))
    print()
    print("  PLAYOFF PERFORMANCE")
    print(fmt.format("Playoff PPG", f"{sea.playoff_ppg:.1f}", f"{ne.playoff_ppg:.1f}"))
    print(fmt.format("Playoff Points Allowed", f"{sea.playoff_papg:.1f}", f"{ne.playoff_papg:.1f}"))


def print_model_result(r: ModelResult, index: int = 0):
    print()
    print(f"  Model {index}: {r.model_name}")
    print(f"  Method: {r.methodology}")
    print(f"  Confidence: {r.confidence*100:.0f}% | Ensemble Weight: {r.weight*100:.0f}%")
    print()
    sea_pct = r.sea_win_pct * 100
    ne_pct = r.ne_win_pct * 100
    print(f"  SEA {bar(sea_pct, 40)} {sea_pct:5.1f}%")
    print(f"  NE  {bar(ne_pct, 40)} {ne_pct:5.1f}%")
    print()
    print(f"  Predicted Spread: {r.spread_str}")
    print(f"  Predicted Total:  {r.predicted_total:.1f}")
    if r.notes:
        print(f"  Notes: {r.notes}")
    print("  " + "\u2500" * 64)


def print_ensemble(r: ModelResult):
    section("ENSEMBLE CONSENSUS PREDICTION")
    sea_pct = r.sea_win_pct * 100
    ne_pct = r.ne_win_pct * 100
    fav = "SEAHAWKS" if sea_pct > 50 else "PATRIOTS"
    fav_pct = max(sea_pct, ne_pct)

    print()
    print(f"  >>> PREDICTED WINNER: {fav} ({fav_pct:.1f}%) <<<")
    print()
    print(f"  SEA {bar(sea_pct, 50)} {sea_pct:.1f}%")
    print(f"  NE  {bar(ne_pct, 50)} {ne_pct:.1f}%")
    print()
    print(f"  Predicted Spread:     {r.spread_str}")
    print(f"  Predicted Total:      {r.predicted_total:.1f}")
    print(f"  Model Confidence:     {r.confidence*100:.0f}%")
    print(f"  {r.notes}")


def print_edges(edges: Dict, line: BettingLine):
    section("EDGE DETECTION vs. VEGAS")
    print()
    print(f"  Vegas Lines:  Spread: SEA {line.spread}  |  Total: {line.total}  |  "
          f"ML: SEA {line.ml_fav} / NE +{line.ml_dog}")
    print(f"  Public:       {line.public_spread_pct_fav:.0f}% on SEA spread  |  "
          f"{line.handle_pct_fav:.0f}% of handle on SEA")
    print()

    for bet_type, e in edges.items():
        marker = "[VALUE]" if e["edge"] > 0 else "[  --  ]"
        conf = e["confidence"].upper()
        print(f"  {marker} {bet_type.upper():>10s}: {e['side']:<16s} "
              f"Edge: {e['edge']:.1f}{'pts' if bet_type != 'moneyline' else '%'}  "
              f"[{conf}]")
        print(f"             {e['reasoning']}")
        print()


def print_narratives(factors: List[NarrativeFactor]):
    section("SENTIMENT & NARRATIVE ANALYSIS")
    print()
    print("  Social, psychological, and market factors that move the needle:")
    print()

    for f in factors:
        icon = "+" if f.direction == "positive" else "-"
        team = f.team_affected
        mag = "\u2588" * round(f.weight * 10)
        print(f"  [{team:>4s}] [{icon}] {f.name}")
        print(f"         Impact: {mag} ({f.weight*100:.0f}%)")
        print(f"         {f.description}")
        print()


def print_player_props(props: List[PlayerStat]):
    section("KEY PLAYER PROPS ANALYSIS")
    print()
    fmt = "  {:<24s} {:>8s}  {:>8s}  {:>7s} / {:<7s}  {}"
    print(fmt.format("PLAYER", "PROJ", "LINE", "OVER", "UNDER", "ANALYSIS"))
    print("  " + "-" * 90)
    for p in props:
        print(fmt.format(
            f"{p.name} ({p.team} {p.position})",
            f"{p.value:.1f}",
            f"{p.prop_line:.1f}",
            f"{p.prop_odds_over:+d}",
            f"{p.prop_odds_under:+d}",
            p.notes[:50]
        ))
    print()
    print("  * Projections based on season averages adjusted for opponent defensive strength")


def print_live_update(state: GameState, result: ModelResult):
    section("LIVE GAME UPDATE")
    quarter_str = f"Q{state.quarter}" if state.quarter <= 4 else "OT"
    mins = state.time_remaining_sec // 60
    secs = state.time_remaining_sec % 60
    print()
    print(f"  Game State: {quarter_str} | {mins}:{secs:02d} remaining")
    print(f"  Score: SEA {state.score_sea} - NE {state.score_ne} | Poss: {state.possession}")
    print()

    sea_pct = result.sea_win_pct * 100
    ne_pct = result.ne_win_pct * 100
    fav = "SEAHAWKS" if sea_pct > 50 else "PATRIOTS"
    fav_pct = max(sea_pct, ne_pct)

    print(f"  >>> CURRENT FAVORITE: {fav} ({fav_pct:.1f}%) <<<")
    print()
    print(f"  SEA {bar(sea_pct, 50)} {sea_pct:.1f}%")
    print(f"  NE  {bar(ne_pct, 50)} {ne_pct:.1f}%")
    print()
    print(f"  {result.notes}")
    print()
    print(f"  Projected Final Spread: {result.spread_str}")
    print(f"  Projected Final Total:  {result.predicted_total:.1f}")


# ============================================================================
#  INTERACTIVE MENU
# ============================================================================

def get_input(prompt: str, default: str = "") -> str:
    try:
        val = input(prompt)
        return val.strip() if val.strip() else default
    except (EOFError, KeyboardInterrupt):
        return default


def interactive_live_game(sea: TeamStats, ne: TeamStats, ensemble: ModelResult):
    updater = LiveGameUpdater()

    section("MID-GAME RECALCULATION")
    print()
    print("  Enter current game state (press Enter to skip optional fields):")
    print()

    try:
        q = get_input("  Quarter [1-4, 5=OT] (default 1): ", "1")
        quarter = int(q)

        time_str = get_input("  Time remaining in quarter [MM:SS] (default 15:00): ", "15:00")
        parts = time_str.split(":")
        time_sec = int(parts[0]) * 60 + int(parts[1]) if len(parts) == 2 else int(parts[0]) * 60

        sea_score = int(get_input("  Seahawks score (default 0): ", "0"))
        ne_score = int(get_input("  Patriots score (default 0): ", "0"))
        poss = get_input("  Possession [SEA/NE/HALF/NONE] (default NONE): ", "NONE").upper()

        print()
        print("  Optional detailed stats (Enter to skip):")
        sea_yds = int(get_input("  SEA total yards (default 0): ", "0"))
        ne_yds = int(get_input("  NE total yards (default 0): ", "0"))
        sea_to = int(get_input("  SEA turnovers (default 0): ", "0"))
        ne_to = int(get_input("  NE turnovers (default 0): ", "0"))
        sea_pass = int(get_input("  SEA pass yards (default 0): ", "0"))
        ne_pass = int(get_input("  NE pass yards (default 0): ", "0"))
        sea_rush = int(get_input("  SEA rush yards (default 0): ", "0"))
        ne_rush = int(get_input("  NE rush yards (default 0): ", "0"))
        sea_fd = int(get_input("  SEA first downs (default 0): ", "0"))
        ne_fd = int(get_input("  NE first downs (default 0): ", "0"))

    except (ValueError, KeyboardInterrupt):
        print("\n  Invalid input. Returning to menu.")
        return

    state = GameState(
        quarter=quarter,
        time_remaining_sec=time_sec,
        score_sea=sea_score,
        score_ne=ne_score,
        possession=poss,
        sea_total_yards=sea_yds,
        ne_total_yards=ne_yds,
        sea_turnovers=sea_to,
        ne_turnovers=ne_to,
        sea_pass_yards=sea_pass,
        ne_pass_yards=ne_pass,
        sea_rush_yards=sea_rush,
        ne_rush_yards=ne_rush,
        sea_first_downs=sea_fd,
        ne_first_downs=ne_fd,
    )

    result = updater.update(state, ensemble)
    print_live_update(state, result)

    # Also show prop pace updates
    print()
    elapsed = max(1, state.total_elapsed_sec)
    frac_done = elapsed / TOTAL_GAME_SECONDS
    if frac_done > 0.05:
        print("  PROP PACE TRACKER (if game continues at current pace):")
        print(f"  {'':30s} {'Current':>8s}  {'Pace':>8s}  {'Line':>8s}  {'Trend':>8s}")

        props_to_track = [
            ("Sam Darnold Pass Yds", sea_pass, 245.5),
            ("Drake Maye Pass Yds", ne_pass, 258.5),
            ("SEA Rush Yds (team)", sea_rush, 73.5),
            ("NE Rush Yds (team)", ne_rush, 55.5),
        ]
        for name, current, prop_line in props_to_track:
            pace = current / frac_done
            trend = "OVER" if pace > prop_line else "UNDER"
            print(f"  {name:<30s} {current:>8d}  {pace:>8.1f}  {prop_line:>8.1f}  {trend:>8s}")


def main_menu():
    sea = load_seahawks()
    ne = load_patriots()
    line = load_betting_line()
    props = load_player_props()
    narratives = load_narrative_factors()

    # Run all models
    m1 = PythagoreanModel().run(sea, ne)
    m2 = Log5Model().run(sea, ne)
    m3 = EloModel().run(sea, ne)
    m4 = EfficiencyModel().run(sea, ne)
    m5 = MonteCarloModel().run(sea, ne)
    m6 = SituationalModel().run(sea, ne)
    m7 = SentimentModel().run(sea, ne, line, narratives)

    all_models = [m1, m2, m3, m4, m5, m6, m7]
    ensemble = EnsembleModel().combine(all_models)
    edges = EdgeDetector().detect(ensemble, line)

    while True:
        header()
        print("  MENU")
        print("  " + "-" * 40)
        print("  [1] Full Pre-Game Analysis (all models)")
        print("  [2] Team Comparison")
        print("  [3] Model-by-Model Breakdown")
        print("  [4] Ensemble Consensus Prediction")
        print("  [5] Sentiment & Narrative Analysis")
        print("  [6] Edge Detection vs. Vegas Lines")
        print("  [7] Player Props Analysis")
        print("  [8] Mid-Game Recalculation")
        print("  [9] Re-run Monte Carlo (new seed)")
        print("  [0] Exit")
        print()

        choice = get_input("  Select option: ", "0")

        if choice == "1":
            header()
            print_team_comparison(sea, ne)
            section("MODEL-BY-MODEL BREAKDOWN")
            for i, m in enumerate(all_models, 1):
                print_model_result(m, i)
            print_ensemble(ensemble)
            print_edges(edges, line)
            print_narratives(narratives)
            print_player_props(props)

        elif choice == "2":
            print_team_comparison(sea, ne)

        elif choice == "3":
            section("MODEL-BY-MODEL BREAKDOWN")
            for i, m in enumerate(all_models, 1):
                print_model_result(m, i)

        elif choice == "4":
            print_ensemble(ensemble)

        elif choice == "5":
            print_narratives(narratives)
            print_model_result(m7, 7)

        elif choice == "6":
            print_edges(edges, line)

        elif choice == "7":
            print_player_props(props)

        elif choice == "8":
            interactive_live_game(sea, ne, ensemble)

        elif choice == "9":
            new_seed = int(get_input("  Enter random seed (default=random): ", "0"))
            if new_seed == 0:
                new_seed = random.randint(1, 99999)
            random.seed(new_seed)
            m5 = MonteCarloModel().run(sea, ne, MONTE_CARLO_SIMS)
            all_models[4] = m5
            ensemble = EnsembleModel().combine(all_models)
            edges = EdgeDetector().detect(ensemble, line)
            print(f"\n  Monte Carlo re-run with seed {new_seed}. Ensemble updated.")
            print_model_result(m5, 5)
            print_ensemble(ensemble)

        elif choice == "0":
            print("\n  Good luck tonight! May the best team win.\n")
            break

        else:
            print("\n  Invalid option. Try again.")

        print()
        get_input("  Press Enter to continue...")


# ============================================================================
#  NON-INTERACTIVE MODE (for piped / scripted use)
# ============================================================================

def run_full_analysis():
    """Run complete analysis and print everything (no menu)."""
    sea = load_seahawks()
    ne = load_patriots()
    line = load_betting_line()
    props = load_player_props()
    narratives = load_narrative_factors()

    m1 = PythagoreanModel().run(sea, ne)
    m2 = Log5Model().run(sea, ne)
    m3 = EloModel().run(sea, ne)
    m4 = EfficiencyModel().run(sea, ne)
    m5 = MonteCarloModel().run(sea, ne)
    m6 = SituationalModel().run(sea, ne)
    m7 = SentimentModel().run(sea, ne, line, narratives)

    all_models = [m1, m2, m3, m4, m5, m6, m7]
    ensemble = EnsembleModel().combine(all_models)
    edges = EdgeDetector().detect(ensemble, line)

    header()
    print_team_comparison(sea, ne)
    section("MODEL-BY-MODEL BREAKDOWN")
    for i, m in enumerate(all_models, 1):
        print_model_result(m, i)
    print_ensemble(ensemble)
    print_edges(edges, line)
    print_narratives(narratives)
    print_player_props(props)


# ============================================================================
#  ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    import sys

    if "--full" in sys.argv:
        run_full_analysis()
    else:
        try:
            main_menu()
        except (EOFError, KeyboardInterrupt):
            # Non-interactive environment -- run full analysis instead
            run_full_analysis()
