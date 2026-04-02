CALORIE_PER_100G = {
    "米饭": 116,
    "面条": 137,
    "馒头": 223,
    "面包": 265,
    "燕麦": 389,
    "鸡蛋": 144,
    "鸡胸肉": 165,
    "鸡腿肉": 215,
    "牛肉": 250,
    "瘦猪肉": 143,
    "猪肉": 250,
    "鱼肉": 130,
    "三文鱼": 208,
    "虾": 99,
    "豆腐": 81,
    "豆浆": 31,
    "牛奶": 54,
    "酸奶": 72,
    "奶酪": 328,
    "西兰花": 34,
    "菠菜": 24,
    "生菜": 15,
    "黄瓜": 16,
    "番茄": 18,
    "土豆": 77,
    "红薯": 86,
    "玉米": 96,
    "苹果": 53,
    "香蕉": 93,
    "橙子": 47,
    "葡萄": 45,
    "坚果": 600,
    "花生": 567,
    "核桃": 654,
    "薯片": 536,
    "炸鸡": 260,
    "汉堡": 250,
    "披萨": 266,
    "香肠": 300,
    "火腿": 212,
    "方便面": 470,
    "蛋炒饭": 180,
    "炒面": 170,
    "麻婆豆腐": 140,
    "宫保鸡丁": 190,
    "红烧肉": 350,
    "青菜": 25,
    "白粥": 46,
    "奶茶": 80,
    "可乐": 43,
    "果汁": 45,
}

ALIASES = [
    ("鸡胸", "鸡胸肉"),
    ("鸡蛋", "鸡蛋"),
    ("水煮蛋", "鸡蛋"),
    ("米饭", "米饭"),
    ("白米饭", "米饭"),
    ("牛奶", "牛奶"),
    ("酸奶", "酸奶"),
    ("豆腐", "豆腐"),
    ("豆浆", "豆浆"),
    ("鸡腿", "鸡腿肉"),
    ("瘦肉", "瘦猪肉"),
    ("猪肉", "猪肉"),
    ("牛肉", "牛肉"),
    ("鱼", "鱼肉"),
    ("三文鱼", "三文鱼"),
    ("虾", "虾"),
    ("青菜", "青菜"),
    ("西兰花", "西兰花"),
    ("生菜", "生菜"),
    ("黄瓜", "黄瓜"),
    ("番茄", "番茄"),
    ("西红柿", "番茄"),
    ("土豆", "土豆"),
    ("红薯", "红薯"),
    ("地瓜", "红薯"),
    ("苹果", "苹果"),
    ("香蕉", "香蕉"),
    ("橙", "橙子"),
    ("面条", "面条"),
    ("炒面", "炒面"),
    ("馒头", "馒头"),
    ("面包", "面包"),
    ("燕麦", "燕麦"),
    ("白粥", "白粥"),
    ("粥", "白粥"),
    ("奶茶", "奶茶"),
    ("可乐", "可乐"),
    ("果汁", "果汁"),
    ("坚果", "坚果"),
    ("花生", "花生"),
    ("核桃", "核桃"),
    ("薯片", "薯片"),
    ("炸鸡", "炸鸡"),
    ("汉堡", "汉堡"),
    ("披萨", "披萨"),
    ("香肠", "香肠"),
    ("火腿", "火腿"),
    ("方便面", "方便面"),
    ("蛋炒饭", "蛋炒饭"),
    ("麻婆豆腐", "麻婆豆腐"),
    ("宫保鸡丁", "宫保鸡丁"),
    ("红烧肉", "红烧肉"),
    ("egg", "鸡蛋"),
    ("milk", "牛奶"),
    ("yogurt", "酸奶"),
    ("tofu", "豆腐"),
    ("soy milk", "豆浆"),
    ("rice", "米饭"),
    ("bread", "面包"),
    ("oat", "燕麦"),
    ("chicken breast", "鸡胸肉"),
    ("chicken", "鸡腿肉"),
    ("beef", "牛肉"),
    ("pork", "猪肉"),
    ("fish", "鱼肉"),
    ("salmon", "三文鱼"),
    ("shrimp", "虾"),
    ("broccoli", "西兰花"),
    ("spinach", "菠菜"),
    ("lettuce", "生菜"),
    ("cucumber", "黄瓜"),
    ("tomato", "番茄"),
    ("potato", "土豆"),
    ("sweet potato", "红薯"),
    ("apple", "苹果"),
    ("banana", "香蕉"),
    ("orange", "橙子"),
    ("juice", "果汁"),
    ("cola", "可乐"),
    ("burger", "汉堡"),
    ("pizza", "披萨"),
    ("sausage", "香肠"),
]

DEFAULT_KCAL_100G = 150


def _to_float(v, default=0.0):
    try:
        return float(v)
    except Exception:
        return default


def _fmt_grams(grams):
    if abs(grams - int(grams)) < 1e-9:
        return str(int(grams))
    return f"{grams:.1f}"


def _lookup_kcal(food_name):
    name = str(food_name or "").strip()
    if not name:
        return "未知食物", DEFAULT_KCAL_100G, False

    if name in CALORIE_PER_100G:
        return name, CALORIE_PER_100G[name], True

    for alias, canonical in ALIASES:
        if alias in name:
            return canonical, CALORIE_PER_100G[canonical], True

    for canonical, kcal in CALORIE_PER_100G.items():
        if canonical in name:
            return canonical, kcal, True

    return name, DEFAULT_KCAL_100G, False


def calc_meal(items):
    result_items = []
    total = 0

    for item in items or []:
        raw_name = str(item.get("name", "")).strip()
        grams = _to_float(item.get("grams", 0), 0.0)
        estimated = bool(item.get("estimated", False))
        if not raw_name or grams <= 0:
            continue

        canonical, kcal_100g, matched = _lookup_kcal(raw_name)
        kcal = int(round(grams * kcal_100g / 100.0))
        total += kcal

        result_items.append(
            {
                "name": raw_name,
                "canonical_name": canonical,
                "grams": round(grams, 1),
                "kcal_per_100g": kcal_100g,
                "kcal": kcal,
                "estimated": estimated,
                "matched_db": matched,
            }
        )

    if not result_items:
        summary = "无"
    else:
        parts = []
        for x in result_items:
            est_tag = "(估)" if x["estimated"] else ""
            parts.append(f"{x['name']}{_fmt_grams(x['grams'])}g({x['kcal']} kcal){est_tag}")
        summary = "、".join(parts)

    return result_items, total, summary


def main(**args):
    breakfast_items, breakfast_total, breakfast_summary = calc_meal(args.get("breakfast_final_items") or [])
    lunch_items, lunch_total, lunch_summary = calc_meal(args.get("lunch_final_items") or [])
    dinner_items, dinner_total, dinner_summary = calc_meal(args.get("dinner_final_items") or [])

    intake_total = int(breakfast_total + lunch_total + dinner_total)

    return {
        "breakfast_items_detail": breakfast_items,
        "lunch_items_detail": lunch_items,
        "dinner_items_detail": dinner_items,
        "breakfast_kcal": int(breakfast_total),
        "lunch_kcal": int(lunch_total),
        "dinner_kcal": int(dinner_total),
        "breakfast_summary": breakfast_summary,
        "lunch_summary": lunch_summary,
        "dinner_summary": dinner_summary,
        "intake_total": intake_total,
    }
