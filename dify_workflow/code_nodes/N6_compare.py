def _to_int(v, default=0):
    try:
        return int(round(float(v)))
    except Exception:
        return default


def main(**args):
    intake_total = _to_int(args.get("intake_total"), 0)
    tdee = _to_int(args.get("tdee"), 0)
    delta = intake_total - tdee

    if delta > 200:
        conclusion = "摄入超标（热量盈余）"
    elif delta < -200:
        conclusion = "摄入不足（热量缺口较大）"
    else:
        conclusion = "摄入基本匹配（接近维持）"

    delta_text = f"{delta:+d} kcal"

    return {
        "intake_vs_need": f"{intake_total} vs {tdee} kcal",
        "delta": delta,
        "delta_text": delta_text,
        "conclusion": conclusion,
    }
