"""Review the budget assumptions and recompute 12-month and 36-month totals."""
from decimal import Decimal
from math import ceil

MONTHS = 12
THREE_YEAR_MONTHS = 36
ACTIVE_PER_MONTH = 200  # planning assumption
USD_TO_KZT = 520       # scenario conversion, not a quoted exchange rate
VPS_KZ = 5_400         # planning allowance pending a Kazakhstan host quote
AWS_USD = 7            # official Lightsail bundle, 1 GiB with public IPv4
CONTENT = 3 * 3_000
SUPPORT = 4 * 4_500
BACKUPS = 1_500
SETUP = 90_000
RESERVE = Decimal(".10")
VARIABLE = 30
VALUE_PER_ACTIVE = 300 # sponsor's assumed value proxy, not billed revenue
HARDWARE = 100_000
POWER = round(.015 * 24 * 30 * 30)  # 15 W all month, 30 KZT/kWh assumed
SELF_HOST_EXTRA = 4_500

monthly_fixed = VPS_KZ + CONTENT + SUPPORT + BACKUPS
year_before_reserve = SETUP + MONTHS * monthly_fixed
year_fixed = year_before_reserve + round(year_before_reserve * RESERVE)
year_variable = ACTIVE_PER_MONTH * MONTHS * VARIABLE
year_total = year_fixed + year_variable
unit_cost = Decimal(year_total) / (ACTIVE_PER_MONTH * MONTHS)
break_even = ceil(Decimal(year_fixed) / (MONTHS * (VALUE_PER_ACTIVE - VARIABLE)))

alternatives = {
    "Lightsail (benchmark)": (SETUP, AWS_USD * USD_TO_KZT + BACKUPS + CONTENT + SUPPORT),
    "Own host": (SETUP + HARDWARE, POWER + BACKUPS + CONTENT + SUPPORT + SELF_HOST_EXTRA),
    "KZ VPS open stack": (SETUP, monthly_fixed)
}

if __name__ == "__main__":
    print(f"Fixed/month: {monthly_fixed:,} KZT")
    print(f"Year setup + fixed before reserve: {year_before_reserve:,} KZT")
    print(f"Year fixed with reserve: {year_fixed:,} KZT")
    print(f"Year variable / total: {year_variable:,} / {year_total:,} KZT")
    print(f"Cost per active learner-month: {unit_cost:.2f} KZT")
    print(f"Break-even average active learners: {break_even}")
    for name, (initial, monthly) in alternatives.items():
        print(f"{name}: {initial + THREE_YEAR_MONTHS * monthly:,} KZT / 36 months")
    assert year_total == 618_480
    assert break_even == 169
