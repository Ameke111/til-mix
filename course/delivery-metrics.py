"""Fetch public delivery evidence and render reproducible figures for Til Mix."""
from __future__ import annotations

import argparse
import json
import os
from collections import Counter
from datetime import datetime, timedelta, timezone
from math import ceil
from pathlib import Path
from statistics import mean, median
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
REPOSITORY = "Ameke111/til-mix"
BASE = "https://api.github.com/repos/" + REPOSITORY


def get(path, **query):
    url = BASE + path + ("?" + urlencode(query) if query else "")
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "TilMix-DeliveryEvidence"}
    if os.getenv("GITHUB_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
    with urlopen(Request(url, headers=headers), timeout=14) as response:
        return json.load(response)


def instant(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def upper_percentile(values, share):
    return sorted(values)[ceil(len(values) * share) - 1]


def save(name, data):
    (ROOT / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf8")


def load(name):
    return json.loads((ROOT / name).read_text(encoding="utf8"))


def refresh():
    snapshot = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    outstanding = get("/issues", state="all", per_page=100)
    flow = [
        {key: issue[key] for key in ("number", "title", "html_url", "state", "created_at", "closed_at")}
        for issue in outstanding if issue["title"].startswith(("[ЛЗ 9 / S1]", "[ЛЗ 9 / S2]"))
    ]
    save("flow-evidence.json", {"source": BASE + "/issues", "snapshot_utc": snapshot, "issues": sorted(flow, key=lambda i: i["number"])})
    deployments = []
    commits = {}
    for deployment in get("/deployments", environment="github-pages", per_page=100):
        sha = deployment["sha"]
        statuses = get(f"/deployments/{deployment['id']}/statuses", per_page=100)
        if sha not in commits:
            commits[sha] = get("/commits/" + sha)["commit"]["committer"]["date"]
        deployments.append({
            "id": deployment["id"], "sha": sha, "commit_utc": commits[sha],
            "created_utc": deployment["created_at"],
            "states": [
                {"state": status["state"], "at": status["created_at"], "details": status["log_url"]}
                for status in statuses
            ],
        })
    save("dora-evidence.json", {
        "source": BASE + "/deployments?environment=github-pages",
        "snapshot_utc": snapshot, "deployments": sorted(deployments, key=lambda item: item["created_utc"]),
        "production_incidents": []
    })


def flow_stats(evidence):
    result = []
    for label in ("S1", "S2"):
        scope = [i for i in evidence["issues"] if (" / " + label + "]") in i["title"]]
        complete = [i for i in scope if i["closed_at"]]
        elapsed = [(instant(i["closed_at"]) - instant(i["created_at"])).total_seconds() / 60 for i in complete]
        result.append({
            "cycle": label, "scope": len(scope), "completed": len(complete),
            "mean_minutes": round(mean(elapsed), 2) if elapsed else None,
            "p85_minutes": round(upper_percentile(elapsed, .85), 2) if elapsed else None,
        })
    return result


def dora_stats(evidence):
    successful = []
    failed_attempts = 0
    for item in evidence["deployments"]:
        successes = [instant(state["at"]) for state in item["states"] if state["state"] == "success"]
        if successes:
            successful.append((item, min(successes)))
        elif any(state["state"] in ("failure", "error") for state in item["states"]):
            failed_attempts += 1
    sample = sorted(successful, key=lambda pair: pair[1])
    lags = [(deployed - instant(source["commit_utc"])).total_seconds() / 60 for source, deployed in sample]
    if any(value < 0 for value in lags):
        raise ValueError("A deployment predates its associated commit.")
    days = Counter(deployed.date().isoformat() for _, deployed in sample)
    history_days = (sample[-1][1].date() - sample[0][1].date()).days + 1 if sample else 0
    incidents = evidence["production_incidents"]
    affected = {incident["deployment_id"] for incident in incidents}
    recovery = [
        (instant(incident["end"]) - instant(incident["start"])).total_seconds() / 60
        for incident in incidents if incident.get("end")
    ]
    return {
        "deployments": len(sample), "active_days": dict(days), "observed_days": history_days,
        "frequency_per_calendar_day": round(len(sample) / history_days, 2) if history_days else None,
        "lead_p50_minutes": round(median(lags), 2) if lags else None,
        "lead_p85_minutes": round(upper_percentile(lags, .85), 2) if lags else None,
        "lead_minutes": lags, "failed_attempts_before_confirmed_success": failed_attempts,
        "confirmed_change_incidents": len(affected),
        "observed_change_failure_rate": round(len(affected) / len(sample), 4) if sample else None,
        "median_recovery_minutes": round(median(recovery), 2) if recovery else None,
    }


def render_flow(evidence, stats):
    import matplotlib.pyplot as plt
    import matplotlib.dates as dates

    zone = timezone(timedelta(hours=5))
    events = []
    for issue in evidence["issues"]:
        events.append((instant(issue["created_at"]), "start"))
        if issue["closed_at"]:
            events.append((instant(issue["closed_at"]), "done"))
    if not events:
        return
    events.sort()
    stages = {"Готово": 0, "В проверке": 0, "В очереди": len(evidence["issues"])}
    times = [events[0][0]]
    samples = {key: [value] for key, value in stages.items()}
    for stamp, status in events:
        times.append(stamp)
        if status == "start":
            stages["В очереди"] -= 1
            stages["В проверке"] += 1
        else:
            stages["В проверке"] -= 1
            stages["Готово"] += 1
        for key in stages:
            samples[key].append(stages[key])
    times.append(events[-1][0] + timedelta(seconds=15))
    for key in stages:
        samples[key].append(stages[key])

    fig, axes = plt.subplots(1, 2, figsize=(12.3, 4.0), layout="constrained")
    fig.patch.set_facecolor("#f7f6ef")
    ax_one, ax_two = axes
    ax_one.stackplot(times, *samples.values(), labels=samples.keys(), step="post", colors=["#80a576", "#bed78e", "#e4d8f0"])
    ax_one.set_title("Кумулятивная диаграмма потока", loc="left", fontweight="bold")
    ax_one.xaxis.set_major_formatter(dates.DateFormatter("%H:%M", tz=zone))
    ax_one.set_xlabel("Локальное время РК")
    ax_one.set_ylabel("Задачи")
    ax_one.set_yticks(range(len(evidence["issues"]) + 1))
    ax_one.set_ylim(0, len(evidence["issues"]) + .3)
    ax_one.legend(loc="lower right", frameon=True)
    names = [row["cycle"] for row in stats]
    ax_two.bar([0, 1], [row["mean_minutes"] or 0 for row in stats], width=.42, color="#5c8962", label="Среднее")
    ax_two.scatter([0, 1], [row["p85_minutes"] or 0 for row in stats], color="#8049ab", marker="D", label="P85")
    ax_two.set_xticks([0, 1], names)
    ax_two.set_title("Время активной проверки", loc="left", fontweight="bold")
    ax_two.set_ylabel("Минуты")
    ax_two.legend(frameon=False)
    for ax in axes:
        ax.spines[["top", "right"]].set_visible(False)
    fig.savefig(ROOT / "flow-dashboard.png", dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)


def render_dora(evidence, stats):
    import matplotlib.pyplot as plt
    from matplotlib.patches import FancyBboxPatch

    fig = plt.figure(figsize=(12, 6.4), facecolor="#f7f6ef")
    ink, secondary = "#193527", "#4b6555"
    fig.text(.06, .9, "Поставка Тіл Mix", fontsize=32, weight="bold", color=ink)
    fig.text(.06, .841, f"GitHub Pages  /  срез {evidence['snapshot_utc'][:10]}  /  один исполнитель", fontsize=12, color=secondary)
    recover = "Н/Д" if stats["median_recovery_minutes"] is None else f"{stats['median_recovery_minutes']:.1f} мин"
    lead = "Н/Д" if stats["lead_p50_minutes"] is None else f"{stats['lead_p50_minutes']:.1f} мин"
    cards = [
        ("Частота поставки", str(stats["deployments"]), "подтверждённых выкладок Pages"),
        ("Время до публикации", lead, "P50 от коммита HEAD до success"),
        ("Неполадки после релиза", str(stats["confirmed_change_incidents"]), "подтверждено в журнале инцидентов"),
        ("Время восстановления", recover, "нет пары сбоя и восстановления" if recover == "Н/Д" else "медиана по инцидентам"),
    ]
    for index, (label, number, caption) in enumerate(cards):
        x = .06 + .455 * (index % 2)
        y = .49 - .31 * (index // 2)
        fig.add_artist(FancyBboxPatch((x, y), .424, .25, boxstyle="round,pad=0.004,rounding_size=.016",
                                      transform=fig.transFigure, facecolor="#e7efdc" if index < 2 else "#eee8f7",
                                      edgecolor="none", zorder=-1))
        fig.text(x+.019, y+.197, label, fontsize=14, weight="bold", color=ink)
        fig.text(x+.019, y+.09, number, fontsize=29, weight="bold", color=ink)
        fig.text(x+.019, y+.03, caption, fontsize=10, color=secondary)
    fig.text(.06, .09, "Выборка короткая. Отсутствие записанного инцидента не измеряет надёжность.", fontsize=11, color=secondary)
    fig.savefig(ROOT / "dora-dashboard.png", dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="read the public GitHub API before plotting")
    args = parser.parse_args()
    if args.refresh:
        refresh()
    flow = load("flow-evidence.json")
    dora = load("dora-evidence.json")
    flow_summary = flow_stats(flow)
    dora_summary = dora_stats(dora)
    print(json.dumps({"flow": flow_summary, "dora": dora_summary}, indent=2, ensure_ascii=False))
    render_flow(flow, flow_summary)
    render_dora(dora, dora_summary)


if __name__ == "__main__":
    main()
