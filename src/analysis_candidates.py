#!/usr/bin/env python3
"""
Deep analysis of candidates_filtered.csv to find features
that distinguish prize-winning candidates from non-winners.
Winning draw: Main {19,28,34,38,39,44}, Supp {29,45}
"""
import csv, statistics, collections, math, itertools

rows = []
with open('candidates_filtered.csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        row['main_nums'] = list(map(int, row['Main (6)'].split()))
        row['supp_nums'] = list(map(int, row['Supp (2)'].split()))
        row['all_nums'] = row['main_nums'] + row['supp_nums']
        rows.append(row)

WIN_MAIN = {19, 28, 34, 38, 39, 44}
WIN_SUPP = {29, 45}
WIN_ALL  = WIN_MAIN | WIN_SUPP

prize_rows   = [r for r in rows if r['Prize'] not in ('--','—')]
noprize_rows = [r for r in rows if r['Prize'] in ('--','—')]

print(f"Total: {len(rows)}, Prize: {len(prize_rows)}, No-prize: {len(noprize_rows)}")

# --- Feature computation ---
def features(r):
    nums = r['all_nums']
    mains = r['main_nums']
    supps = r['supp_nums']
    sorted_m = sorted(mains)
    sorted_a = sorted(nums)

    gaps_m = [sorted_m[i+1]-sorted_m[i] for i in range(len(sorted_m)-1)]
    gaps_a = [sorted_a[i+1]-sorted_a[i] for i in range(len(sorted_a)-1)]

    # How many numbers from the candidate touch the winning numbers set
    win_main_hits = len(set(mains) & WIN_MAIN)
    win_supp_hits = len(set(supps) & WIN_SUPP)
    win_any_hits  = len(set(nums) & WIN_ALL)

    # Zone coverage: zones of 5 (1-5, 6-10, ..., 41-45)
    zones = set((n-1)//5 for n in nums)

    # Parity: even vs odd
    evens = sum(1 for n in mains if n%2==0)
    odds  = 6 - evens

    # Sum features
    s_all  = sum(nums)
    s_main = sum(mains)

    # Spread
    spread_m = max(mains) - min(mains)
    spread_a = max(nums)  - min(nums)

    # Gap features
    mean_gap = statistics.mean(gaps_m)
    max_gap  = max(gaps_m)
    min_gap  = min(gaps_m)
    std_gap  = statistics.stdev(gaps_m) if len(gaps_m)>1 else 0

    # Consecutive pairs
    consec_m = sum(1 for i in range(len(sorted_m)-1) if sorted_m[i+1]-sorted_m[i]==1)
    consec_a = sum(1 for i in range(len(sorted_a)-1) if sorted_a[i+1]-sorted_a[i]==1)

    # Density: how tightly packed are the 6 main numbers
    # Perfect even spacing would give spread/5 = each gap
    density = (spread_m / mean_gap) if mean_gap > 0 else 0  # lower = tighter

    # Quartile distribution (Q1=1-11, Q2=12-22, Q3=23-33, Q4=34-45)
    q1 = sum(1 for n in nums if n<=11)
    q2 = sum(1 for n in nums if 12<=n<=22)
    q3 = sum(1 for n in nums if 23<=n<=33)
    q4 = sum(1 for n in nums if n>=34)

    # Supp proximity to mains (absolute distance to nearest main)
    supp_dists = [min(abs(s-m) for m in mains) for s in supps]
    supp_min_dist = min(supp_dists)
    supp_mean_dist = statistics.mean(supp_dists)

    # Centroid of main numbers
    centroid = sum(mains)/6

    return {
        'sum_main':      s_main,
        'sum_all':       s_all,
        'spread_main':   spread_m,
        'centroid':      centroid,
        'low_nums(1-22)':sum(1 for n in mains if n<=22),
        'high_nums(23+)':sum(1 for n in mains if n>22),
        'q1_count':      q1,
        'q4_count':      q4,
        'zones_covered': len(zones),
        'evens':         evens,
        'mean_gap':      mean_gap,
        'max_gap':       max_gap,
        'std_gap':       std_gap,
        'consec_m':      consec_m,
        'supp_min_dist': supp_min_dist,
    }

fk = list(features(rows[0]).keys())

print(f"\n{'Feature':<22} {'Prize':>10} {'NoPrize':>10} {'Diff%':>8} {'Lift@top10%':>12}")
print('-'*68)
stats_prize   = {k: [features(r)[k] for r in prize_rows]   for k in fk}
stats_noprize = {k: [features(r)[k] for r in noprize_rows] for k in fk}

for k in fk:
    pv = stats_prize[k]
    nv = stats_noprize[k]
    pm = statistics.mean(pv)
    nm = statistics.mean(nv)
    diff = 100*(pm-nm)/(abs(nm)+0.001)

    # Lift at top 10%: what fraction of prize rows are in top 10% by this feature
    all_vals = [(features(r)[k], r['Prize'] not in ('--','—')) for r in rows]
    all_vals.sort(key=lambda x: -x[0])
    top10 = all_vals[:len(all_vals)//10]
    lift = (sum(1 for _,p in top10 if p)/len(top10)) / (len(prize_rows)/len(rows))
    print(f"{k:<22} {pm:>10.2f} {nm:>10.2f} {diff:>8.1f}% {lift:>12.2f}x")

print("\n\n=== NUMBER FREQUENCY in candidates ===")
# How often does each winning number appear across ALL generated candidates
num_freq_prize   = collections.Counter(n for r in prize_rows   for n in r['all_nums'])
num_freq_noprize = collections.Counter(n for r in noprize_rows for n in r['all_nums'])
total_slots_p  = len(prize_rows) * 8
total_slots_np = len(noprize_rows) * 8
print(f"{'Num':>4} {'IsWinner':>8} {'Prize%':>8} {'NoPrize%':>10} {'Lift':>6}")
for n in sorted(set(num_freq_prize.keys()) | set(num_freq_noprize.keys())):
    p_pct  = 100 * num_freq_prize.get(n,0)   / total_slots_p
    np_pct = 100 * num_freq_noprize.get(n,0) / total_slots_np
    lift = p_pct / (np_pct+0.01)
    win = 'WIN' if n in WIN_ALL else ''
    if lift > 1.5 or lift < 0.7 or n in WIN_ALL:
        print(f"  {n:>3} {win:>8} {p_pct:>8.2f}% {np_pct:>9.2f}% {lift:>6.2f}x")

print("\n\n=== PAIR FREQUENCY ANALYSIS ===")
# How often do pairs of winning numbers co-occur within candidates
pair_prize   = collections.Counter(tuple(sorted(p)) for r in prize_rows   for p in itertools.combinations(r['all_nums'],2))
pair_noprize = collections.Counter(tuple(sorted(p)) for r in noprize_rows for p in itertools.combinations(r['all_nums'],2))
total_pairs_p  = sum(pair_prize.values())
total_pairs_np = sum(pair_noprize.values())
print("Top co-occurring pairs in PRIZE candidates (that are both winning numbers):")
for pair, cnt in pair_prize.most_common(20):
    if pair[0] in WIN_ALL and pair[1] in WIN_ALL:
        np_cnt = pair_noprize.get(pair, 0)
        lift = (cnt/total_pairs_p) / (np_cnt/total_pairs_np + 1e-9)
        print(f"  {pair}: prize={cnt} noprize={np_cnt} lift={lift:.2f}x")
