def _to_int(v, default=0):
    try:
        return int(round(float(v)))
    except Exception:
        return default


def main(**args):
    delta = _to_int(args.get("delta"), 0)

    common = "保持每日饮水 1.5-2L，晚餐后安排 20-30 分钟轻快步行。"

    if delta > 200:
        lines = [
            "晚餐主食先减 1/4（如米饭少 50-75g），优先保证蔬菜和蛋白质。",
            "高油高糖加餐（奶茶、甜点、油炸）改为每周 1-2 次，平日用无糖饮品替代。",
            common,
        ]
    elif delta < -200:
        lines = [
            "当前热量缺口偏大，建议每餐补一点优质主食（如米饭/全麦/土豆）。",
            "蛋白质可提高到每餐 1 掌心（鸡蛋、鱼虾、瘦肉、豆制品），减少肌肉流失风险。",
            common,
        ]
    else:
        lines = [
            "当前热量控制较稳，继续保持三餐规律和固定进餐时间。",
            "每餐维持“半盘蔬菜+掌心蛋白+适量主食”的结构，便于长期坚持。",
            common,
        ]

    return {
        "advice": "\n".join(lines)
    }
