"""Build a checked-facts section and a reviewable local-model draft from GitHub issues."""

import argparse
import json
import math
import os
import re
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from statistics import mean
from time import perf_counter
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
KZ = timezone(timedelta(hours=5))
API = "https://api.github.com/repos/"
MODEL_URL = "http://127.0.0.1:8012/v1/chat/completions"


def github(repo, path):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "til-mix-pm-status"}
    if token := os.environ.get("GH_TOKEN"):
        headers["Authorization"] = f"Bearer {token}"
    with urlopen(Request(f"{API}{repo}/{path}", headers=headers), timeout=20) as response:
        return json.load(response)


def at(value):
    return datetime.fromisoformat(value)


def previous_week(now):
    monday = now.date() - timedelta(days=now.weekday())
    end = datetime.combine(monday, time(), KZ)
    return end - timedelta(days=7), end


def source_records(repo, ids, start, end):
    if ids:
        records = [github(repo, f"issues/{number}") for number in ids]
        if any(not is_completed(issue) for issue in records):
            raise ValueError("Replay IDs must belong to completed issues, excluding pull requests.")
        return records

    records = []
    since = start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for page in range(1, 21):
        query = urlencode({"state": "closed", "since": since, "per_page": 100, "page": page})
        batch = github(repo, "issues?" + query)
        records.extend(issue for issue in batch if is_completed(issue) and start <= at(issue["closed_at"]) < end)
        if len(batch) < 100:
            return records
    raise RuntimeError("GitHub paging limit hit, report withheld to avoid a partial count.")


def is_completed(issue):
    return (
        "pull_request" not in issue and issue["state"] == "closed" and
        issue.get("state_reason") == "completed" and issue.get("closed_at") is not None
    )


def summarize(records):
    issues = []
    for issue in sorted(records, key=lambda item: (item["closed_at"], item["number"])):
        seconds = int((at(issue["closed_at"]) - at(issue["created_at"])).total_seconds())
        if seconds < 0:
            raise ValueError("Issue closure precedes creation.")
        issues.append({
            "number": issue["number"], "created_at": issue["created_at"],
            "closed_at": issue["closed_at"], "elapsed_seconds": seconds
        })
    times = sorted(issue["elapsed_seconds"] for issue in issues)
    return {
        "completed": len(issues), "mean_seconds": round(mean(times), 1) if times else None,
        "p85_seconds": times[math.ceil(.85 * len(times)) - 1] if times else None,
        "issues": issues,
    }


def model_draft(facts):
    numbers = [item["number"] for item in facts["issues"]]
    input_data = {
        "completed": facts["completed"], "mean_seconds": facts["mean_seconds"],
        "p85_seconds": facts["p85_seconds"], "issue_numbers": numbers[:40],
        "issue_numbers_complete": len(numbers) <= 40,
    }
    request_body = {
        "model": "qwen-pm",
        "temperature": 0, "seed": 42, "max_tokens": 160,
        "messages": [
            {"role": "system", "content": (ROOT / "pm-status-prompt.txt").read_text(encoding="utf-8")},
            {"role": "user", "content": json.dumps(input_data, ensure_ascii=False)}
        ]
    }
    request = Request(MODEL_URL, data=json.dumps(request_body).encode(), headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=90) as response:
        return json.load(response)["choices"][0]["message"]["content"]


def make_report(repo, label, start, end, facts, draft):
    lines = [f"# Статус Тіл Mix · {label}", "", "## Проверяемые данные GitHub", ""]
    if start:
        lines.extend([f"Период в UTC+5: с {start:%d.%m.%Y} до {end:%d.%m.%Y}, конец исключён.", ""])
    lines.append(f"Завершено задач: **{facts['completed']}**.")
    if facts["issues"]:
        lines += [
            f"Среднее от создания до закрытия: **{facts['mean_seconds']} с**. P85: **{facts['p85_seconds']} с**.",
            "", "| Задача | Создана UTC | Закрыта UTC | Секунд |", "|---|---|---|---:|"
        ]
        for item in facts["issues"]:
            number = item["number"]
            lines.append(
                f"| [#{number}](https://github.com/{repo}/issues/{number}) | "
                f"{item['created_at']} | {item['closed_at']} | {item['elapsed_seconds']} |"
            )
    lines += [
        "", "## Черновик локальной модели", "",
        "Требуется сверка автором. Показатели статуса берутся из раздела выше.", "",
        *("> " + line for line in draft.splitlines()), ""
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="Ameke111/til-mix")
    parser.add_argument("--issues", type=int, nargs="+", help="Replay completed issue IDs.")
    parser.add_argument("--label", help="Name of a replay cycle.")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repo):
        parser.error("Expected GitHub owner/repository.")
    if args.issues and (not args.label or not re.fullmatch(r"[A-Za-z0-9-]+", args.label)):
        parser.error("Use --label with a replay, for example, S1.")
    if args.issues and (min(args.issues) <= 0 or len(set(args.issues)) != len(args.issues)):
        parser.error("Replay IDs must be distinct positive integers.")
    start, end = (None, None) if args.issues else previous_week(datetime.now(KZ))
    label = args.label if args.issues else start.strftime("%Y-%m-%d")
    begin = perf_counter()
    facts = summarize(source_records(args.repo, args.issues, start, end))
    fetched = perf_counter()
    draft = model_draft(facts)
    now = perf_counter()
    timings = {"github_seconds": round(fetched - begin, 2), "model_seconds": round(now - fetched, 2)}
    evidence = {"cycle": label, "facts": facts, "model_draft": draft, "timings": timings}
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / f"{label}.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (args.out / f"{label}.md").write_text(make_report(args.repo, label, start, end, facts, draft), encoding="utf-8")
    print(json.dumps(evidence, ensure_ascii=False))


if __name__ == "__main__":
    main()
