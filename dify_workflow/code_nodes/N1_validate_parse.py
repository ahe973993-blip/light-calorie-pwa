import re

ACTIVITY_MAP = {
    "久坐": 1.2,
    "sedentary": 1.2,
    "轻量活动": 1.375,
    "light": 1.375,
    "中等活动": 1.55,
    "moderate": 1.55,
    "高强度活动": 1.725,
    "active": 1.725,
    "极高活动": 1.9,
    "very_active": 1.9,
}

GENDER_MAP = {
    "男": ("男", "male"),
    "male": ("男", "male"),
    "m": ("男", "male"),
    "女": ("女", "female"),
    "female": ("女", "female"),
    "f": ("女", "female"),
}


def _to_float(value):
    try:
        return float(str(value).strip())
    except Exception:
        return None


def _has_file_input(value):
    if value is None:
        return False
    if isinstance(value, list):
        return len(value) > 0
    if isinstance(value, dict):
        return True
    text = str(value).strip()
    return text != ""


def _clean_name(name):
    cleaned = re.sub(r"[()（）\[\]【】:：]+", "", str(name)).strip()
    cleaned = re.sub(r"\s+", "", cleaned)
    return cleaned


def parse_meal_text(text):
    if text is None:
        return []

    raw = str(text)
    normalized = (
        raw.replace("，", ",")
        .replace("；", ";")
        .replace("、", ",")
        .replace("。", ",")
        .replace("\t", " ")
    )

    parts = [p.strip() for p in re.split(r"[,;\n]+", normalized) if p.strip()]
    items = []

    for part in parts:
        match_1 = re.search(r"^([^\d]+?)\s*(\d+(?:\.\d+)?)\s*(?:g|G|克)?$", part)
        match_2 = re.search(r"^(\d+(?:\.\d+)?)\s*(?:g|G|克)\s*([^\d]+)$", part)

        if match_1:
            name = _clean_name(match_1.group(1))
            grams = _to_float(match_1.group(2))
        elif match_2:
            name = _clean_name(match_2.group(2))
            grams = _to_float(match_2.group(1))
        else:
            continue

        if not name or grams is None:
            continue
        if grams <= 0 or grams > 3000:
            continue

        items.append({"name": name, "grams": round(grams, 1), "estimated": False})

    merged = {}
    for item in items:
        key = item["name"]
        if key not in merged:
            merged[key] = {"name": key, "grams": 0.0, "estimated": False}
        merged[key]["grams"] += item["grams"]

    return [{"name": v["name"], "grams": round(v["grams"], 1), "estimated": False} for v in merged.values()]


def main(**args):
    height = _to_float(args.get("height_cm"))
    weight = _to_float(args.get("weight_kg"))
    age = _to_float(args.get("age"))

    gender_raw = str(args.get("gender", "")).strip().lower()
    activity_raw = str(args.get("activity_level", "")).strip().lower()

    gender_cn, gender_en = GENDER_MAP.get(gender_raw, ("", ""))
    activity_factor = ACTIVITY_MAP.get(activity_raw)

    breakfast = parse_meal_text(args.get("breakfast_items", ""))
    lunch = parse_meal_text(args.get("lunch_items", ""))
    dinner = parse_meal_text(args.get("dinner_items", ""))
    breakfast_image = args.get("breakfast_image")
    lunch_image = args.get("lunch_image")
    dinner_image = args.get("dinner_image")

    errors = []
    if height is None or not (120 <= height <= 230):
        errors.append("身高请输入 120-230 cm 的数字")
    if weight is None or not (25 <= weight <= 300):
        errors.append("体重请输入 25-300 kg 的数字")
    if age is None or not (10 <= age <= 100):
        errors.append("年龄请输入 10-100 岁的数字")
    if not gender_en:
        errors.append("性别请输入 男/女")
    if activity_factor is None:
        errors.append("活动水平无效，请从预设选项选择")
    if not _has_file_input(breakfast_image):
        errors.append("请上传早餐图片")
    if not _has_file_input(lunch_image):
        errors.append("请上传午餐图片")
    if not _has_file_input(dinner_image):
        errors.append("请上传晚餐图片")
    if not (breakfast or lunch or dinner):
        errors.append("请至少输入一餐食物及克重")

    return {
        "valid": len(errors) == 0,
        "valid_flag": "true" if len(errors) == 0 else "false",
        "error_msg": "；".join(errors),
        "height_cm": round(height, 1) if height is not None else None,
        "weight_kg": round(weight, 1) if weight is not None else None,
        "age": int(age) if age is not None else None,
        "gender_cn": gender_cn,
        "gender_en": gender_en,
        "activity_factor": activity_factor,
        "breakfast_user_items": breakfast,
        "lunch_user_items": lunch,
        "dinner_user_items": dinner,
    }
