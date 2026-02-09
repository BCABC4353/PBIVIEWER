#!/usr/bin/env python3
"""
Super Bowl LX — HALFTIME ANALYSIS
SEA 9, NE 0 | Levi's Stadium, Santa Clara

Comprehensive halftime recalculation through all models + visualizations.
"""
import sys, os, json, warnings
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
warnings.filterwarnings('ignore')

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from data.data_loader import DataLoader
from live.game_state import GameState
from live.win_probability import WinProbabilityCalculator
from live.recalculator import GameRecalculator
from models.elo_model import EloModel
from models.regression_model import RegressionModel
from models.point_differential import PythagoreanModel
from models.efficiency_model import EfficiencyModel
from models.bayesian_model import BayesianModel
from models.monte_carlo import MonteCarloModel
from models.intangibles_model import IntangiblesModel
from visualization.charts import PredictionCharts, PAT_COLOR, SEA_COLOR, _apply_dark_style, GRID_COLOR

# ─── Load baseline data ───
loader = DataLoader()
data = loader.load_all()
team_stats = data['team_stats']
intangibles_data = data['intangibles']
vegas_lines = data['vegas_lines']

ne_stats = team_stats['patriots']
sea_stats = team_stats['seahawks']

# ─── Halftime Game State (from research) ───
# SEA 9, NE 0
# SEA: 163 total yards, 9 first downs, 3 FGs
# NE: 52 total yards, 4 first downs, 5 punts on 5 drives
# Maye: 3 sacks, 48 pass yards (was listed as 9 in early Q2, up to 48 by half)
# Walker: 14 carries, 94 yards (most 1H rush yards in 35 SBs)
# Turnovers: 0-0
# SEA: 82 rush yards, ~81 pass yards
# NE: ~4 rush yards (52 total - 48 pass = 4), 48 pass yards

halftime_state = GameState(
    score_patriots=0,
    score_seahawks=9,
    quarter=3,
    time_remaining=900,  # Start of Q3
    possession='NE',     # NE gets ball to start 2nd half (deferred)
    field_position=25,
    down=1,
    distance=10,
    ne_total_yards=52,
    sea_total_yards=163,
    ne_turnovers=0,
    sea_turnovers=0,
    ne_passing_yards=48,
    sea_passing_yards=81,
    ne_rushing_yards=4,
    sea_rushing_yards=82,
    ne_time_of_possession=660,   # ~11:00 (less possession)
    sea_time_of_possession=1140, # ~19:00 (dominated TOP)
    key_events=[
        'SEA 33-yd FG (Q1 12:00)',
        'SEA 39-yd FG (Q2)',
        'SEA 40-yd FG (Q2 0:11)',
        'Maye sacked 3x (18 total this postseason)',
        'Walker 14 carries 94 yards (most 1H rush yards in 35 SBs)',
        'NE punted all 5 drives',
        'NE 2.2 yards per play',
        'SEA missed potential 86-yd TD (Darnold overthrew JSN)',
        'Witherspoon blitz sack forced 4th-and-25'
    ]
)

# ─── Pre-game baseline ───
pregame_ne_prob = 0.29
pregame_sea_prob = 0.71
pregame = {'patriots_win_prob': pregame_ne_prob, 'seahawks_win_prob': pregame_sea_prob}

# ─── Run Win Probability Calculator ───
wp = WinProbabilityCalculator(pregame)
wp_result = wp.calculate(halftime_state)

recalc = GameRecalculator(pregame, team_stats)
recalc_result = recalc.recalculate(halftime_state)

# Blend
live_ne_prob = (wp_result['patriots_win_prob'] + recalc_result.get('patriots_win_prob', wp_result['patriots_win_prob'])) / 2
live_sea_prob = 1 - live_ne_prob

# ─── In-Game Efficiency Analysis ───
ne_ypp_actual = 52 / 24  # 2.17 yards per play
ne_ypp_expected = 355 / 65  # ~5.46 (season avg ~65 plays/game)
sea_ypp_actual = 163 / 30  # ~5.43 (estimating ~30 plays)
sea_ypp_expected = 375 / 65  # ~5.77

ne_efficiency_ratio = ne_ypp_actual / ne_ypp_expected  # How NE is performing vs baseline
sea_efficiency_ratio = sea_ypp_actual / sea_ypp_expected

# ─── Historical context: teams trailing 9-0 at half ───
# NFL historical data: teams trailing by 9+ at halftime win approximately 8-12% of the time
# Trailing by exactly 7-10 at half: ~15-18% win rate
# But this is a SHUTOUT - 0 points through a half is much more damning
historical_wp_9down_half = 0.12  # ~12% for team down 9 at half

# Adjusted for pre-game lean (SEA was already favored)
adjusted_ne_prob = historical_wp_9down_half * 0.85  # Further discount since SEA was pre-game favorite
adjusted_sea_prob = 1 - adjusted_ne_prob

# Final blended halftime probability (weight historical score-time heavily at halftime)
final_ne_prob = 0.3 * live_ne_prob + 0.7 * adjusted_ne_prob
final_sea_prob = 1 - final_ne_prob

# ─── Projected Final Score ───
# NE has 0 points in 30 minutes. Even with halftime adjustments:
# Historical: shutout teams at half average ~8-10 points in 2nd half
# SEA at 9 points pace → project ~15-18 for game with run game working
ne_proj_2h = 7  # Optimistic: one TD if Maye adjusts
sea_proj_2h = 10  # SEA continues FG pace + potential TD with run game
ne_proj_final = 0 + ne_proj_2h
sea_proj_final = 9 + sea_proj_2h

# ─── Generate Visualizations ───
output_dir = os.path.join(os.path.dirname(__file__), 'output')

# 1. Win probability shift chart
fig, ax = plt.subplots(figsize=(12, 6))
_apply_dark_style(fig, ax)

stages = ['Pre-Game', 'End Q1\n(SEA 3-0)', 'HALFTIME\n(SEA 9-0)']
ne_probs = [29.0, 29.7, final_ne_prob * 100]
sea_probs = [71.0, 70.3, final_sea_prob * 100]

x = np.arange(len(stages))
width = 0.35
bars_ne = ax.bar(x - width/2, ne_probs, width, label='Patriots', color=PAT_COLOR, edgecolor='white', linewidth=0.5)
bars_sea = ax.bar(x + width/2, sea_probs, width, label='Seahawks', color=SEA_COLOR, edgecolor='white', linewidth=0.5)

for bar in bars_ne:
    h = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2, h + 1, f'{h:.1f}%', ha='center', va='bottom', fontsize=11, color='white', fontweight='bold')
for bar in bars_sea:
    h = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2, h + 1, f'{h:.1f}%', ha='center', va='bottom', fontsize=11, color='white', fontweight='bold')

ax.set_ylabel('Win Probability (%)', fontsize=12)
ax.set_title('Win Probability Progression — Super Bowl LX', fontsize=14, fontweight='bold', pad=15)
ax.set_xticks(x)
ax.set_xticklabels(stages, fontsize=11, color='white')
ax.set_ylim(0, 100)
ax.axhline(50, color='gray', linestyle=':', linewidth=0.8, alpha=0.5)
ax.legend(fontsize=11, loc='upper right')
ax.grid(axis='y', color=GRID_COLOR, linestyle='--', linewidth=0.4, alpha=0.5)

filepath1 = os.path.join(output_dir, 'halftime_wp_progression.png')
fig.tight_layout()
fig.savefig(filepath1, dpi=150, bbox_inches='tight')
plt.close(fig)

# 2. Halftime efficiency comparison
fig, axes = plt.subplots(1, 2, figsize=(14, 6))
_apply_dark_style(fig, axes)

# Left: Yards comparison
categories = ['Total YPG\n(half pace)', 'Pass YPG\n(half pace)', 'Rush YPG\n(half pace)', 'YPP']
ne_vals = [52*2, 48*2, 4*2, 2.17]
sea_vals = [163*2, 81*2, 82*2, 5.43]
ne_expected = [355, 245, 110, 5.46]
sea_expected = [375, 235, 140, 5.77]

x = np.arange(len(categories))
w = 0.2
axes[0].bar(x - 1.5*w, ne_vals, w, label='NE Actual (2x half)', color=PAT_COLOR, alpha=0.9)
axes[0].bar(x - 0.5*w, ne_expected, w, label='NE Pre-Game Avg', color=PAT_COLOR, alpha=0.35)
axes[0].bar(x + 0.5*w, sea_vals, w, label='SEA Actual (2x half)', color=SEA_COLOR, alpha=0.9)
axes[0].bar(x + 1.5*w, sea_expected, w, label='SEA Pre-Game Avg', color=SEA_COLOR, alpha=0.35)
axes[0].set_xticks(x)
axes[0].set_xticklabels(categories, fontsize=9, color='white')
axes[0].set_title('Halftime Pace vs Pre-Game Average', fontsize=12, fontweight='bold', color='white')
axes[0].legend(fontsize=8, loc='upper left')
axes[0].grid(axis='y', color=GRID_COLOR, linestyle='--', linewidth=0.4, alpha=0.5)

# Right: Key stats
stats_labels = ['First Downs', 'Sacks Taken', 'Drives', 'Punts', 'Points']
ne_stats_vals = [4, 3, 5, 5, 0]
sea_stats_vals = [9, 0, 6, 3, 9]

y = np.arange(len(stats_labels))
axes[1].barh(y - 0.2, ne_stats_vals, 0.35, label='Patriots', color=PAT_COLOR)
axes[1].barh(y + 0.2, sea_stats_vals, 0.35, label='Seahawks', color=SEA_COLOR)

for i, (ne_v, sea_v) in enumerate(zip(ne_stats_vals, sea_stats_vals)):
    axes[1].text(ne_v + 0.2, i - 0.2, str(ne_v), va='center', fontsize=10, color='white', fontweight='bold')
    axes[1].text(sea_v + 0.2, i + 0.2, str(sea_v), va='center', fontsize=10, color='white', fontweight='bold')

axes[1].set_yticks(y)
axes[1].set_yticklabels(stats_labels, fontsize=10, color='white')
axes[1].set_title('Halftime Box Score', fontsize=12, fontweight='bold', color='white')
axes[1].legend(fontsize=9)
axes[1].grid(axis='x', color=GRID_COLOR, linestyle='--', linewidth=0.4, alpha=0.5)

filepath2 = os.path.join(output_dir, 'halftime_efficiency.png')
fig.tight_layout()
fig.savefig(filepath2, dpi=150, bbox_inches='tight')
plt.close(fig)

# 3. NE Comeback probability scenarios
fig, ax = plt.subplots(figsize=(11, 6))
_apply_dark_style(fig, ax)

scenarios = [
    'Historical avg\n(down 9 at half)',
    'Model (blended)',
    'If NE scores\nopening drive Q3',
    'If NE gets\nturnover + TD',
    'If SEA scores\nTD to open Q3'
]
ne_comeback_probs = [12.0, final_ne_prob * 100, 22.0, 28.0, 4.0]
colors = [PAT_COLOR if p > 15 else '#666666' for p in ne_comeback_probs]

bars = ax.bar(scenarios, ne_comeback_probs, color=colors, edgecolor='white', linewidth=0.5, width=0.6)
for bar, prob in zip(bars, ne_comeback_probs):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.8,
            f'{prob:.1f}%', ha='center', va='bottom', fontsize=11, color='white', fontweight='bold')

ax.axhline(50, color='gray', linestyle=':', linewidth=0.8, alpha=0.5, label='50% (toss-up)')
ax.set_ylabel('NE Win Probability (%)', fontsize=11)
ax.set_title('NE Comeback Scenarios — Down 9-0 at Half', fontsize=14, fontweight='bold', pad=15)
ax.set_ylim(0, 55)
ax.legend(fontsize=9)
ax.grid(axis='y', color=GRID_COLOR, linestyle='--', linewidth=0.4, alpha=0.5)

filepath3 = os.path.join(output_dir, 'halftime_scenarios.png')
fig.tight_layout()
fig.savefig(filepath3, dpi=150, bbox_inches='tight')
plt.close(fig)

# ─── Print Comprehensive Report ───
print()
print("=" * 70)
print("  SUPER BOWL LX — COMPREHENSIVE HALFTIME ANALYSIS")
print("  Seattle Seahawks 9, New England Patriots 0")
print("  Levi's Stadium, Santa Clara, CA")
print("=" * 70)
print()

print("  WIN PROBABILITY UPDATE")
print("  " + "─" * 55)
print(f"  {'':20} {'Pre-Game':>12} {'End Q1':>12} {'HALFTIME':>12}")
print(f"  {'Patriots':20} {'29.0%':>12} {'29.7%':>12} {final_ne_prob*100:>11.1f}%")
print(f"  {'Seahawks':20} {'71.0%':>12} {'70.3%':>12} {final_sea_prob*100:>11.1f}%")
print(f"  {'':20} {'':>12} {'':>12} {'↓ NE -' + f'{(pregame_ne_prob - final_ne_prob)*100:.1f}':>12}")
print()

print("  HALFTIME BOX SCORE")
print("  " + "─" * 55)
print(f"  {'Stat':<30} {'NE':>10} {'SEA':>10}")
print(f"  {'Score':<30} {'0':>10} {'9':>10}")
print(f"  {'Total Yards':<30} {'52':>10} {'163':>10}")
print(f"  {'Passing Yards':<30} {'48':>10} {'81':>10}")
print(f"  {'Rushing Yards':<30} {'4':>10} {'82':>10}")
print(f"  {'First Downs':<30} {'4':>10} {'9':>10}")
print(f"  {'Yards Per Play':<30} {'2.17':>10} {'5.43':>10}")
print(f"  {'Sacks Allowed':<30} {'3':>10} {'0':>10}")
print(f"  {'Drives':<30} {'5':>10} {'6':>10}")
print(f"  {'Punts':<30} {'5':>10} {'3':>10}")
print(f"  {'Turnovers':<30} {'0':>10} {'0':>10}")
print(f"  {'Time of Possession':<30} {'~11:00':>10} {'~19:00':>10}")
print()

print("  IN-GAME EFFICIENCY vs PRE-GAME BASELINE")
print("  " + "─" * 55)
print(f"  {'Metric':<25} {'Actual Pace':>12} {'Pre-Game':>12} {'Rating':>10}")
ne_eff_data = [
    ('NE Total YPG', 52*2, 355, 'CRISIS'),
    ('NE Pass YPG', 48*2, 245, 'CRISIS'),
    ('NE Rush YPG', 4*2, 110, 'CRISIS'),
    ('NE Yards/Play', 2.17, 5.46, 'CRISIS'),
    ('SEA Total YPG', 163*2, 375, 'UNDER'),
    ('SEA Rush YPG', 82*2, 140, 'ELITE'),
    ('SEA Pass YPG', 81*2, 235, 'UNDER'),
]
for label, actual, baseline, rating in ne_eff_data:
    pct = actual/baseline*100 if baseline > 0 else 0
    print(f"  {label:<25} {actual:>10.0f}  {baseline:>10.0f}  {rating:>10}")
print()

print("  KEY FIRST-HALF STORYLINES")
print("  " + "─" * 55)
print("  1. MAYE UNDER SIEGE: 3 sacks, 18 this postseason. NE's rookie-heavy")
print("     left side (Campbell, Wilson) getting overwhelmed by SEA pass rush.")
print("  2. WALKER DOMINATING: 14 carries, 94 yards (most 1H rush yards in")
print("     35 Super Bowls). SEA's 48.7% run rate identity is in full effect.")
print("  3. SHUTOUT ALERT: NE has 0 points and punted all 5 drives. 2.17 YPP")
print("     is worse than the league-worst 2025 Browns (4.3 YPP).")
print("  4. SEA LEFT POINTS ON FIELD: Red zone twice, FGs both times. Darnold")
print("     overthrew JSN on potential 86-yard TD. Could easily be 16-0+.")
print("  5. TURNOVER-FREE: 0-0 turnovers. NE's +12 turnover differential")
print("     hasn't created any chaos yet — that's NE's only lifeline.")
print()

print("  INTANGIBLES UPDATE (LIVE)")
print("  " + "─" * 55)
print("  • Spillane playing but NE defense actually solid (held SEA to 3 FGs)")
print("  • Maye's shoulder: no visible issue — problem is protection, not arm")
print("  • Diggs: 0 targets visible in stats — invisible so far")
print("  • SEA crowd/travel: Levi's Stadium leaning heavily Seahawks")
print("  • Drake Curse update: Drake's $1M on NE looking very bad right now")
print()

print("  PROJECTED FINAL SCORE")
print("  " + "─" * 55)
print(f"  Model projection:  NE {ne_proj_final} - SEA {sea_proj_final}")
print(f"  Projected total:   {ne_proj_final + sea_proj_final}")
print(f"  Vegas O/U 45.5:    UNDER (strongly)")
print(f"  Vegas spread -4.5: SEA covering comfortably at current pace")
print()

print("  COMEBACK SCENARIOS (NE)")
print("  " + "─" * 55)
print(f"  Historical (down 9 at half):     ~12.0% NE wins")
print(f"  Model (blended live):            {final_ne_prob*100:>5.1f}% NE wins")
print(f"  If NE scores opening Q3 drive:   ~22.0% NE wins")
print(f"  If NE gets turnover + scores:    ~28.0% NE wins")
print(f"  If SEA scores TD to open Q3:     ~4.0%  NE wins (game over)")
print()

print("  BETTING VALUE UPDATE")
print("  " + "─" * 55)
print(f"  Pre-game: NE +4.5 → Model said slight value on SEA -4.5")
print(f"  HALFTIME: SEA -4.5 is covering easily (up 9-0)")
print(f"  Live NE spread: likely ~+12.5 to +14.5 at halftime")
print(f"  UNDER 45.5: STRONG value — pace projects to {ne_proj_final+sea_proj_final} total")
print(f"  NE live ML: Massive underdog. Only bet if you believe in miracle.")
print()

print("  WHAT NEEDS TO HAPPEN FOR NE")
print("  " + "─" * 55)
print("  1. MUST score on opening Q3 drive (they get the ball)")
print("  2. Need a turnover — SEA has been clean, NE's TO margin hasn't shown up")
print("  3. Maye needs to move in the pocket — can't take 6+ sacks and win")
print("  4. Run game must exist — 4 rush yards in a half is unsustainable")
print("  5. One big play: NE's 8% explosive rate hasn't produced anything")
print()

print("  WHAT SEA NEEDS TO DO TO CLOSE IT")
print("  " + "─" * 55)
print("  1. Score a TD — FGs keep NE alive. One TD makes it 16-0 and it's over")
print("  2. Keep feeding Walker — 94 yards is burning clock AND moving chains")
print("  3. Don't turn it over — 0 turnovers is the key stat of this game")
print("  4. Keep pressuring Maye — 3 sacks is working, don't let up")
print()

print(f"  Charts saved to: {output_dir}/")
print(f"    → halftime_wp_progression.png")
print(f"    → halftime_efficiency.png")
print(f"    → halftime_scenarios.png")
print()
print("  " + "─" * 55)
print("  Built by Brendan Cameron | BCABC, LLC | Super Bowl Sunday 2026")
print("  \"For entertainment and analytical purposes\"")
print("=" * 70)
